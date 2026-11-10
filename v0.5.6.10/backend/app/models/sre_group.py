from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SREGroup(Base):
    __tablename__ = "sre_groups"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    clusters = relationship("RabbitMQCluster", back_populates="sre_group")
    members = relationship(
        "SREGroupMember",
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="SREGroupMember.position",
    )


class SREGroupMember(Base):
    __tablename__ = "sre_group_members"
    __table_args__ = (UniqueConstraint("sre_group_id", "email", name="uq_sre_group_member_email"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    sre_group_id: Mapped[int] = mapped_column(ForeignKey("sre_groups.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    group = relationship("SREGroup", back_populates="members")
