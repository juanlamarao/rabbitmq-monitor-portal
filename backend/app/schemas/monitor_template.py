from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.common import ORMModel


class MonitorTemplateRead(ORMModel):
    id: int
    code: str
    name: str
    description: str | None = None
    component_type: str
    monitor_kind: str
    default_config: dict[str, Any]
    is_system: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class QueueMonitorTemplateCreate(BaseModel):
    template_id: int
    enabled: bool = True
    overrides: dict[str, Any] | None = None


class QueueMonitorTemplateUpdate(BaseModel):
    enabled: bool | None = None
    overrides: dict[str, Any] | None = None


class QueueMonitorTemplateRead(ORMModel):
    id: int
    queue_id: int
    template_id: int
    enabled: bool
    overrides: dict[str, Any] | None = None
    effective_config: dict[str, Any]
    template: MonitorTemplateRead
    created_at: datetime
    updated_at: datetime
