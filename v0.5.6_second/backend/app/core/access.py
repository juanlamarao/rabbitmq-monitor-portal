from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.auth import is_admin
from app.models.access import EntraAccessGroup, EntraGroupCluster


def editable_clusters(db: Session, identity: dict) -> set[int]:
    if is_admin(identity):
        return set()  # Admin não precisa de lista
    group_ids = [v.lower() for v in identity.get('groups', [])]
    if not group_ids:
        return set()
    rows = db.scalars(select(EntraGroupCluster.cluster_id)
        .join(EntraAccessGroup,EntraAccessGroup.id==EntraGroupCluster.group_id)
        .where(EntraAccessGroup.object_id.in_(group_ids),EntraAccessGroup.is_active.is_(True),EntraAccessGroup.is_admin.is_(False))).all()
    return set(rows)


def can_edit_cluster(db: Session, identity: dict, cluster_id: int) -> bool:
    return is_admin(identity) or cluster_id in editable_clusters(db,identity)


def require_edit_cluster(db: Session, identity: dict, cluster_id: int):
    if not can_edit_cluster(db, identity, cluster_id):
        raise HTTPException(403, 'Usuário sem permissão de edição neste cluster.')
