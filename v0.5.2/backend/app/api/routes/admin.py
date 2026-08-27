from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import IntegrityError

from app.audit.service import create_audit_log
from app.core.database import get_db
from app.core.security import decrypt_secret, encrypt_secret
from app.models.cluster import RabbitMQCluster
from app.models.datadog_org import DatadogOrg
from app.models.sre_group import SREGroup, SREGroupMember
from app.providers.datadog.client import test_datadog_credentials
from app.schemas.admin import (
    DatadogOrgCreate,
    DatadogOrgRead,
    DatadogOrgUpdate,
    SREGroupCreate,
    SREGroupRead,
    SREGroupUpdate,
)

router = APIRouter()


def _sre_options():
    return [selectinload(SREGroup.members)]


def _replace_group_members(db: Session, group: SREGroup, emails: list[str]) -> None:
    for item in list(group.members):
        db.delete(item)
    db.flush()

    for index, email in enumerate(emails):
        db.add(SREGroupMember(sre_group_id=group.id, email=email.lower(), position=index))


def _group_snapshot(group: SREGroup) -> dict:
    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "is_active": group.is_active,
        "member_emails": [member.email for member in group.members],
    }


def _active_cluster_names_using_sre_group(db: Session, group_id: int) -> list[str]:
    return list(
        db.scalars(
            select(RabbitMQCluster.name)
            .where(RabbitMQCluster.sre_group_id == group_id, RabbitMQCluster.is_active.is_(True))
            .order_by(RabbitMQCluster.name)
        ).all()
    )


def _active_cluster_names_using_datadog_org(db: Session, org_id: int) -> list[str]:
    return list(
        db.scalars(
            select(RabbitMQCluster.name)
            .where(RabbitMQCluster.datadog_org_id == org_id, RabbitMQCluster.is_active.is_(True))
            .order_by(RabbitMQCluster.name)
        ).all()
    )


def _blocked_delete_message(entity_label: str, cluster_names: list[str]) -> str:
    clusters = ", ".join(cluster_names)
    return f"Não foi possível remover {entity_label} porque está em uso nos seguintes clusters ativos: {clusters}."


@router.get("/sre-groups", response_model=list[SREGroupRead])
def list_sre_groups(db: Session = Depends(get_db)):
    return db.scalars(select(SREGroup).options(*_sre_options()).order_by(SREGroup.name)).all()


@router.post("/sre-groups", response_model=SREGroupRead, status_code=201)
def create_sre_group(payload: SREGroupCreate, db: Session = Depends(get_db)):
    group = SREGroup(name=payload.name, description=payload.description, is_active=payload.is_active)
    db.add(group)
    db.flush()
    _replace_group_members(db, group, [str(email) for email in payload.member_emails])
    db.flush()
    db.expire(group, ["members"])

    create_audit_log(
        db,
        entity_type="sre_group",
        entity_id=group.id,
        action="created",
        summary=f"Grupo SRE {group.name} criado",
        after_data=_group_snapshot(group),
    )
    db.commit()
    return db.scalar(select(SREGroup).where(SREGroup.id == group.id).options(*_sre_options()))


@router.put("/sre-groups/{group_id}", response_model=SREGroupRead)
def update_sre_group(group_id: int, payload: SREGroupUpdate, db: Session = Depends(get_db)):
    group = db.scalar(select(SREGroup).where(SREGroup.id == group_id).options(*_sre_options()))
    if not group:
        raise HTTPException(status_code=404, detail="Grupo SRE não encontrado")

    before = _group_snapshot(group)
    data = payload.model_dump(exclude_unset=True)
    emails = data.pop("member_emails", None)

    for field, value in data.items():
        setattr(group, field, value)

    if emails is not None:
        _replace_group_members(db, group, [str(email) for email in emails])
        db.flush()
        db.expire(group, ["members"])

    create_audit_log(
        db,
        entity_type="sre_group",
        entity_id=group.id,
        action="updated",
        summary=f"Grupo SRE {group.name} atualizado",
        before_data=before,
        after_data=_group_snapshot(group),
    )
    db.commit()
    return db.scalar(select(SREGroup).where(SREGroup.id == group.id).options(*_sre_options()))


