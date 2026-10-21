from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.audit.service import create_audit_log
from app.models.cluster import RabbitMQCluster
from app.models.component import RabbitMQQueue
from app.models.monitor_template import MonitorTemplate, QueueMonitorTemplate
from app.schemas.bulk_actions import QueueBulkActionRequest, QueueBulkFilter, QueueBulkMetadataUpdate
from app.services.template_service import merge_effective_config


BULK_LIMIT = 5000


def _build_queue_stmt(filters: QueueBulkFilter):
    stmt = (
        select(RabbitMQQueue)
        .options(
            selectinload(RabbitMQQueue.cluster),
            selectinload(RabbitMQQueue.template_bindings).selectinload(QueueMonitorTemplate.template),
        )
        .order_by(RabbitMQQueue.cluster_id, RabbitMQQueue.vhost, RabbitMQQueue.name)
    )

    if filters.queue_ids:
        stmt = stmt.where(RabbitMQQueue.id.in_(filters.queue_ids))
    if filters.cluster_id:
        stmt = stmt.where(RabbitMQQueue.cluster_id == filters.cluster_id)
    if filters.removed_only:
        stmt = stmt.where(RabbitMQQueue.is_removed.is_(True))
    elif not filters.include_removed:
        stmt = stmt.where(RabbitMQQueue.is_removed.is_(False))
    if filters.search:
        like = f"%{filters.search}%"
        stmt = stmt.where(
            or_(
                RabbitMQQueue.name.like(like),
                RabbitMQQueue.vhost.like(like),
                RabbitMQQueue.service_name.like(like),
                RabbitMQQueue.journey.like(like),
                RabbitMQQueue.owner_email.like(like),
            )
        )
    if filters.vhost:
        stmt = stmt.where(RabbitMQQueue.vhost.like(f"%{filters.vhost}%"))
    if filters.criticality:
        stmt = stmt.where(RabbitMQQueue.criticality == filters.criticality)
    if filters.owner_email:
        stmt = stmt.where(RabbitMQQueue.owner_email.like(f"%{filters.owner_email}%"))
    if filters.service_name:
        stmt = stmt.where(RabbitMQQueue.service_name.like(f"%{filters.service_name}%"))
    if filters.template_id or filters.customized_only:
        template_filter = select(QueueMonitorTemplate.id).where(QueueMonitorTemplate.queue_id == RabbitMQQueue.id)
        if filters.template_id:
            template_filter = template_filter.where(QueueMonitorTemplate.template_id == filters.template_id)
        if filters.customized_only:
            template_filter = template_filter.where(QueueMonitorTemplate.overrides.is_not(None))
        stmt = stmt.where(template_filter.exists())
    return stmt


def _apply_python_filters(queues: list[RabbitMQQueue], filters: QueueBulkFilter) -> list[RabbitMQQueue]:
    if not filters.name_regex:
        return queues
    try:
        regex = re.compile(filters.name_regex)
    except re.error as exc:
        raise HTTPException(status_code=422, detail=f"Regex inválida: {exc}") from exc
    return [queue for queue in queues if regex.search(queue.name)]


def get_matching_queues(db: Session, filters: QueueBulkFilter, *, enforce_limit: bool = True) -> list[RabbitMQQueue]:
    queues = list(db.scalars(_build_queue_stmt(filters)).all())
    queues = _apply_python_filters(queues, filters)
    if enforce_limit and len(queues) > BULK_LIMIT:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A operação afetaria {len(queues)} queues. Refine os filtros ou selecione até {BULK_LIMIT} queues."
            ),
        )
    return queues


def _serialize_queue_preview(queue: RabbitMQQueue) -> dict[str, Any]:
    return {
        "id": queue.id,
        "cluster_id": queue.cluster_id,
        "cluster_name": queue.cluster.name if queue.cluster else None,
        "vhost": queue.vhost,
        "name": queue.name,
        "criticality": queue.criticality,
        "owner_email": queue.owner_email,
        "service_name": queue.service_name,
        "is_removed": queue.is_removed,
        "applied_templates": queue.applied_templates,
    }


