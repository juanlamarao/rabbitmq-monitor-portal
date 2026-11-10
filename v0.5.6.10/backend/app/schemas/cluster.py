from datetime import datetime
import re

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.admin import DatadogOrgRead, SREGroupRead
from app.schemas.common import ORMModel


class ClusterRegexRead(ORMModel):
    id: int
    pattern: str
    position: int


class DatadogDimension(BaseModel):
    # Filtro estático por cluster. Não substitui dimensões dinâmicas de vhost/queue.
    key: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=255)

    @field_validator("key")
    @classmethod
    def validate_key(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]*", value):
            raise ValueError("Nome da dimensão Datadog inválido: use letras, números, _, . ou -.")
        return value

    @field_validator("value")
    @classmethod
    def validate_value(cls, value: str) -> str:
        value = value.strip()
        if not value or any(c in value for c in ",{}\r\n\\"):
            raise ValueError("Valor de dimensão Datadog não pode estar vazio ou conter vírgulas, chaves ou barras invertidas.")
        return value


def validate_extra_dimensions(extra: list[DatadogDimension], cluster_key: str, vhost_key: str, queue_key: str) -> None:
    reserved = {key.strip().lower() for key in (cluster_key, vhost_key, queue_key) if key.strip()}
    seen: set[str] = set()
    for item in extra:
        key = item.key.lower()
        if key in reserved or key in seen:
            raise ValueError(f"Dimensão Datadog duplicada ou reservada: {item.key}")
        seen.add(key)


class ClusterBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    environment: str = Field(pattern="^(prod|uat|dev)$")
    business_line: str | None = None
    connection_type: str = Field(default='management_api', pattern='^(management_api|prometheus_metrics)$')
    metrics_endpoints: str | None = None
    protocol: str = Field(default="https", pattern="^(http|https)$")
    dns: str = Field(min_length=1, max_length=255)
    api_port: int = Field(default=15672, ge=1, le=65535)
    api_username: str = Field(default="", max_length=180)
    sre_group_id: int | None = None
    datadog_org_id: int | None = None
    datadog_integration_type: str = "custom"
    datadog_cluster_tag_value: str | None = None
    datadog_use_cluster_dimension: bool = True
    datadog_extra_dimensions: list[DatadogDimension] = Field(default_factory=list, max_length=25)
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

    @model_validator(mode="after")
    def validate_dimensions(self):
        validate_extra_dimensions(self.datadog_extra_dimensions, self.datadog_cluster_tag_key,
                                  self.datadog_vhost_tag_key, self.datadog_queue_tag_key)
        if not self.datadog_use_cluster_dimension and not self.datadog_extra_dimensions:
            raise ValueError("Sem a dimensão cluster, configure ao menos uma dimensão adicional.")
        return self

    @field_validator("temporary_queue_regexes")
    @classmethod
    def default_regex(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item and item.strip()]
        return cleaned or ["^$"]


class ClusterCreate(ClusterBase):
    api_password: str = ""


class ClusterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    environment: str | None = Field(default=None, pattern="^(prod|uat|dev)$")
    business_line: str | None = None
    connection_type: str | None = Field(default=None, pattern='^(management_api|prometheus_metrics)$')
    metrics_endpoints: str | None = None
    protocol: str | None = Field(default=None, pattern="^(http|https)$")
    dns: str | None = Field(default=None, min_length=1, max_length=255)
    api_port: int | None = Field(default=None, ge=1, le=65535)
    api_username: str | None = Field(default=None, max_length=180)
    api_password: str | None = None
    sre_group_id: int | None = None
    datadog_org_id: int | None = None
    datadog_integration_type: str | None = None
    datadog_cluster_tag_value: str | None = None
    datadog_use_cluster_dimension: bool | None = None
    datadog_extra_dimensions: list[DatadogDimension] | None = Field(default=None, max_length=25)
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
    connection_type: str = 'management_api'
    metrics_endpoints: str | None = None
    protocol: str
    dns: str
    api_port: int
    api_username: str
    sre_group_id: int | None = None
    datadog_org_id: int | None = None
    datadog_integration_type: str = "custom"
    datadog_cluster_tag_value: str | None = None
    datadog_use_cluster_dimension: bool = True
    datadog_extra_dimensions: list[DatadogDimension] = Field(default_factory=list)
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
