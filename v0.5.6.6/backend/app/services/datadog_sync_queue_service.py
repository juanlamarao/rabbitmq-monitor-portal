"""Outbox durável. Cada queue mantém apenas a revisão mais recente (coalescing).

A função mark_queues_dirty é invocada *antes do commit* da operação de negócio.
Nenhum publish ao Redis no caminho crítico; MySQL é a fonte da verdade.
"""
from sqlalchemy import select, case
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.orm import Session
from app.core.auth import actor_name
from app.models.datadog_sync_queue import DatadogSyncQueue
from app.models.component import RabbitMQQueue


def mark_queues_dirty(db: Session, queue_ids, reason: str) -> int:
    ids = list(dict.fromkeys(int(i) for i in queue_ids if i is not None))
    if not ids:
        return 0
    # Não vamos enfileirar filas sem vínculo com Org Datadog; se vincular depois,
    # o evento de edição do cluster fará enqueue das suas filas.
    from app.models.cluster import RabbitMQCluster
    from app.models.datadog_org import DatadogOrg
    qualified = db.scalars(
        select(RabbitMQQueue.id)
        .join(RabbitMQCluster, RabbitMQCluster.id == RabbitMQQueue.cluster_id)
        .join(DatadogOrg, DatadogOrg.id == RabbitMQCluster.datadog_org_id)
        .where(RabbitMQQueue.id.in_(ids), RabbitMQQueue.is_temporary.is_(False),
               DatadogOrg.is_active.is_(True))
    ).all()
    if not qualified:
        return 0
    actor = actor_name()[:255]
    # Único UPSERT atômico, sem SELECT+INSERT concorrentes.
    for start in range(0, len(qualified), 1000):
        vals = [dict(queue_id=q, desired_revision=1, applied_revision=0,
                     status='pending', attempts=0, reason=reason[:150],
                     requested_by=actor) for q in qualified[start:start+1000]]
        stmt = insert(DatadogSyncQueue).values(vals)
        db.execute(stmt.on_duplicate_key_update(
            desired_revision=DatadogSyncQueue.desired_revision+1,
            status=case((DatadogSyncQueue.status == 'running', 'running'), else_='pending'), attempts=0, last_error=None,
            next_retry_at=None, reason=stmt.inserted.reason,
            requested_by=stmt.inserted.requested_by,
        ))
    return len(qualified)


def queue_state(db: Session, queue_id: int) -> dict:
    row = db.get(DatadogSyncQueue, queue_id)
    if not row:
        return {'status': 'not_configured', 'pending': False, 'desired_revision': 0,
                'applied_revision': 0, 'last_error': None}
    status = row.status
    if row.desired_revision > row.applied_revision and status == 'synced':
        status = 'pending'
    return {'status': status, 'pending': status != 'synced',
            'desired_revision': row.desired_revision, 'applied_revision': row.applied_revision,
            'last_error': row.last_error, 'updated_at': row.updated_at,
            'last_synced_at': row.last_synced_at}
