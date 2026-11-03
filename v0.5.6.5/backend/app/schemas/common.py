from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    message: str


class AuditLogRead(ORMModel):
    id: int
    entity_type: str
    entity_id: str | None = None
    action: str
    actor: str
    summary: str | None = None
    before_data: dict[str, Any] | None = None
    after_data: dict[str, Any] | None = None
    created_at: datetime
