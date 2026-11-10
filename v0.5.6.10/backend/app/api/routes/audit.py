from datetime import date, datetime, time, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.schemas.common import AuditLogRead

router = APIRouter()


@router.get("", response_model=list[AuditLogRead])
def list_audit_logs(
    limit: int = Query(default=200, ge=1, le=500),
    q: str | None = Query(default=None, max_length=200),
    entity_type: str | None = Query(default=None, max_length=80),
    action: str | None = Query(default=None, max_length=80),
    actor: str | None = Query(default=None, max_length=120),
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    statement = select(AuditLog)
    if q and q.strip():
        term = f"%{q.strip()}%"
        statement = statement.where(or_(
            AuditLog.summary.ilike(term), AuditLog.entity_type.ilike(term),
            AuditLog.action.ilike(term), AuditLog.actor.ilike(term),
            AuditLog.entity_id.ilike(term),
        ))
    if entity_type and entity_type.strip():
        statement = statement.where(AuditLog.entity_type.ilike(f"%{entity_type.strip()}%"))
    if action and action.strip():
        statement = statement.where(AuditLog.action.ilike(f"%{action.strip()}%"))
    if actor and actor.strip():
        statement = statement.where(AuditLog.actor.ilike(f"%{actor.strip()}%"))
    if date_from:
        statement = statement.where(AuditLog.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        statement = statement.where(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min))
    return db.scalars(statement.order_by(AuditLog.created_at.desc()).limit(limit)).all()
