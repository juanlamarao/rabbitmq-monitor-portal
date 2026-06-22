from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Index, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MonitorTemplate(Base):
    __tablename__ = "monitor_templates"
    __table_args__ = (Index("ix_monitor_templates_component_active", "component_type", "is_active"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    component_type: Mapped[str] = mapped_column(String(40), nullable=False, default="queue")
    monitor_kind: Mapped[str] = mapped_column(String(80), nullable=False)
    default_config: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    queue_bindings = relationship("QueueMonitorTemplate", back_populates="template")


class QueueMonitorTemplate(Base):
    __tablename__ = "queue_monitor_templates"
    __table_args__ = (
        UniqueConstraint("queue_id", "template_id", name="uq_queue_template"),
        Index("ix_queue_monitor_templates_enabled", "enabled"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    queue_id: Mapped[int] = mapped_column(ForeignKey("rabbitmq_queues.id", ondelete="CASCADE"), nullable=False)
    template_id: Mapped[int] = mapped_column(ForeignKey("monitor_templates.id", ondelete="CASCADE"), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    overrides: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    queue = relationship("RabbitMQQueue", back_populates="template_bindings")
    template = relationship("MonitorTemplate", back_populates="queue_bindings")
