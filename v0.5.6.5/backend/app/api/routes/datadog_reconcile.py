"""Acompanhamento da reconciliação. Permissões aplicadas no middleware global."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.auth import actor_name
from app.core.database import get_db
from app.models.datadog_reconciliation import DatadogReconcileRun
from app.services.datadog_reconcile_service import describe_run, enqueue_reconciliation

router = APIRouter()

@router.get('/latest')
def latest(db: Session = Depends(get_db)):
    run = db.scalar(select(DatadogReconcileRun).order_by(DatadogReconcileRun.id.desc()).limit(1))
    return describe_run(db,run) if run else None

@router.post('/start', status_code=202)
def start(db: Session = Depends(get_db)):
    run = enqueue_reconciliation(db, actor=actor_name(), trigger='manual')
    return describe_run(db,run)

@router.get('/{run_id}')
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(DatadogReconcileRun,run_id)
    if not run:
        raise HTTPException(404,'Execução não encontrada.')
    return describe_run(db,run)
