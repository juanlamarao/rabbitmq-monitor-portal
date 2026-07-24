from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel


class MonitorTemplateRead(ORMModel):
    id: int
    code: str
    name: str
    description: str | None = None
    component_type: str
    monitor_kind: str
    default_config: dict[str, Any]
    datadog_monitor_type: str | None = None
    datadog_query_template: str | None = None
    datadog_message_template: str | None = None
    datadog_tags_template: list[str] | None = None
    datadog_options: dict[str, Any] | None = None
    is_system: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class MonitorTemplateCreate(BaseModel):
    code: str = Field(min_length=3, max_length=120, pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=3, max_length=180)
    description: str | None = None
    component_type: Literal["queue"] = "queue"
    monitor_kind: str = Field(min_length=3, max_length=80)
    default_config: dict[str, Any]
    datadog_monitor_type: str | None = Field(default="query alert", max_length=80)
    datadog_query_template: str | None = None
    datadog_message_template: str | None = None
    datadog_tags_template: list[str] | None = None
    datadog_options: dict[str, Any] | None = None
    is_active: bool = True

    @field_validator("default_config")
    @classmethod
    def validate_default_config(cls, value: dict[str, Any]) -> dict[str, Any]:
        if not value:
            raise ValueError("default_config não pode ser vazio")
        return value


class MonitorTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = None
    component_type: Literal["queue"] | None = None
    monitor_kind: str | None = Field(default=None, min_length=3, max_length=80)
    default_config: dict[str, Any] | None = None
    datadog_monitor_type: str | None = Field(default=None, max_length=80)
    datadog_query_template: str | None = None
    datadog_message_template: str | None = None
    datadog_tags_template: list[str] | None = None
    datadog_options: dict[str, Any] | None = None
    is_active: bool | None = None

    @field_validator("default_config")
    @classmethod
    def validate_default_config(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is not None and not value:
            raise ValueError("default_config não pode ser vazio")
        return value


class TemplateUsageQueueRead(BaseModel):
    binding_id: int
    queue_id: int
    queue_name: str
    vhost: str
    cluster_id: int
    cluster_name: str
    enabled: bool
    is_customized: bool
    overrides: dict[str, Any] | None = None
    is_removed: bool


class TemplateUsageRead(BaseModel):
    template_id: int
    total_bindings: int
    enabled_bindings: int
    disabled_bindings: int
    customized_bindings: int
    inherited_bindings: int
    active_queues: int
    removed_queues: int
    queues: list[TemplateUsageQueueRead]


class TemplateImpactRequest(BaseModel):
    default_config: dict[str, Any]


class TemplateImpactRead(BaseModel):
    template_id: int
    changed_keys: list[str]
    removed_keys: list[str]
    added_keys: list[str]
    total_bindings: int
    inherited_bindings: int
    customized_bindings: int
    affected_inherited_bindings: int
    protected_by_override_bindings: int


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
