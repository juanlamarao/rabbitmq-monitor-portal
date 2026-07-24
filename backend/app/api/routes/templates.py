from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.monitor_template import (
    MonitorTemplateCreate,
    MonitorTemplateRead,
    MonitorTemplateUpdate,
    TemplateImpactRead,
    TemplateImpactRequest,
    TemplateUsageRead,
)
from app.services.template_service import (
    create_template,
    deactivate_template,
    delete_template,
    get_template,
    get_template_usage,
    list_templates,
    preview_template_impact,
    reactivate_template,
    update_template,
)

router = APIRouter()


@router.get("", response_model=list[MonitorTemplateRead])
def route_list_templates(
    component_type: str | None = None,
    active_only: bool = False,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    return list_templates(db, component_type=component_type, active_only=active_only, search=search)


@router.post("", response_model=MonitorTemplateRead, status_code=status.HTTP_201_CREATED)
def route_create_template(payload: MonitorTemplateCreate, db: Session = Depends(get_db)):
    return create_template(db, payload)


@router.get("/{template_id}", response_model=MonitorTemplateRead)
def route_get_template(template_id: int, db: Session = Depends(get_db)):
    return get_template(db, template_id)


@router.put("/{template_id}", response_model=MonitorTemplateRead)
def route_update_template(template_id: int, payload: MonitorTemplateUpdate, db: Session = Depends(get_db)):
    return update_template(db, template_id, payload)


@router.post("/{template_id}/deactivate", response_model=MonitorTemplateRead)
def route_deactivate_template(template_id: int, db: Session = Depends(get_db)):
    return deactivate_template(db, template_id)


@router.post("/{template_id}/reactivate", response_model=MonitorTemplateRead)
def route_reactivate_template(template_id: int, db: Session = Depends(get_db)):
    return reactivate_template(db, template_id)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def route_delete_template(template_id: int, db: Session = Depends(get_db)):
    delete_template(db, template_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{template_id}/usage", response_model=TemplateUsageRead)
def route_get_template_usage(template_id: int, db: Session = Depends(get_db)):
    return get_template_usage(db, template_id)


@router.post("/{template_id}/impact", response_model=TemplateImpactRead)
def route_preview_template_impact(template_id: int, payload: TemplateImpactRequest, db: Session = Depends(get_db)):
    return preview_template_impact(db, template_id, payload.default_config)
