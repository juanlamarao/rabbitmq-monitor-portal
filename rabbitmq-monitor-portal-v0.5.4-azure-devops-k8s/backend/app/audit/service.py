from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def create_audit_log(
    db: Session,
    *,
    entity_type: str,
    action: str,
    entity_id: int | str | None = None,
    actor: str = "local-admin",
    summary: str | None = None,
    before_data: Any | None = None,
    after_data: Any | None = None,
) -> AuditLog:
    log = AuditLog(
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        action=action,
        actor=actor,
        summary=summary,
        before_data=jsonable_encoder(before_data) if before_data is not None else None,
        after_data=jsonable_encoder(after_data) if after_data is not None else None,
    )
    db.add(log)
    return log
