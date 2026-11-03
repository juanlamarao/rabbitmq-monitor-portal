from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DatadogPlanQueueSample(BaseModel):
    queue_id: int
    cluster_id: int
    cluster_name: str
    rabbitmq_cluster_tag: str
    vhost: str
    queue: str
    service_name: str | None = None
    criticality: str | None = None
    owner_email: str | None = None
    is_customized: bool


class DatadogPlanBucket(BaseModel):
    bucket_key: str
    datadog_org_id: int
    cluster_id: int | None = None
    queue_id: int | None = None
    datadog_org_name: str
    template_id: int
    template_code: str
    template_name: str
    monitor_type: str
    monitor_kind: str
    strategy: str = "grouped"
    effective_config: dict[str, Any]
    queue_count: int
    customized_queue_count: int
    inherited_queue_count: int
    query: str | None = None
    message: str | None = None
    tags: list[str] = Field(default_factory=list)
    options: dict[str, Any] = Field(default_factory=dict)
    grouping_tags: list[str] = Field(default_factory=lambda: ["rabbitmq_cluster", "vhost", "queue"])
    scope_tags_used: list[str] = Field(default_factory=lambda: ["rabbitmq_cluster", "vhost", "queue"])
    public_reference_url_template: str
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    sample_queues: list[DatadogPlanQueueSample] = Field(default_factory=list)

    desired_config_hash: str
    saved_monitor_id: int | None = None
    saved_sync_status: str | None = None
    saved_desired_config_hash: str | None = None
    saved_applied_config_hash: str | None = None
    saved_last_planned_at: datetime | None = None
    plan_state: str = "new"


class DatadogPlanSummary(BaseModel):
    total_buckets: int
    total_queues_covered: int
    buckets_with_errors: int
    buckets_with_warnings: int
    templates_without_query: int
    orgs: list[str]
    new_buckets: int = 0
    unchanged_buckets: int = 0
    changed_buckets: int = 0
    saved_buckets: int = 0


class DatadogPlanRead(BaseModel):
    dry_run: bool = True
    summary: DatadogPlanSummary
    buckets: list[DatadogPlanBucket]


class DatadogPlanPersistRequest(BaseModel):
    datadog_org_id: int | None = None
    template_id: int | None = None
    sample_limit: int = Field(default=10, ge=1, le=100)


class DatadogPlanPersistResult(BaseModel):
    planned: int
    created: int
    updated: int
    unchanged: int
    orphaned: int
    skipped_with_errors: int
    active_saved_monitors: int


class GeneratedMonitorRead(BaseModel):
    id: int
    datadog_org_id: int | None = None
    cluster_id: int | None = None
    queue_id: int | None = None
    datadog_org_name: str | None = None
    template_id: int | None = None
    template_code: str | None = None
    provider: str
    monitor_scope_type: str
    grouping_key: str | None = None
    name: str | None = None
    query: str | None = None
    message: str | None = None
    tags: list[str] = Field(default_factory=list)
    options: dict[str, Any] = Field(default_factory=dict)
    covered_queues_count: int
    desired_config_hash: str | None = None
    applied_config_hash: str | None = None
    sync_status: str
    external_monitor_id: str | None = None
    external_monitor_url: str | None = None
    last_planned_at: datetime | None = None
    last_synced_at: datetime | None = None
    last_error: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
