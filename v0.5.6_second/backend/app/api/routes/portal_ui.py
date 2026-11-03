"""Global appearance settings. GET is public so the login screen shares the same look."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.audit.service import create_audit_log
from app.core.auth import actor_name
from app.core.database import get_db
from app.models.portal_settings import PortalUISettings

router = APIRouter()


class AppearancePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    layout: Literal["corporate", "workspace"]
    theme: Literal["btg_light"] = "btg_light"
    login_particles: bool = True


def _view(item: PortalUISettings | None) -> dict:
    return {
        "layout": item.layout if item else "corporate",
        "theme": item.theme if item else "btg_light",
        "login_particles": item.login_particles if item else True,
        "updated_at": item.updated_at if item else None,
    }


@router.get("/settings")
def get_appearance(db: Session = Depends(get_db)):
    return _view(db.get(PortalUISettings, 1))


@router.put("/settings")
def update_appearance(payload: AppearancePayload, db: Session = Depends(get_db)):
    item = db.get(PortalUISettings, 1)
    before = _view(item)
    if item is None:
        item = PortalUISettings(id=1)
        db.add(item)
    item.layout = payload.layout
    item.theme = payload.theme
    item.login_particles = payload.login_particles
    item.updated_by = actor_name()
    # Middleware supplies request-scoped audit identity via actor_name().
    create_audit_log(
        db,
        entity_type="portal_ui_settings",
        entity_id=1,
        action="updated",
        summary="Aparência global do Monitor Portal atualizada",
        before_data=before,
        after_data=payload.model_dump(),
    )
    db.commit()
    db.refresh(item)
    return _view(item)
