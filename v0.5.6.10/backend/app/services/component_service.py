from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.audit.service import create_audit_log
from app.models.component import RabbitMQQueue
from app.models.monitor_template import QueueMonitorTemplate, MonitorTemplate
from app.models.generated_monitor import GeneratedMonitor
from app.schemas.component import QueueUpdate, QueueConfigurationSave


def list_queues(
    db: Session,
    *,
    cluster_id: int | None = None,
    include_removed: bool = False,
    removed_only: bool = False,
    search: str | None = None,
    template_id: int | None = None,
    customized_only: bool = False,
) -> list[RabbitMQQueue]:
    stmt = (
        select(RabbitMQQueue)
        .options(selectinload(RabbitMQQueue.template_bindings).selectinload(QueueMonitorTemplate.template),
                 selectinload(RabbitMQQueue.sync_ticket))
        .order_by(RabbitMQQueue.cluster_id, RabbitMQQueue.vhost, RabbitMQQueue.name)
    )
    if cluster_id:
        stmt = stmt.where(RabbitMQQueue.cluster_id == cluster_id)
    if removed_only:
        stmt = stmt.where(RabbitMQQueue.is_removed.is_(True))
    elif not include_removed:
        stmt = stmt.where(RabbitMQQueue.is_removed.is_(False))
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                RabbitMQQueue.name.like(like),
                RabbitMQQueue.vhost.like(like),
                RabbitMQQueue.service_name.like(like),
                RabbitMQQueue.journey.like(like),
            )
        )
    if template_id or customized_only:
        template_filter = select(QueueMonitorTemplate.id).where(QueueMonitorTemplate.queue_id == RabbitMQQueue.id)
        if template_id:
            template_filter = template_filter.where(QueueMonitorTemplate.template_id == template_id)
        if customized_only:
            template_filter = template_filter.where(QueueMonitorTemplate.overrides.is_not(None))
        stmt = stmt.where(template_filter.exists())
    return list(db.scalars(stmt).all())



