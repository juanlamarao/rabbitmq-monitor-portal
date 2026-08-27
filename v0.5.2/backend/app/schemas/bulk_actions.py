from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORMModel
from app.schemas.component import QueueAppliedTemplateRead


class QueueBulkFilter(BaseModel):
    cluster_id: int | None = None
    queue_ids: list[int] | None = None
    search: str | None = Field(default=None, max_length=255)
    vhost: str | None = Field(default=None, max_length=255)
    name_regex: str | None = Field(default=None, max_length=500)
    criticality: Literal["none", "low", "medium", "high", "critical"] | None = None
    owner_email: str | None = Field(default=None, max_length=255)
    service_name: str | None = Field(default=None, max_length=255)
    template_id: int | None = None
    customized_only: bool = False
    include_removed: bool = False
    removed_only: bool = False
    sample_limit: int = Field(default=200, ge=1, le=1000)

    @field_validator("queue_ids")
    @classmethod
    def validate_queue_ids(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return value
        unique_ids = list(dict.fromkeys(value))
        if len(unique_ids) > 5000:
            raise ValueError("A seleção não pode ultrapassar 5000 queues por operação.")
        return unique_ids


class QueueBulkMetadataUpdate(BaseModel):
    description: str | None = None
    criticality: Literal["none", "low", "medium", "high", "critical"] | None = None
    owner_email: EmailStr | None = None
    journey: str | None = Field(default=None, max_length=255)
    service_name: str | None = Field(default=None, max_length=255)
    monitoring_schedule: Literal["24x7", "business_hour", "seg-sex", "custom"] | None = None
    monitoring_custom_window: str | None = Field(default=None, max_length=255)
    dev_emails: list[EmailStr] | None = None


QueueBulkAction = Literal[
    "update_metadata",
    "apply_template",
    "remove_template",
    "update_template_overrides",
    "clear_template_overrides",
    "set_template_enabled",
]


class QueueBulkActionRequest(BaseModel):
    filters: QueueBulkFilter = Field(default_factory=QueueBulkFilter)
    action: QueueBulkAction
    metadata: QueueBulkMetadataUpdate | None = None
    template_id: int | None = None
    overrides: dict[str, Any] | None = None
    enabled: bool | None = None


class QueueBulkPreviewRequest(BaseModel):
    filters: QueueBulkFilter = Field(default_factory=QueueBulkFilter)


class QueueBulkTemplateSummary(ORMModel):
    template_id: int
    code: str
    enabled: bool
    is_customized: bool


class QueueBulkQueuePreview(ORMModel):
    id: int
    cluster_id: int
    cluster_name: str | None = None
    vhost: str
    name: str
    criticality: str | None = None
    owner_email: str | None = None
    service_name: str | None = None
    is_removed: bool
    applied_templates: list[QueueAppliedTemplateRead] = Field(default_factory=list)


class QueueBulkPreviewRead(BaseModel):
    matched_count: int
    sample_count: int
    sample_limit: int
    queues: list[QueueBulkQueuePreview]


class QueueBulkApplyRead(BaseModel):
    action: QueueBulkAction
    matched_count: int
    affected_count: int
    skipped_count: int
    errors: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)
