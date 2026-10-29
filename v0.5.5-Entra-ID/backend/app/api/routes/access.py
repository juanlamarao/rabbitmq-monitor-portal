from fastapi import APIRouter, Depends, HTTPException
from uuid import UUID
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from app.audit.service import create_audit_log
from app.core.database import get_db
from app.models.access import EntraAccessGroup, EntraGroupCluster, PortalUser
from app.models.cluster import RabbitMQCluster

router=APIRouter()

class AccessGroupPayload(BaseModel):
    object_id: str = Field(min_length=36,max_length=64)
    name: str = Field(min_length=1,max_length=255)
    description: str | None = None
    is_admin: bool = False
    is_active: bool = True
    cluster_ids: list[int] = Field(default_factory=list)


def as_dict(group):
    return {'id':group.id,'object_id':group.object_id,'name':group.name,'description':group.description,
        'is_admin':group.is_admin,'is_active':group.is_active,'cluster_ids':sorted([c.cluster_id for c in group.clusters])}

@router.get('/groups')
def list_groups(db:Session=Depends(get_db)):
    return [as_dict(g) for g in db.scalars(select(EntraAccessGroup).options(selectinload(EntraAccessGroup.clusters)).order_by(EntraAccessGroup.name)).all()]

def check_clusters(db,ids):
    if len(ids)!=len(set(ids)):
        raise HTTPException(422,'Cluster repetido.')
    found = set(db.scalars(select(RabbitMQCluster.id).where(RabbitMQCluster.id.in_(ids))).all()) if ids else set()
    if found!=set(ids):
        raise HTTPException(422,'Existe cluster inexistente na associação.')

@router.post('/groups',status_code=201)
def add_group(payload:AccessGroupPayload, db:Session=Depends(get_db)):
    check_clusters(db,payload.cluster_ids)
    try: oid=str(UUID(payload.object_id))
    except ValueError: raise HTTPException(422,'Object ID precisa ser GUID válido.')
    if db.scalar(select(EntraAccessGroup).where(EntraAccessGroup.object_id==oid)):
        raise HTTPException(409,'Object ID do grupo já cadastrado.')
    group=EntraAccessGroup(object_id=oid,name=payload.name,description=payload.description,is_admin=payload.is_admin,is_active=payload.is_active)
    group.clusters=[EntraGroupCluster(cluster_id=i) for i in payload.cluster_ids] if not payload.is_admin else []
    db.add(group); db.flush()
    create_audit_log(db,entity_type='entra_access_group',entity_id=group.id,action='create',after_data=as_dict(group))
    db.commit()
    return as_dict(group)

@router.put('/groups/{group_id}')
def edit_group(group_id:int,payload:AccessGroupPayload,db:Session=Depends(get_db)):
    group=db.scalar(select(EntraAccessGroup).options(selectinload(EntraAccessGroup.clusters)).where(EntraAccessGroup.id==group_id))
    if group is None: raise HTTPException(404,'Grupo não encontrado.')
    check_clusters(db,payload.cluster_ids)
    try: oid=str(UUID(payload.object_id))
    except ValueError: raise HTTPException(422,'Object ID precisa ser GUID válido.')
    if group.object_id!=oid and db.scalar(select(EntraAccessGroup).where(EntraAccessGroup.object_id==oid)):
        raise HTTPException(409,'Object ID já cadastrado.')
    before=as_dict(group)
    group.object_id=oid; group.name=payload.name; group.description=payload.description
    group.is_admin=payload.is_admin; group.is_active=payload.is_active
    targets=set(payload.cluster_ids) if not payload.is_admin else set()
    for existing in list(group.clusters):
        if existing.cluster_id not in targets:
            group.clusters.remove(existing)
    current={item.cluster_id for item in group.clusters}
    for cluster_id in targets-current:
        group.clusters.append(EntraGroupCluster(cluster_id=cluster_id))
    db.flush()
    create_audit_log(db,entity_type='entra_access_group',entity_id=group.id,action='update',before_data=before,after_data=as_dict(group))
    db.commit()
    return as_dict(group)

@router.delete('/groups/{group_id}',status_code=204)
def delete_group(group_id:int,db:Session=Depends(get_db)):
    group=db.scalar(select(EntraAccessGroup).options(selectinload(EntraAccessGroup.clusters)).where(EntraAccessGroup.id==group_id))
    if group is None: raise HTTPException(404,'Grupo não encontrado.')
    before=as_dict(group)
    db.delete(group)
    create_audit_log(db,entity_type='entra_access_group',entity_id=group_id,action='delete',before_data=before)
    db.commit()

@router.get('/users')
def list_users(db:Session=Depends(get_db)):
    return [{'id':u.id,'email':u.email,'name':u.display_name,'last_login_at':u.last_login_at.isoformat() if u.last_login_at else None} for u in db.scalars(select(PortalUser).order_by(PortalUser.display_name).limit(500)).all()]
