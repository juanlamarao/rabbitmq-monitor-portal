from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.mysql import BIGINT
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class PortalUser(Base):
    __tablename__ = 'portal_users'
    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False)
    object_id: Mapped[str] = mapped_column(String(64), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    __table_args__ = (UniqueConstraint('tenant_id','object_id',name='uq_portal_users_entra_identity'),)

class EntraAccessGroup(Base):
    __tablename__ = 'entra_access_groups'
    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    object_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    clusters = relationship('EntraGroupCluster', cascade='all, delete-orphan', back_populates='group')

class EntraGroupCluster(Base):
    __tablename__ = 'entra_group_clusters'
    id: Mapped[int] = mapped_column(BIGINT(unsigned=True), primary_key=True)
    group_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), ForeignKey('entra_access_groups.id',ondelete='CASCADE'),nullable=False)
    cluster_id: Mapped[int] = mapped_column(BIGINT(unsigned=True), ForeignKey('rabbitmq_clusters.id',ondelete='CASCADE'),nullable=False)
    group = relationship('EntraAccessGroup', back_populates='clusters')
    __table_args__ = (UniqueConstraint('group_id','cluster_id',name='uq_entra_group_cluster'),)
