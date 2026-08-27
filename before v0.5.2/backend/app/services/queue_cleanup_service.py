from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.audit.service import create_audit_log
from app.models.component import RabbitMQQueue


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def cleanup_removed_queues(db: Session, *, retention_days: int = 60, limit: int | None = None) -> dict[str, Any]:
    """Remove fisicamente queues marcadas como removidas há mais de retention_days.

    A marcação lógica acontece no discovery. Esta rotina é o expurgo físico,
    mantido separado para preservar histórico por uma janela de retenção.
    """
    retention_days = max(int(retention_days), 1)
    cutoff = _now() - timedelta(days=retention_days)

    stmt = (
        select(RabbitMQQueue)
        .options(selectinload(RabbitMQQueue.cluster))
        .where(
            RabbitMQQueue.is_removed.is_(True),
            RabbitMQQueue.removed_at.is_not(None),
            RabbitMQQueue.removed_at <= cutoff,
        )
        .order_by(RabbitMQQueue.removed_at.asc(), RabbitMQQueue.id.asc())
    )
    if limit:
        stmt = stmt.limit(max(int(limit), 1))

    queues = list(db.scalars(stmt).all())
    samples: list[dict[str, Any]] = []
    cluster_counts: dict[str, int] = {}

    for queue in queues:
        cluster_name = queue.cluster.name if queue.cluster else f"cluster_id={queue.cluster_id}"
        cluster_counts[cluster_name] = cluster_counts.get(cluster_name, 0) + 1
        if len(samples) < 20:
            samples.append(
                {
                    "queue_id": queue.id,
                    "cluster_id": queue.cluster_id,
                    "cluster_name": cluster_name,
                    "vhost": queue.vhost,
                    "name": queue.name,
                    "removed_at": queue.removed_at.isoformat() if queue.removed_at else None,
                }
            )
        db.delete(queue)

    result = {
        "retention_days": retention_days,
        "cutoff": cutoff.isoformat(),
        "deleted": len(queues),
        "cluster_counts": cluster_counts,
        "samples": samples,
    }

    create_audit_log(
        db,
        entity_type="queue_cleanup",
        entity_id=None,
        action="removed_queues_purged",
        summary=f"Expurgo físico de queues removidas executado. {len(queues)} filas apagadas.",
        after_data=result,
    )
    db.commit()
    return result
