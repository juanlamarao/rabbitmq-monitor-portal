from typing import Any

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.audit.service import create_audit_log
from app.models.component import RabbitMQQueue
from app.models.monitor_template import QueueMonitorTemplate
from app.schemas.component import QueueUpdate


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
        .options(selectinload(RabbitMQQueue.template_bindings).selectinload(QueueMonitorTemplate.template))
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
    }


def update_queue(db: Session, queue_id: int, payload: QueueUpdate) -> RabbitMQQueue:
    queue = get_queue(db, queue_id)
    before = queue_snapshot(queue)
    data = payload.model_dump(exclude_unset=True)
    if "dev_emails" in data and data["dev_emails"] is not None:
        data["dev_emails"] = [str(email) for email in data["dev_emails"]]

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
    db.commit()
    db.refresh(queue)
    return queue
