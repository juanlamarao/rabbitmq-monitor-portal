from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class JobHistoryRead(ORMModel):
    id: int
    job_type: str
    status: str
    cluster_id: int | None = None
    summary: str | None = None
    details: dict[str, Any] | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime


class JobBulkEnqueueRead(BaseModel):
    enqueued: int
    skipped: int
    errors: list[dict[str, Any]] = Field(default_factory=list)
    jobs: list[JobHistoryRead] = Field(default_factory=list)
    skipped_jobs: list[JobHistoryRead] = Field(default_factory=list)
