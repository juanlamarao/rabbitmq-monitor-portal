from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PublicAppliedTemplateRead(BaseModel):
    binding_id: int
    template_id: int
    code: str
    name: str
    enabled: bool
    is_customized: bool
    effective_config: dict[str, Any]
    overrides: dict[str, Any] | None = None


class PublicQueueReferenceRead(BaseModel):
    cluster_id: int
    cluster_name: str
    rabbitmq_cluster_tag: str
    environment: str
    business_line: str | None = None
    vhost: str
    queue: str
    type: str | None = None
    state: str | None = None
    service_name: str | None = None
    criticality: str | None = None
    owner_email: str | None = None
    sre_group_name: str | None = None
    sre_group_members: list[str] = Field(default_factory=list)
    dev_emails: list[str] = Field(default_factory=list)
    journey: str | None = None
    description: str | None = None
    monitoring_schedule: str | None = None
    is_removed: bool
    removed_at: datetime | None = None
    discovered_at: datetime | None = None
    updated_at: datetime
    applied_templates: list[PublicAppliedTemplateRead] = Field(default_factory=list)
