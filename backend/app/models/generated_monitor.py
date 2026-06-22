from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GeneratedMonitor(Base):
    __tablename__ = "generated_monitors"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    queue_id: Mapped[int | None] = mapped_column(ForeignKey("rabbitmq_queues.id", ondelete="SET NULL"), nullable=True)
    template_id: Mapped[int | None] = mapped_column(ForeignKey("monitor_templates.id", ondelete="SET NULL"), nullable=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    desired_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    last_applied_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
