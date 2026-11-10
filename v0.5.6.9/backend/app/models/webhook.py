"""Três configurações globais de webhook e estado observado por organização Datadog."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class DatadogWebhookTemplate(Base):
    __tablename__ = "datadog_webhook_templates"
    kind: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False, default="")
    payload: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    custom_headers: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

class DatadogWebhookOrgState(Base):
    __tablename__ = "datadog_webhook_org_states"
    __table_args__ = (UniqueConstraint('org_id', 'kind', name='uq_webhook_org_kind'),)
    org_id: Mapped[int] = mapped_column(ForeignKey('datadog_orgs.id', ondelete='CASCADE'), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default='unknown')
    remote_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