@router.delete("/sre-groups/{group_id}", status_code=204)
def delete_sre_group(group_id: int, db: Session = Depends(get_db)):
    group = db.scalar(select(SREGroup).where(SREGroup.id == group_id).options(*_sre_options()))
    if not group:
        raise HTTPException(status_code=404, detail="Grupo SRE não encontrado")

    blocking_clusters = _active_cluster_names_using_sre_group(db, group.id)
    if blocking_clusters:
        raise HTTPException(status_code=409, detail=_blocked_delete_message(f'o grupo SRE "{group.name}"', blocking_clusters))

    before = _group_snapshot(group)
    create_audit_log(
        db,
        entity_type="sre_group",
        entity_id=group.id,
        action="deleted",
        summary=f"Grupo SRE {group.name} removido",
        before_data=before,
    )
    db.delete(group)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Não foi possível remover o grupo SRE porque ele está vinculado a outros registros.") from exc
    return Response(status_code=204)


@router.get("/datadog-orgs", response_model=list[DatadogOrgRead])
def list_datadog_orgs(db: Session = Depends(get_db)):
    return db.scalars(select(DatadogOrg).order_by(DatadogOrg.name)).all()


@router.post("/datadog-orgs", response_model=DatadogOrgRead, status_code=201)
async def create_datadog_org(payload: DatadogOrgCreate, db: Session = Depends(get_db)):
    validation = await test_datadog_credentials(payload.api_url, payload.api_key, payload.app_key)
    org = DatadogOrg(
        name=payload.name,
        api_url=payload.api_url.rstrip("/"),
        org_url=payload.org_url,
        api_key_encrypted=encrypt_secret(payload.api_key),
        app_key_encrypted=encrypt_secret(payload.app_key),
        description=payload.description,
        is_active=payload.is_active,
    )
    db.add(org)
    db.flush()
    create_audit_log(
        db,
        entity_type="datadog_org",
        entity_id=org.id,
        action="created",
        summary=f"Datadog Org {org.name} criada após validação da API",
        after_data={"name": org.name, "api_url": org.api_url, "org_url": org.org_url, "validation": validation},
    )
    db.commit()
    db.refresh(org)
    return org


@router.put("/datadog-orgs/{org_id}", response_model=DatadogOrgRead)
async def update_datadog_org(org_id: int, payload: DatadogOrgUpdate, db: Session = Depends(get_db)):
    org = db.get(DatadogOrg, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Datadog Org não encontrada")

    before = {
        "name": org.name,
        "api_url": org.api_url,
        "org_url": org.org_url,
        "is_active": org.is_active,
        "has_credentials": org.has_credentials,
    }
    data = payload.model_dump(exclude_unset=True)
    api_key = data.pop("api_key", None)
    app_key = data.pop("app_key", None)

    next_api_url = (data.get("api_url") or org.api_url).rstrip("/")
    next_api_key = api_key or decrypt_secret(org.api_key_encrypted or "")
    next_app_key = app_key or decrypt_secret(org.app_key_encrypted or "")

    if api_key or app_key or "api_url" in data:
        if not next_api_key or not next_app_key:
            raise HTTPException(status_code=400, detail="Informe API key e APP key para validar a Datadog Org.")
        await test_datadog_credentials(next_api_url, next_api_key, next_app_key)

    for field, value in data.items():
        if field == "api_url" and value:
            value = value.rstrip("/")
        setattr(org, field, value)

    if api_key:
        org.api_key_encrypted = encrypt_secret(api_key)
    if app_key:
        org.app_key_encrypted = encrypt_secret(app_key)

    create_audit_log(
        db,
        entity_type="datadog_org",
        entity_id=org.id,
        action="updated",
        summary=f"Datadog Org {org.name} atualizada",
        before_data=before,
        after_data={"name": org.name, "api_url": org.api_url, "org_url": org.org_url, "is_active": org.is_active, "has_credentials": org.has_credentials},
    )
    db.commit()
    db.refresh(org)
    return org

@router.delete("/datadog-orgs/{org_id}", status_code=204)
def delete_datadog_org(org_id: int, db: Session = Depends(get_db)):
    org = db.get(DatadogOrg, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Datadog Org não encontrada")

    blocking_clusters = _active_cluster_names_using_datadog_org(db, org.id)
    if blocking_clusters:
        raise HTTPException(status_code=409, detail=_blocked_delete_message(f'a Datadog Org "{org.name}"', blocking_clusters))

    before = {
        "id": org.id,
        "name": org.name,
        "api_url": org.api_url,
        "org_url": org.org_url,
        "description": org.description,
        "is_active": org.is_active,
        "has_credentials": org.has_credentials,
    }
    create_audit_log(
        db,
        entity_type="datadog_org",
        entity_id=org.id,
        action="deleted",
        summary=f"Datadog Org {org.name} removida",
        before_data=before,
    )
    db.delete(org)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Não foi possível remover a Datadog Org porque ela está vinculada a outros registros.") from exc
    return Response(status_code=204)

