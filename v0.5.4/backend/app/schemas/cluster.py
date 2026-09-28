from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.admin import DatadogOrgRead, SREGroupRead
from app.schemas.common import ORMModel


class ClusterRegexRead(ORMModel):
    id: int
    pattern: str
    position: int


class ClusterBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    environment: str = Field(pattern="^(prod|uat|dev)$")
    business_line: str | None = None
    protocol: str = Field(default="https", pattern="^(http|https)$")
    dns: str = Field(min_length=1, max_length=255)
    api_port: int = Field(default=15672, ge=1, le=65535)
    api_username: str = Field(min_length=1, max_length=180)
    sre_group_id: int | None = None
    datadog_org_id: int | None = None
    datadog_integration_type: str = "custom"
    datadog_cluster_tag_value: str | None = None
    datadog_cluster_tag_key: str = "rabbitmq_cluster"
    datadog_vhost_tag_key: str = "vhost"
    datadog_queue_tag_key: str = "queue"
    datadog_node_tag_key: str | None = None
    datadog_metric_messages: str = "rabbitmq.queue.messages"
    datadog_metric_consumers: str = "rabbitmq.queue.consumers"
    temporary_queue_regexes: list[str] = Field(default_factory=lambda: ["^$"])
    monitor_cluster: bool = True
    monitor_queues: bool = True
    monitor_exchanges: bool = False
    monitor_connections: bool = False
    monitor_nodes: bool = False
    monitor_shovels: bool = False
    is_active: bool = True

    @field_validator("temporary_queue_regexes")
    @classmethod
    def default_regex(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item and item.strip()]
        return cleaned or ["^$"]


class ClusterCreate(ClusterBase):
    api_password: str = Field(min_length=1)


class ClusterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    environment: str | None = Field(default=None, pattern="^(prod|uat|dev)$")
    business_line: str | None = None
    protocol: str | None = Field(default=None, pattern="^(http|https)$")
    dns: str | None = Field(default=None, min_length=1, max_length=255)
    api_port: int | None = Field(default=None, ge=1, le=65535)
    api_username: str | None = Field(default=None, min_length=1, max_length=180)
    api_password: str | None = None
    sre_group_id: int | None = None
    datadog_org_id: int | None = None
    datadog_integration_type: str | None = None
    datadog_cluster_tag_value: str | None = None
    datadog_cluster_tag_key: str | None = None
    datadog_vhost_tag_key: str | None = None
    datadog_queue_tag_key: str | None = None
    datadog_node_tag_key: str | None = None
    datadog_metric_messages: str | None = None
    datadog_metric_consumers: str | None = None
    temporary_queue_regexes: list[str] | None = None
    monitor_cluster: bool | None = None
    monitor_queues: bool | None = None
    monitor_exchanges: bool | None = None
    monitor_connections: bool | None = None
    monitor_nodes: bool | None = None
    monitor_shovels: bool | None = None
    is_active: bool | None = None


class ClusterRead(ORMModel):
    id: int
    name: str
    environment: str
    business_line: str | None = None
    protocol: str
    dns: str
    api_port: int
    api_username: str
    sre_group_id: int | None = None
    datadog_org_id: int | None = None
    datadog_integration_type: str = "custom"
    datadog_cluster_tag_value: str | None = None
    datadog_cluster_tag_key: str = "rabbitmq_cluster"
    datadog_vhost_tag_key: str = "vhost"
    datadog_queue_tag_key: str = "queue"
    datadog_node_tag_key: str | None = None
    datadog_metric_messages: str = "rabbitmq.queue.messages"
    datadog_metric_consumers: str = "rabbitmq.queue.consumers"
    monitor_cluster: bool
    monitor_queues: bool
    monitor_exchanges: bool
    monitor_connections: bool
    monitor_nodes: bool
    monitor_shovels: bool
    is_active: bool
    last_discovery_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    temporary_queue_regexes: list[ClusterRegexRead] = Field(default_factory=list)
    sre_group: SREGroupRead | None = None
    datadog_org: DatadogOrgRead | None = None


class DiscoveryResult(BaseModel):
    cluster_id: int
    fetched: int
    created: int
    updated: int
    restored: int
    marked_removed: int
    temporary_matched: int
