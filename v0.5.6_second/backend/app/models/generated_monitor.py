from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class GeneratedMonitor(Base):
    __tablename__ = "generated_monitors"
    __table_args__ = (
        Index("ix_generated_monitors_provider_status", "provider", "status"),
        Index("ix_generated_monitors_provider_grouping", "provider", "grouping_key"),
        Index("ix_generated_monitors_org_status", "datadog_org_id", "sync_status"),
        Index("ix_generated_monitors_template_status", "template_id", "sync_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Campos legados / genéricos, mantidos para compatibilidade com versões anteriores.
    queue_id: Mapped[int | None] = mapped_column(ForeignKey("rabbitmq_queues.id", ondelete="SET NULL"), nullable=True)
    template_id: Mapped[int | None] = mapped_column(ForeignKey("monitor_templates.id", ondelete="SET NULL"), nullable=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False, default="datadog")
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    desired_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    last_applied_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="planned")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Campos v0.5.1 para estado desejado Datadog agrupado.
    datadog_org_id: Mapped[int | None] = mapped_column(ForeignKey("datadog_orgs.id", ondelete="SET NULL"), nullable=True)
    cluster_id: Mapped[int | None] = mapped_column(ForeignKey("rabbitmq_clusters.id", ondelete="SET NULL"), nullable=True)
    monitor_scope_type: Mapped[str] = mapped_column(String(40), nullable=False, default="dedicated_queue_template")
    grouping_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    query: Mapped[str | None] = mapped_column(Text, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    options_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    covered_queues_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sample_queues_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    desired_config_hash: Mapped[str | None] = mapped_column(String(80), nullable=True)
    applied_config_hash: Mapped[str | None] = mapped_column(String(80), nullable=True)
    sync_status: Mapped[str] = mapped_column(String(40), nullable=False, default="planned")
    external_monitor_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_monitor_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_planned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    datadog_org = relationship("DatadogOrg")
    template = relationship("MonitorTemplate")