def preview_bulk_queues(db: Session, filters: QueueBulkFilter) -> dict[str, Any]:
    queues = get_matching_queues(db, filters, enforce_limit=False)
    sample_limit = filters.sample_limit or 200
    sample = queues[:sample_limit]
    return {
        "matched_count": len(queues),
        "sample_count": len(sample),
        "sample_limit": sample_limit,
        "queues": [_serialize_queue_preview(queue) for queue in sample],
    }


def _get_template(db: Session, template_id: int | None, *, require_active: bool = False) -> MonitorTemplate:
    if not template_id:
        raise HTTPException(status_code=422, detail="template_id é obrigatório para esta ação.")
    template = db.get(MonitorTemplate, template_id)
    if not template or template.component_type != "queue":
        raise HTTPException(status_code=404, detail="Template de queue não encontrado.")
    if require_active and not template.is_active:
        raise HTTPException(status_code=409, detail="Template inativo não pode ser aplicado em massa.")
    return template


def _find_binding(queue: RabbitMQQueue, template_id: int) -> QueueMonitorTemplate | None:
    for binding in queue.template_bindings or []:
        if binding.template_id == template_id:
            return binding
    return None


def _metadata_snapshot(queue: RabbitMQQueue) -> dict[str, Any]:
    return {
        "description": queue.description,
        "criticality": queue.criticality,
        "owner_email": queue.owner_email,
        "journey": queue.journey,
        "service_name": queue.service_name,
        "monitoring_schedule": queue.monitoring_schedule,
        "monitoring_custom_window": queue.monitoring_custom_window,
        "dev_emails": queue.dev_emails,
    }


def _normalize_metadata(metadata: QueueBulkMetadataUpdate | None) -> dict[str, Any]:
    if not metadata:
        raise HTTPException(status_code=422, detail="metadata é obrigatório para update_metadata.")
    data = metadata.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=422, detail="Informe ao menos um campo de metadados para atualizar.")
    if "owner_email" in data and data["owner_email"] is not None:
        data["owner_email"] = str(data["owner_email"])
    if "dev_emails" in data and data["dev_emails"] is not None:
        data["dev_emails"] = [str(email) for email in data["dev_emails"]]
    return data


