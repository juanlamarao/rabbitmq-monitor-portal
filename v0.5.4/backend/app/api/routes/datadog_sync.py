from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.datadog_sync import DatadogPlanPersistRequest, DatadogPlanPersistResult, DatadogPlanRead, GeneratedMonitorRead
from app.services.datadog_planner_service import build_datadog_plan, list_generated_monitors, persist_datadog_plan
from app.services.datadog_sync_service import validate_datadog_monitor_state

router = APIRouter()


@router.get("/plan", response_model=DatadogPlanRead)
def route_datadog_plan(
    datadog_org_id: int | None = None,
    template_id: int | None = None,
    sample_limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return build_datadog_plan(db, datadog_org_id=datadog_org_id, template_id=template_id, sample_limit=sample_limit)


@router.post("/plan/persist", response_model=DatadogPlanPersistResult)
def route_persist_datadog_plan(payload: DatadogPlanPersistRequest, db: Session = Depends(get_db)):
    return persist_datadog_plan(
        db,
        datadog_org_id=payload.datadog_org_id,
        template_id=payload.template_id,
        sample_limit=payload.sample_limit,
    )


@router.get("/generated-monitors", response_model=list[GeneratedMonitorRead])
def route_generated_monitors(
    datadog_org_id: int | None = None,
    template_id: int | None = None,
    sync_status: str | None = None,
    active_only: bool = True,
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    return list_generated_monitors(
        db,
        datadog_org_id=datadog_org_id,
        template_id=template_id,
        sync_status=sync_status,
        active_only=active_only,
        limit=limit,
    )


@router.post("/generated-monitors/{monitor_id}/validate")
def route_validate_generated_monitor(monitor_id: int, db: Session = Depends(get_db)):
    return validate_datadog_monitor_state(db, monitor_id, actor="manual")
