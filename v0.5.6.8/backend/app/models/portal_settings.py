from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PortalUISettings(Base):
    """Single global appearance configuration, shared by every user/session."""

    __tablename__ = "portal_ui_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    layout: Mapped[str] = mapped_column(String(24), nullable=False, default="corporate")
    theme: Mapped[str] = mapped_column(String(24), nullable=False, default="btg_light")
    login_particles: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
