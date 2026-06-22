from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RabbitMQCluster(Base):
    __tablename__ = "rabbitmq_clusters"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    environment: Mapped[str] = mapped_column(String(20), nullable=False)
    business_line: Mapped[str | None] = mapped_column(Text, nullable=True)

    protocol: Mapped[str] = mapped_column(String(10), nullable=False, default="https")
    dns: Mapped[str] = mapped_column(String(255), nullable=False)
    api_port: Mapped[int] = mapped_column(Integer, nullable=False, default=15672)

    api_username: Mapped[str] = mapped_column(String(180), nullable=False)
    api_password_encrypted: Mapped[str] = mapped_column(Text, nullable=False)

    sre_group_id: Mapped[int | None] = mapped_column(ForeignKey("sre_groups.id", ondelete="SET NULL"), nullable=True)
    datadog_org_id: Mapped[int | None] = mapped_column(ForeignKey("datadog_orgs.id", ondelete="SET NULL"), nullable=True)

    monitor_cluster: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    monitor_queues: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    monitor_exchanges: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    monitor_connections: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    monitor_nodes: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    monitor_shovels: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_discovery_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    sre_group = relationship("SREGroup", back_populates="clusters")
    datadog_org = relationship("DatadogOrg", back_populates="clusters")
    temporary_queue_regexes = relationship(
        "ClusterTemporaryQueueRegex",
        back_populates="cluster",
        cascade="all, delete-orphan",
        order_by="ClusterTemporaryQueueRegex.position",
    )
    queues = relationship("RabbitMQQueue", back_populates="cluster", cascade="all, delete-orphan")

    @property
    def api_base_url(self) -> str:
        return f"{self.protocol}://{self.dns}:{self.api_port}"


class ClusterTemporaryQueueRegex(Base):
    __tablename__ = "cluster_temporary_queue_regexes"
    __table_args__ = (UniqueConstraint("cluster_id", "position", name="uq_cluster_temp_regex_position"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    cluster_id: Mapped[int] = mapped_column(ForeignKey("rabbitmq_clusters.id", ondelete="CASCADE"), nullable=False)
    pattern: Mapped[str] = mapped_column(String(500), nullable=False, default="^$")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    cluster = relationship("RabbitMQCluster", back_populates="temporary_queue_regexes")
