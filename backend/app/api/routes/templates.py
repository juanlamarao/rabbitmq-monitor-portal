from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.monitor_template import MonitorTemplateRead
from app.services.template_service import list_templates

router = APIRouter()


@router.get("", response_model=list[MonitorTemplateRead])
def route_list_templates(component_type: str | None = None, db: Session = Depends(get_db)):
    return list_templates(db, component_type=component_type)
