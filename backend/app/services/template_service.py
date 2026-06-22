from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.audit.service import create_audit_log
from app.models.component import RabbitMQQueue
from app.models.monitor_template import MonitorTemplate, QueueMonitorTemplate
from app.schemas.monitor_template import QueueMonitorTemplateCreate, QueueMonitorTemplateUpdate


def list_templates(db: Session, component_type: str | None = None) -> list[MonitorTemplate]:
    stmt = select(MonitorTemplate).order_by(MonitorTemplate.name)
    if component_type:
        stmt = stmt.where(MonitorTemplate.component_type == component_type)
    return list(db.scalars(stmt).all())


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
