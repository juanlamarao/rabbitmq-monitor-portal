"""Consumidor MySQL durável da v0.5.6; UMA execução por queue por vez.

O MySQL é a fila transacional. Redis/RQ continua para discovery/cleanup/LDAP.
A recuperação de um worker morto é feita pelo timeout do lease, com política at-least-once.
"""
import time
from datetime import datetime, timedelta, timezone
from sqlalchemy import or_, select
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import logger
from app.core.auth import _actor
from app.models.datadog_sync_queue import DatadogSyncQueue
from app.models.generated_monitor import GeneratedMonitor
from app.services.datadog_planner_service import persist_datadog_plan, build_datadog_plan
from app.services.datadog_sync_service import apply_datadog_monitors


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def claim_one():
    with SessionLocal() as db:
        now = utcnow()
        # Requeue lease expirado, inclusive após kill -9 do dispatcher.
        db.query(DatadogSyncQueue).filter(
            DatadogSyncQueue.status == 'running',
            DatadogSyncQueue.updated_at < now - timedelta(minutes=15)
        ).update({'status': 'pending', 'next_retry_at': None}, synchronize_session=False)
        db.commit()
        stmt = (select(DatadogSyncQueue)
                .where(DatadogSyncQueue.status.in_(['pending','retry']))
                .where(or_(DatadogSyncQueue.next_retry_at.is_(None), DatadogSyncQueue.next_retry_at <= now))
                .order_by(DatadogSyncQueue.updated_at, DatadogSyncQueue.queue_id)
                .limit(1).with_for_update(skip_locked=True))
        row = db.scalar(stmt)
        if row is None:
            db.rollback()
            return None
        row.status = 'running'
        row.attempts += 1
        row.next_retry_at = None
        row.updated_at = now
        payload = (row.queue_id, row.desired_revision, row.attempts, row.requested_by)
        db.commit()
        return payload


def apply_one(queue_id: int, revision: int, attempts: int, actor: str):
    _actor.set(actor or 'datadog-dispatcher')
    error = None
    blocked = False
    try:
        with SessionLocal() as db:
            plan = build_datadog_plan(db, queue_id=queue_id)
            if any(bucket.errors for bucket in plan.buckets):
                blocked = True
                msgs = [error for bucket in plan.buckets for error in bucket.errors]
                raise RuntimeError('Plano Datadog inválido: ' + '; '.join(msgs[:5]))
            persist_datadog_plan(db, queue_id=queue_id)
            monitors = db.scalars(select(GeneratedMonitor).where(
                GeneratedMonitor.queue_id == queue_id,
                GeneratedMonitor.is_active.is_(True),
                GeneratedMonitor.provider == 'datadog',
            )).all()
            # Nunca apagar monitor órfão automaticamente. Exige revisão manual.
            if any(m.sync_status == 'orphaned' and (m.external_monitor_id or m.external_id) for m in monitors):
                blocked = True
                raise RuntimeError('Existem monitores órfãos. Revisar antes de remover do Datadog.')
            applicable = [m.id for m in monitors if m.sync_status in ('pending_create','pending_update','error')]
            if applicable:
                result = apply_datadog_monitors(db, monitor_ids=applicable, actor=actor)
                if result.failed:
                    raise RuntimeError('; '.join(str(e.get('error')) for e in result.errors[:3]))
            logger.info('Datadog sync queue=%s revision=%s monitores=%s', queue_id, revision, len(applicable))
    except Exception as exc:
        error = f'{type(exc).__name__}: {exc}'[:2000]
        logger.error('Datadog sync queue=%s revision=%s erro=%s', queue_id, revision, error)
    finally:
        with SessionLocal() as db:
            row = db.get(DatadogSyncQueue, queue_id, with_for_update=True)
            if row is None:
                return
            # Alterações feitas enquanto o worker sincronizava precisam de nova passagem.
            if row.desired_revision != revision:
                row.status = 'pending'
                row.attempts = 0
                row.next_retry_at = None
                row.last_error = None
            elif error is None:
                row.status = 'synced'
                row.applied_revision = revision
                row.attempts = 0
                row.last_synced_at = utcnow()
                row.last_error = None
                row.next_retry_at = None
            else:
                row.last_error = error
                if blocked or attempts >= settings.datadog_sync_max_attempts:
                    row.status = 'blocked' if blocked else 'error'
                    row.next_retry_at = None
                else:
                    row.status = 'retry'
                    row.next_retry_at = utcnow() + timedelta(seconds=min(600, 2 ** min(attempts, 9) * 5))
            db.commit()


def main():
    logger.info('Datadog dispatcher v0.5.6 iniciado (MySQL outbox).')
    while True:
        try:
            work = claim_one()
            if work:
                apply_one(*work)
            else:
                time.sleep(max(1, settings.datadog_sync_poll_seconds))
        except Exception:
            logger.exception('Falha no dispatcher; recuperando em 5 segundos.')
            time.sleep(5)

if __name__ == '__main__':
    main()
