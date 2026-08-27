from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RabbitMQQueue(Base):
    __tablename__ = "rabbitmq_queues"
    __table_args__ = (
        UniqueConstraint("cluster_id", "vhost", "name", name="uq_queue_cluster_vhost_name"),
        Index("ix_queues_cluster_removed", "cluster_id", "is_removed"),
        Index("ix_queues_name", "name"),
        Index("ix_queues_vhost", "vhost"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cluster_id: Mapped[int] = mapped_column(ForeignKey("rabbitmq_clusters.id", ondelete="CASCADE"), nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    vhost: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    durable: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    auto_delete: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    exclusive: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    api_raw: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    criticality: Mapped[str | None] = mapped_column(String(40), nullable=True)
    owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    journey: Mapped[str | None] = mapped_column(String(255), nullable=True)
    service_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    monitoring_schedule: Mapped[str] = mapped_column(String(40), nullable=False, default="24x7")
    monitoring_custom_window: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dev_emails: Mapped[list | None] = mapped_column(JSON, nullable=True)
    is_dead_letter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    monitor_anomaly: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    monitor_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_temporary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    is_removed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    discovered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    cluster = relationship("RabbitMQCluster", back_populates="queues")
    template_bindings = relationship("QueueMonitorTemplate", back_populates="queue", cascade="all, delete-orphan")

    @property
    def applied_templates(self) -> list[dict]:
        summaries = []
        for binding in self.template_bindings or []:
            template = getattr(binding, "template", None)
            if not template:
                continue
            summaries.append(
                {
                    "template_id": binding.template_id,
                    "code": template.code,
                    "enabled": binding.enabled,
                    "is_customized": bool(binding.overrides),
                }
            )
        return summaries
