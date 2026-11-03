"""Aggregated operational overview; bounded queries suitable for large queue catalogs."""

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.cluster import RabbitMQCluster
from app.models.component import RabbitMQQueue
from app.models.generated_monitor import GeneratedMonitor

router = APIRouter()


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    total_clusters = db.scalar(select(func.count()).select_from(RabbitMQCluster)) or 0
    active_clusters = db.scalar(select(func.count()).select_from(RabbitMQCluster).where(RabbitMQCluster.is_active.is_(True))) or 0
    active_queues = db.scalar(select(func.count()).select_from(RabbitMQQueue).where(RabbitMQQueue.is_removed.is_(False))) or 0
    monitor_count = db.scalar(select(func.count()).select_from(GeneratedMonitor).where(
        GeneratedMonitor.is_active.is_(True), GeneratedMonitor.sync_status == "synced"
    )) or 0
    attention_states = ("error", "not_found", "out_of_sync", "orphaned")
    attention_count = db.scalar(select(func.count()).select_from(GeneratedMonitor).where(
        GeneratedMonitor.is_active.is_(True), GeneratedMonitor.sync_status.in_(attention_states)
    )) or 0

    queue_count = func.sum(case((RabbitMQQueue.is_removed.is_(False), 1), else_=0)).label("queue_count")
    clusters = db.execute(
        select(RabbitMQCluster.id, RabbitMQCluster.name, RabbitMQCluster.environment,
               RabbitMQCluster.is_active, RabbitMQCluster.last_discovery_at, queue_count)
        .outerjoin(RabbitMQQueue, RabbitMQQueue.cluster_id == RabbitMQCluster.id)
        .group_by(RabbitMQCluster.id, RabbitMQCluster.name, RabbitMQCluster.environment,
                  RabbitMQCluster.is_active, RabbitMQCluster.last_discovery_at)
        .order_by(RabbitMQCluster.name).limit(8)
    ).all()
    recent_logs = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(5)).all()
    return {
        "total_clusters": total_clusters,
        "active_clusters": active_clusters,
        "active_queues": active_queues,
        "synced_monitors": monitor_count,
        "attention_monitors": attention_count,
        "clusters": [
            {"id": r.id, "name": r.name, "environment": r.environment,
             "is_active": r.is_active, "last_discovery_at": r.last_discovery_at,
             "queue_count": int(r.queue_count or 0)} for r in clusters
        ],
        "activity": [
            {"id": log.id, "summary": log.summary or log.action,
             "actor": log.actor, "action": log.action, "created_at": log.created_at}
            for log in recent_logs
        ],
    }
