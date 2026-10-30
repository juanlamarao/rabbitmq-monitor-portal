from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class QueueAppliedTemplateRead(ORMModel):
    template_id: int
    code: str
    enabled: bool
    is_customized: bool


class QueueRead(ORMModel):
    id: int
    cluster_id: int
    name: str
    vhost: str
    type: str | None = None
    durable: bool | None = None
    auto_delete: bool | None = None
    exclusive: bool | None = None
    state: str | None = None
    api_raw: dict[str, Any] | None = None
    description: str | None = None
    criticality: str | None = None
    owner_email: str | None = None
    journey: str | None = None
    service_name: str | None = None
    monitoring_schedule: str
    monitoring_custom_window: str | None = None
    dev_emails: list[str] | None = None
    is_dead_letter: bool
    monitor_anomaly: bool
    monitor_enabled: bool
    is_temporary: bool
    is_removed: bool
    removed_at: datetime | None = None
    discovered_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    applied_templates: list[QueueAppliedTemplateRead] = Field(default_factory=list)


class QueueUpdate(BaseModel):
    description: str | None = None
    criticality: Literal["none", "low", "medium", "high", "critical"] | None = None
    owner_email: EmailStr | None = None
    journey: str | None = Field(default=None, max_length=255)
    service_name: str | None = Field(default=None, max_length=255)
    monitoring_schedule: str | None = Field(default=None, pattern="^(24x7|business_hour|seg-sex|custom)$")
    monitoring_custom_window: str | None = Field(default=None, max_length=255)
    dev_emails: list[EmailStr] | None = None
    is_dead_letter: bool | None = None
    monitor_anomaly: bool | None = None
    monitor_enabled: bool | None = None
