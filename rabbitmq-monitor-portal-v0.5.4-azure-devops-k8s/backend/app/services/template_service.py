from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.audit.service import create_audit_log
from app.models.cluster import RabbitMQCluster
from app.models.component import RabbitMQQueue
from app.models.monitor_template import MonitorTemplate, QueueMonitorTemplate
from app.schemas.monitor_template import (
    MonitorTemplateCreate,
    MonitorTemplateUpdate,
    QueueMonitorTemplateCreate,
    QueueMonitorTemplateUpdate,
)


def list_templates(
    db: Session,
    component_type: str | None = None,
    *,
    active_only: bool = False,
    search: str | None = None,
) -> list[MonitorTemplate]:
    stmt = select(MonitorTemplate).order_by(MonitorTemplate.name)
    if component_type:
        stmt = stmt.where(MonitorTemplate.component_type == component_type)
    if active_only:
        stmt = stmt.where(MonitorTemplate.is_active.is_(True))
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            (MonitorTemplate.name.like(like))
            | (MonitorTemplate.code.like(like))
            | (MonitorTemplate.monitor_kind.like(like))
        )
    return list(db.scalars(stmt).all())


def get_template(db: Session, template_id: int) -> MonitorTemplate:
    template = db.get(MonitorTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    return template


def template_snapshot(template: MonitorTemplate) -> dict[str, Any]:
    return {
        "id": template.id,
        "code": template.code,
        "name": template.name,
        "description": template.description,
        "component_type": template.component_type,
        "monitor_kind": template.monitor_kind,
        "default_config": template.default_config,
        "datadog_monitor_type": template.datadog_monitor_type,
        "datadog_query_template": template.datadog_query_template,
        "datadog_message_template": template.datadog_message_template,
        "datadog_tags_template": template.datadog_tags_template,
        "datadog_options": template.datadog_options,
        "is_system": template.is_system,
        "is_active": template.is_active,
    }


def create_template(db: Session, payload: MonitorTemplateCreate) -> MonitorTemplate:
    template = MonitorTemplate(**payload.model_dump(), is_system=False)
    db.add(template)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=f'O código de template "{payload.code}" já está em uso.') from exc

    create_audit_log(
        db,
        entity_type="monitor_template",
        entity_id=template.id,
        action="created",
        summary=f"Template {template.name} criado",
        after_data=template_snapshot(template),
    )
    db.commit()
    db.refresh(template)
    return template


def update_template(db: Session, template_id: int, payload: MonitorTemplateUpdate) -> MonitorTemplate:
    template = get_template(db, template_id)
    before = template_snapshot(template)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(template, field, value)

    create_audit_log(
        db,
        entity_type="monitor_template",
        entity_id=template.id,
        action="updated",
        summary=f"Template {template.name} atualizado",
        before_data=before,
        after_data=template_snapshot(template),
    )
    db.commit()
    db.refresh(template)
    return template


def deactivate_template(db: Session, template_id: int) -> MonitorTemplate:
    template = get_template(db, template_id)
    before = template_snapshot(template)
    template.is_active = False
    create_audit_log(
        db,
        entity_type="monitor_template",
        entity_id=template.id,
        action="deactivated",
        summary=f"Template {template.name} desativado",
        before_data=before,
        after_data=template_snapshot(template),
    )
    db.commit()
    db.refresh(template)
    return template


def reactivate_template(db: Session, template_id: int) -> MonitorTemplate:
    template = get_template(db, template_id)
    before = template_snapshot(template)
    template.is_active = True
    create_audit_log(
        db,
        entity_type="monitor_template",
        entity_id=template.id,
        action="reactivated",
        summary=f"Template {template.name} reativado",
        before_data=before,
        after_data=template_snapshot(template),
    )
    db.commit()
    db.refresh(template)
    return template


def delete_template(db: Session, template_id: int) -> None:
    template = get_template(db, template_id)
    usage_count = db.scalar(
        select(func.count(QueueMonitorTemplate.id)).where(QueueMonitorTemplate.template_id == template_id)
    ) or 0
    if usage_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f'Não é possível remover fisicamente o template "{template.name}" porque ele está aplicado em '
                f"{usage_count} queue(s). Desative o template para impedir novas aplicações."
            ),
        )
    if template.is_system:
        raise HTTPException(status_code=409, detail="Templates de sistema não podem ser removidos fisicamente; desative o template.")

    before = template_snapshot(template)
    db.delete(template)
    create_audit_log(
        db,
        entity_type="monitor_template",
        entity_id=template_id,
        action="deleted",
        summary=f"Template {template.name} removido",
        before_data=before,
    )
    db.commit()


