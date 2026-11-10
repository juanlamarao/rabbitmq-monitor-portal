"""Leitura da fila transacional (sem endpoint de sync manual)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.datadog_sync_queue import DatadogSyncQueue
from app.services.datadog_sync_queue_service import queue_state

router = APIRouter()

@router.get('/status/{queue_id}')
def status(queue_id: int, db: Session = Depends(get_db)):
    return queue_state(db, queue_id)

@router.get('/entries')
def entries(status: str | None = None, limit: int = Query(default=200, ge=1, le=1000), db: Session = Depends(get_db)):
    stmt = select(DatadogSyncQueue)
    if status:
        stmt = stmt.where(DatadogSyncQueue.status == status)
    records = db.scalars(stmt.order_by(DatadogSyncQueue.updated_at.desc()).limit(limit)).all()
    return [{'queue_id': r.queue_id, 'status': r.status, 'desired_revision': r.desired_revision,
             'applied_revision': r.applied_revision, 'attempts': r.attempts,
             'reason': r.reason, 'requested_by': r.requested_by,
             'last_error': r.last_error, 'updated_at': r.updated_at,
             'next_retry_at': r.next_retry_at, 'last_synced_at': r.last_synced_at} for r in records]

@router.get('/summary')
def summary(db: Session = Depends(get_db)):
    grouped = db.execute(select(DatadogSyncQueue.status, func.count()).group_by(DatadogSyncQueue.status)).all()
    return {s: count for s,count in grouped}