def apply_bulk_action(db: Session, payload: QueueBulkActionRequest) -> dict[str, Any]:
    queues = get_matching_queues(db, payload.filters, enforce_limit=True)
    errors: list[str] = []
    affected = 0
    skipped = 0
    details: dict[str, Any] = {}

    if payload.action == "update_metadata":
        data = _normalize_metadata(payload.metadata)
        details["metadata"] = data
        for queue in queues:
            before = _metadata_snapshot(queue)
            for field, value in data.items():
                setattr(queue, field, value)
            after = _metadata_snapshot(queue)
            if before == after:
                skipped += 1
                continue
            affected += 1
        summary = f"Edição em massa de metadados aplicada em {affected} queue(s)."
        create_audit_log(
            db,
            entity_type="queue_bulk_action",
            action="update_metadata",
            summary=summary,
            after_data={"matched_count": len(queues), "affected_count": affected, "metadata": data},
        )

    elif payload.action == "apply_template":
        template = _get_template(db, payload.template_id, require_active=True)
        details["template"] = {"id": template.id, "code": template.code, "name": template.name}
        for queue in queues:
            if _find_binding(queue, template.id):
                skipped += 1
                continue
            db.add(
                QueueMonitorTemplate(
                    queue_id=queue.id,
                    template_id=template.id,
                    enabled=True,
                    overrides=payload.overrides or None,
                )
            )
            affected += 1
        try:
            db.flush()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=409, detail="Conflito ao aplicar templates em massa.") from exc
        create_audit_log(
            db,
            entity_type="queue_bulk_action",
            action="apply_template",
            summary=f"Template {template.code} aplicado em massa em {affected} queue(s).",
            after_data={
                "matched_count": len(queues),
                "affected_count": affected,
                "skipped_count": skipped,
                "template_id": template.id,
                "overrides": payload.overrides or None,
            },
        )

    elif payload.action == "remove_template":
        template = _get_template(db, payload.template_id)
        details["template"] = {"id": template.id, "code": template.code, "name": template.name}
        for queue in queues:
            binding = _find_binding(queue, template.id)
            if not binding:
                skipped += 1
                continue
            db.delete(binding)
            affected += 1
        create_audit_log(
            db,
            entity_type="queue_bulk_action",
            action="remove_template",
            summary=f"Template {template.code} removido em massa de {affected} queue(s).",
            after_data={"matched_count": len(queues), "affected_count": affected, "skipped_count": skipped, "template_id": template.id},
        )

    elif payload.action == "update_template_overrides":
        template = _get_template(db, payload.template_id)
        overrides = payload.overrides or {}
        if not overrides:
            raise HTTPException(status_code=422, detail="overrides é obrigatório para customizar template em massa.")
        details["template"] = {"id": template.id, "code": template.code, "name": template.name}
        details["overrides"] = overrides
        for queue in queues:
            binding = _find_binding(queue, template.id)
            if not binding:
                skipped += 1
                continue
            current = dict(binding.overrides or {})
            current.update(overrides)
            binding.overrides = current or None
            affected += 1
        create_audit_log(
            db,
            entity_type="queue_bulk_action",
            action="update_template_overrides",
            summary=f"Overrides do template {template.code} atualizados em massa em {affected} queue(s).",
            after_data={
                "matched_count": len(queues),
                "affected_count": affected,
                "skipped_count": skipped,
                "template_id": template.id,
                "overrides": overrides,
            },
        )

    elif payload.action == "clear_template_overrides":
        template = _get_template(db, payload.template_id)
        details["template"] = {"id": template.id, "code": template.code, "name": template.name}
        for queue in queues:
            binding = _find_binding(queue, template.id)
            if not binding or not binding.overrides:
                skipped += 1
                continue
            binding.overrides = None
            affected += 1
        create_audit_log(
            db,
            entity_type="queue_bulk_action",
            action="clear_template_overrides",
            summary=f"Overrides do template {template.code} limpos em massa em {affected} queue(s).",
            after_data={"matched_count": len(queues), "affected_count": affected, "skipped_count": skipped, "template_id": template.id},
        )

    elif payload.action == "set_template_enabled":
        template = _get_template(db, payload.template_id)
        if payload.enabled is None:
            raise HTTPException(status_code=422, detail="enabled é obrigatório para habilitar/desabilitar template em massa.")
        details["template"] = {"id": template.id, "code": template.code, "name": template.name}
        details["enabled"] = payload.enabled
        for queue in queues:
            binding = _find_binding(queue, template.id)
            if not binding:
                skipped += 1
                continue
            if binding.enabled == payload.enabled:
                skipped += 1
                continue
            binding.enabled = payload.enabled
            affected += 1
        create_audit_log(
            db,
            entity_type="queue_bulk_action",
            action="set_template_enabled",
            summary=f"Template {template.code} {'habilitado' if payload.enabled else 'desabilitado'} em massa em {affected} queue(s).",
            after_data={
                "matched_count": len(queues),
                "affected_count": affected,
                "skipped_count": skipped,
                "template_id": template.id,
                "enabled": payload.enabled,
            },
        )

    else:
        raise HTTPException(status_code=422, detail="Ação em massa não suportada.")

    db.commit()
    return {
        "action": payload.action,
        "matched_count": len(queues),
        "affected_count": affected,
        "skipped_count": skipped,
        "errors": errors,
        "details": details,
    }
