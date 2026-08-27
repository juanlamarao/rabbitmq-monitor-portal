from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.job import JobBulkEnqueueRead, JobHistoryRead
from app.services.job_service import (
    enqueue_all_active_cluster_discoveries,
    enqueue_cluster_discovery_job,
    enqueue_removed_queue_cleanup_job,
    get_job,
    list_jobs,
    retry_job,
)

router = APIRouter()


@router.get("", response_model=list[JobHistoryRead])
def route_list_jobs(
    status: str | None = Query(default=None),
    job_type: str | None = Query(default=None),
    cluster_id: int | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return list_jobs(db, status=status, job_type=job_type, cluster_id=cluster_id, limit=limit)


@router.get("/{job_id}", response_model=JobHistoryRead)
def route_get_job(job_id: int, db: Session = Depends(get_db)):
    return get_job(db, job_id)


@router.post("/discovery/cluster/{cluster_id}", response_model=JobHistoryRead, status_code=202)
def route_enqueue_cluster_discovery(cluster_id: int, db: Session = Depends(get_db)):
    job, _ = enqueue_cluster_discovery_job(db, cluster_id, source="manual", skip_if_active=True)
    return job


@router.post("/discovery/all", response_model=JobBulkEnqueueRead, status_code=202)
def route_enqueue_all_cluster_discoveries(db: Session = Depends(get_db)):
    return enqueue_all_active_cluster_discoveries(db, source="manual", skip_if_active=True)


@router.post("/cleanup/removed-queues", response_model=JobHistoryRead, status_code=202)
def route_enqueue_removed_queue_cleanup(db: Session = Depends(get_db)):
    job, _ = enqueue_removed_queue_cleanup_job(db, source="manual", skip_if_active=True)
    return job


@router.post("/{job_id}/retry", response_model=JobHistoryRead, status_code=202)
def route_retry_job(job_id: int, db: Session = Depends(get_db)):
    return retry_job(db, job_id)
