"""Histórico e controle de exclusividade da reconciliação Datadog."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class DatadogReconcileRun(Base):
    __tablename__ = 'datadog_reconcile_runs'
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default='queued')
    trigger: Mapped[str] = mapped_column(String(24), nullable=False)
    requested_by: Mapped[str] = mapped_column(String(255), nullable=False)
    stage: Mapped[str] = mapped_column(String(120), nullable=False, default='Aguardando worker')
    current_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_orgs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_orgs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_clusters: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_clusters: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_queues: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_queues: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recovered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    errors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    untracked_remote: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class DatadogReconcileCluster(Base):
    __tablename__ = 'datadog_reconcile_clusters'
    run_id: Mapped[int] = mapped_column(ForeignKey('datadog_reconcile_runs.id', ondelete='CASCADE'), primary_key=True)
    cluster_id: Mapped[int] = mapped_column(primary_key=True)
    cluster_name: Mapped[str] = mapped_column(String(255), nullable=False)
    org_name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default='pending')
    total_queues: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_queues: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_queue: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_action: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    errors: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class DatadogReconcileControl(Base):
    __tablename__ = 'datadog_reconcile_control'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    active_run_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