def list_queues_page(
    db: Session, *, cluster_id: int, page: int = 1, page_size: int = 20,
    include_removed: bool = False, removed_only: bool = False,
    search: str | None = None, template_id: int | None = None,
    customized_only: bool = False,
) -> dict[str, Any]:
    """Server-side pagination. Filter/COUNT in MySQL; hydrate only one page."""
    query = select(RabbitMQQueue.id).where(RabbitMQQueue.cluster_id == cluster_id)
    if removed_only:
        query = query.where(RabbitMQQueue.is_removed.is_(True))
    elif not include_removed:
        query = query.where(RabbitMQQueue.is_removed.is_(False))
    if search:
        like = f"%{search}%"
        query = query.where(or_(RabbitMQQueue.name.like(like), RabbitMQQueue.vhost.like(like),
                                RabbitMQQueue.service_name.like(like), RabbitMQQueue.journey.like(like)))
    if template_id or customized_only:
        sub = select(QueueMonitorTemplate.id).where(QueueMonitorTemplate.queue_id == RabbitMQQueue.id)
        if template_id:
            sub = sub.where(QueueMonitorTemplate.template_id == template_id)
        if customized_only:
            sub = sub.where(QueueMonitorTemplate.overrides.is_not(None))
        query = query.where(sub.exists())
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    page_ids = db.scalars(query.order_by(RabbitMQQueue.vhost, RabbitMQQueue.name, RabbitMQQueue.id)
                          .limit(page_size).offset((page - 1) * page_size)).all()
    items = list(db.scalars(select(RabbitMQQueue)
        .where(RabbitMQQueue.id.in_(page_ids))
        .options(selectinload(RabbitMQQueue.template_bindings).selectinload(QueueMonitorTemplate.template),
                 selectinload(RabbitMQQueue.sync_ticket))).all()) if page_ids else []
    by_id = {item.id: item for item in items}
    return {'items': [by_id[item_id] for item_id in page_ids], 'total': total,
            'page': page, 'page_size': page_size,
            'total_pages': max(1, (total + page_size - 1) // page_size)}


def get_queue(db: Session, queue_id: int) -> RabbitMQQueue:
    queue = db.get(RabbitMQQueue, queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Queue não encontrada")
    return queue


def queue_snapshot(queue: RabbitMQQueue) -> dict[str, Any]:
    return {
        "id": queue.id,
        "cluster_id": queue.cluster_id,
        "name": queue.name,
        "vhost": queue.vhost,
        "description": queue.description,
        "criticality": queue.criticality,
        "owner_email": queue.owner_email,
        "journey": queue.journey,
        "service_name": queue.service_name,
        "monitoring_schedule": queue.monitoring_schedule,
        "monitoring_custom_window": queue.monitoring_custom_window,
        "dev_emails": queue.dev_emails,
        "is_dead_letter": queue.is_dead_letter,
        "monitor_anomaly": queue.monitor_anomaly,
        "monitor_enabled": queue.monitor_enabled,
        "notify_sre_ops": queue.notify_sre_ops,
        "notify_ccbp": queue.notify_ccbp,
        "notify_vicci": queue.notify_vicci,
        "vicci_email": queue.vicci_email,
    }


def validate_queue_actions(queue: RabbitMQQueue, data: dict) -> None:
    """Backend guardrail, inclusive para PUT individual e não apenas UI."""
    sre = data.get('notify_sre_ops', queue.notify_sre_ops)
    ccbp = data.get('notify_ccbp', queue.notify_ccbp)
    vicci = data.get('notify_vicci', queue.notify_vicci)
    if sre or ccbp:
        for field, label in [('journey','Jornada'),('service_name','Serviço'),('owner_email','Owner'),('description','Descrição')]:
            if not str(data.get(field, getattr(queue, field)) or '').strip():
                raise HTTPException(status_code=422, detail=f'Para SRE OPS/CCBP, preencha {label}.')
    if vicci:
        # A API tem validação EmailStr; reforçar para registros legados e PUT parciais.
        from pydantic import EmailStr, TypeAdapter, ValidationError
        email = data.get('vicci_email', queue.vicci_email)
        if not isinstance(email, str) or email != email.strip() or any(c in email for c in ',; \t\r\n'):
            raise HTTPException(status_code=422, detail='Grupo VICCI exige um único e-mail válido.')
        try:
            TypeAdapter(EmailStr).validate_python(email)
        except ValidationError:
            raise HTTPException(status_code=422, detail='Grupo VICCI exige um único e-mail válido.')


def update_queue(db: Session, queue_id: int, payload: QueueUpdate) -> RabbitMQQueue:
    queue = get_queue(db, queue_id)
    if queue.is_temporary:
        raise HTTPException(status_code=409, detail='Fila temporária: edição e monitoramento bloqueados.')
    before = queue_snapshot(queue)
    data = payload.model_dump(exclude_unset=True)
    if "dev_emails" in data and data["dev_emails"] is not None:
        data["dev_emails"] = [str(email) for email in data["dev_emails"]]

    validate_queue_actions(queue, data)
    for field, value in data.items():
        setattr(queue, field, value)

    create_audit_log(
        db,
        entity_type="queue",
        entity_id=queue.id,
        action="updated",
        summary=f"Queue {queue.vhost}/{queue.name} atualizada",
        before_data=before,
        after_data=queue_snapshot(queue),
    )
    from app.services.datadog_sync_queue_service import mark_queues_dirty
    mark_queues_dirty(db, [queue.id], "queue_metadata_updated")
    db.commit()
    db.refresh(queue)
    return queue



def save_queue_configuration(db: Session, queue_id: int, payload: QueueConfigurationSave) -> RabbitMQQueue:
    """Salva metadata + lista final de templates em uma transação.

    A UI mantém rascunhos no navegador. Só aqui há commit, audit e enqueue Datadog.
    """
    queue = db.scalar(select(RabbitMQQueue).where(RabbitMQQueue.id == queue_id).with_for_update())
    if queue is None:
        raise HTTPException(status_code=404, detail="Queue não encontrada")
    if queue.is_temporary:
        raise HTTPException(status_code=409, detail='Fila temporária: edição e templates bloqueados.')
    current = list(db.scalars(select(QueueMonitorTemplate).where(QueueMonitorTemplate.queue_id == queue_id)).all())
    originals = {item.template_id: item for item in current}
    desired = {item.template_id: item for item in payload.templates}
    if len(desired) != len(payload.templates):
        raise HTTPException(status_code=422, detail="Template duplicado na lista enviada")

    all_templates = {t.id: t for t in db.scalars(select(MonitorTemplate).where(MonitorTemplate.id.in_(list(desired)))).all()} if desired else {}
    for template_id in desired:
        if template_id not in all_templates or all_templates[template_id].component_type != 'queue':
            raise HTTPException(status_code=422, detail=f"Template {template_id} inválido")
        if template_id not in originals and not all_templates[template_id].is_active:
            raise HTTPException(status_code=422, detail=f"Template {template_id} inativo")

    before = queue_snapshot(queue)
    before['templates'] = [dict(template_id=b.template_id, enabled=b.enabled, overrides=b.overrides) for b in current]
    validate_queue_actions(queue, payload.metadata.model_dump(exclude_unset=True))
    for field, value in payload.metadata.model_dump(exclude_unset=True).items():
        if field == 'dev_emails' and value is not None:
            value = [str(x) for x in value]
        setattr(queue, field, value)

    for template_id, binding in originals.items():
        if template_id not in desired:
            # Exclusão solicitada pelo usuário, não pelo discovery ou template global.
            monitor = db.scalar(select(GeneratedMonitor).where(
                GeneratedMonitor.queue_id == queue_id,
                GeneratedMonitor.grouping_key == f'queue_template:{binding.id}',
                GeneratedMonitor.provider == 'datadog',
                GeneratedMonitor.is_active.is_(True),
            ))
            if monitor:
                if monitor.external_monitor_id or monitor.external_id:
                    monitor.sync_status = 'pending_delete'
                    monitor.status = 'pending_delete'
                else:
                    monitor.sync_status = 'deleted'
                    monitor.status = 'deleted'
                    monitor.is_active = False
            db.delete(binding)
    for template_id, item in desired.items():
        overrides = item.overrides or None
        binding = originals.get(template_id)
        if binding is None:
            db.add(QueueMonitorTemplate(queue_id=queue_id, template_id=template_id, enabled=item.enabled, overrides=overrides))
        else:
            binding.enabled = item.enabled
            binding.overrides = overrides

    after = queue_snapshot(queue)
    after['templates'] = [dict(template_id=x.template_id, enabled=x.enabled, overrides=x.overrides or None) for x in payload.templates]
    changed = before != after
    if changed:
        db.flush()
        create_audit_log(db, entity_type='queue', entity_id=queue.id, action='configuration_saved',
                         summary=f'Queue {queue.vhost}/{queue.name}: metadados e templates salvos',
                         before_data=before, after_data=after)
        from app.services.datadog_sync_queue_service import mark_queues_dirty
        mark_queues_dirty(db, [queue.id], 'queue_configuration_saved')
    db.commit()
    db.refresh(queue)
    return queue
