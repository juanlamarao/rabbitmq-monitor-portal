from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.job import JobHistory
from app.schemas.job import JobHistoryRead

router = APIRouter()


@router.get("", response_model=list[JobHistoryRead])
def list_jobs(limit: int = Query(default=100, ge=1, le=500), db: Session = Depends(get_db)):
    return db.scalars(select(JobHistory).order_by(JobHistory.created_at.desc()).limit(limit)).all()
