"""Fila transacional por RabbitMQ queue (estado mais recente, sem perder mudanças)."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class DatadogSyncQueue(Base):
    __tablename__ = 'datadog_sync_queue'
    __table_args__ = (Index('ix_dd_sync_state_retry', 'status', 'next_retry_at'),)
    queue_id: Mapped[int] = mapped_column(ForeignKey('rabbitmq_queues.id', ondelete='CASCADE'), primary_key=True)
    desired_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    applied_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default='pending')
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reason: Mapped[str] = mapped_column(String(150), nullable=False, default='change')
    requested_by: Mapped[str] = mapped_column(String(255), nullable=False, default='system')
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