def get_template_usage(db: Session, template_id: int) -> dict[str, Any]:
    template = get_template(db, template_id)
    bindings = db.scalars(
        select(QueueMonitorTemplate)
        .where(QueueMonitorTemplate.template_id == template.id)
        .options(
            selectinload(QueueMonitorTemplate.queue).selectinload(RabbitMQQueue.cluster),
            selectinload(QueueMonitorTemplate.template),
        )
        .order_by(QueueMonitorTemplate.id.desc())
    ).all()

    queues = []
    enabled = disabled = customized = inherited = active_queues = removed_queues = 0
    for binding in bindings:
        queue = binding.queue
        cluster = queue.cluster if queue else None
        is_customized = bool(binding.overrides)
        enabled += 1 if binding.enabled else 0
        disabled += 0 if binding.enabled else 1
        customized += 1 if is_customized else 0
        inherited += 0 if is_customized else 1
        removed_queues += 1 if queue and queue.is_removed else 0
        active_queues += 1 if queue and not queue.is_removed else 0
        queues.append(
            {
                "binding_id": binding.id,
                "queue_id": binding.queue_id,
                "queue_name": queue.name if queue else "<queue removida>",
                "vhost": queue.vhost if queue else "-",
                "cluster_id": queue.cluster_id if queue else 0,
                "cluster_name": cluster.name if cluster else "-",
                "enabled": binding.enabled,
                "is_customized": is_customized,
                "overrides": binding.overrides or None,
                "is_removed": bool(queue.is_removed) if queue else True,
            }
        )

    return {
        "template_id": template.id,
        "total_bindings": len(bindings),
        "enabled_bindings": enabled,
        "disabled_bindings": disabled,
        "customized_bindings": customized,
        "inherited_bindings": inherited,
        "active_queues": active_queues,
        "removed_queues": removed_queues,
        "queues": queues,
    }


def preview_template_impact(db: Session, template_id: int, new_default_config: dict[str, Any]) -> dict[str, Any]:
    template = get_template(db, template_id)
    current = template.default_config or {}
    new = new_default_config or {}
    current_keys = set(current.keys())
    new_keys = set(new.keys())
    changed_keys = sorted([key for key in current_keys & new_keys if current.get(key) != new.get(key)])
    removed_keys = sorted(current_keys - new_keys)
    added_keys = sorted(new_keys - current_keys)
    relevant_changed_keys = set(changed_keys + removed_keys + added_keys)

    bindings = db.scalars(select(QueueMonitorTemplate).where(QueueMonitorTemplate.template_id == template.id)).all()
    inherited_bindings = 0
    customized_bindings = 0
    affected_inherited = 0
    protected_by_override = 0

    for binding in bindings:
        overrides = binding.overrides or {}
        if overrides:
            customized_bindings += 1
            if relevant_changed_keys and any(key in overrides for key in relevant_changed_keys):
                protected_by_override += 1
        else:
            inherited_bindings += 1
            if relevant_changed_keys:
                affected_inherited += 1

    return {
        "template_id": template.id,
        "changed_keys": changed_keys,
        "removed_keys": removed_keys,
        "added_keys": added_keys,
        "total_bindings": len(bindings),
        "inherited_bindings": inherited_bindings,
        "customized_bindings": customized_bindings,
        "affected_inherited_bindings": affected_inherited,
        "protected_by_override_bindings": protected_by_override,
    }


def apply_default_queue_templates(db: Session, queue: RabbitMQQueue) -> None:
    """Legacy helper kept for compatibility.

    The portal now applies queue templates explicitly through the queue screen.
    Dynamic inheritance is implemented by keeping only overrides in the binding;
    the effective config always starts from the current template default_config.
    """
    return None


def _get_queue(db: Session, queue_id: int) -> RabbitMQQueue:
    queue = db.get(RabbitMQQueue, queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Queue não encontrada")
    return queue


def _get_queue_binding(db: Session, queue_id: int, binding_id: int) -> QueueMonitorTemplate:
    binding = db.scalar(
        select(QueueMonitorTemplate)
        .where(QueueMonitorTemplate.id == binding_id, QueueMonitorTemplate.queue_id == queue_id)
        .options(selectinload(QueueMonitorTemplate.template))
    )
    if not binding:
        raise HTTPException(status_code=404, detail="Template aplicado não encontrado para esta queue")
    return binding


def _get_queue_template(db: Session, template_id: int) -> MonitorTemplate:
    template = db.get(MonitorTemplate, template_id)
    if not template or template.component_type != "queue" or not template.is_active:
        raise HTTPException(status_code=404, detail="Template de queue não encontrado ou inativo")
    return template


def merge_effective_config(template: MonitorTemplate, overrides: dict[str, Any] | None) -> dict[str, Any]:
    config = dict(template.default_config or {})
    if overrides:
        for key, value in overrides.items():
            if value is not None:
                config[key] = value
    return config


def serialize_queue_template_binding(binding: QueueMonitorTemplate) -> dict[str, Any]:
    template = binding.template
    return {
        "id": binding.id,
        "queue_id": binding.queue_id,
        "template_id": binding.template_id,
        "enabled": binding.enabled,
        "overrides": binding.overrides or None,
        "effective_config": merge_effective_config(template, binding.overrides),
        "template": template,
        "created_at": binding.created_at,
        "updated_at": binding.updated_at,
    }


def list_queue_template_bindings(db: Session, queue_id: int) -> list[dict[str, Any]]:
    _get_queue(db, queue_id)
    bindings = db.scalars(
        select(QueueMonitorTemplate)
        .where(QueueMonitorTemplate.queue_id == queue_id)
        .options(selectinload(QueueMonitorTemplate.template))
        .join(QueueMonitorTemplate.template)
        .order_by(MonitorTemplate.name)
    ).all()
    return [serialize_queue_template_binding(binding) for binding in bindings]


def add_queue_template_binding(db: Session, queue_id: int, payload: QueueMonitorTemplateCreate) -> dict[str, Any]:
    queue = _get_queue(db, queue_id)
    template = _get_queue_template(db, payload.template_id)
    binding = QueueMonitorTemplate(
        queue_id=queue.id,
        template_id=template.id,
        enabled=payload.enabled,
        overrides=payload.overrides or None,
    )
    db.add(binding)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Este template já está aplicado nesta queue.") from exc

    db.refresh(binding)
    binding.template = template
    create_audit_log(
        db,
        entity_type="queue_template",
        entity_id=binding.id,
        action="created",
        summary=f"Template {template.name} aplicado na queue {queue.vhost}/{queue.name}",
        after_data={
            "queue_id": queue.id,
            "template_id": template.id,
            "enabled": binding.enabled,
            "overrides": binding.overrides,
            "effective_config": merge_effective_config(template, binding.overrides),
        },
    )
    db.commit()
    binding = _get_queue_binding(db, queue_id, binding.id)
    return serialize_queue_template_binding(binding)


def update_queue_template_binding(db: Session, queue_id: int, binding_id: int, payload: QueueMonitorTemplateUpdate) -> dict[str, Any]:
    binding = _get_queue_binding(db, queue_id, binding_id)
    before = serialize_queue_template_binding(binding)
    data = payload.model_dump(exclude_unset=True)
    if "enabled" in data:
        binding.enabled = data["enabled"]
    if "overrides" in data:
        binding.overrides = data["overrides"] or None

    db.flush()
    create_audit_log(
        db,
        entity_type="queue_template",
        entity_id=binding.id,
        action="updated",
        summary=f"Template aplicado {binding.template.name} atualizado na queue {binding.queue_id}",
        before_data={
            "enabled": before["enabled"],
            "overrides": before["overrides"],
            "effective_config": before["effective_config"],
        },
        after_data={
            "enabled": binding.enabled,
            "overrides": binding.overrides,
            "effective_config": merge_effective_config(binding.template, binding.overrides),
        },
    )
    db.commit()
    binding = _get_queue_binding(db, queue_id, binding_id)
    return serialize_queue_template_binding(binding)


def delete_queue_template_binding(db: Session, queue_id: int, binding_id: int) -> None:
    binding = _get_queue_binding(db, queue_id, binding_id)
    before = serialize_queue_template_binding(binding)
    db.delete(binding)
    create_audit_log(
        db,
        entity_type="queue_template",
        entity_id=binding_id,
        action="deleted",
        summary=f"Template {binding.template.name} removido da queue {queue_id}",
        before_data={
            "queue_id": queue_id,
            "template_id": binding.template_id,
            "enabled": before["enabled"],
            "overrides": before["overrides"],
            "effective_config": before["effective_config"],
        },
    )
    db.commit()
