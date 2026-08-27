from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import logger
from app.models.job import JobHistory
from app.services.queue_cleanup_service import cleanup_removed_queues


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _merge_details(job: JobHistory, data: dict[str, Any]) -> dict[str, Any]:
    details = dict(job.details or {})
    details.update(data)
    return details


def run_removed_queue_cleanup_job(job_history_id: int, retention_days: int | None = None) -> dict[str, Any]:
    """Executa expurgo físico de queues removidas via worker RQ."""
    with SessionLocal() as db:
        job = db.get(JobHistory, job_history_id)
        if not job:
            raise RuntimeError(f"JobHistory {job_history_id} não encontrado")

        job.status = "running"
        job.started_at = _now()
        job.summary = "Cleanup de queues removidas em execução"
        job.details = _merge_details(job, {"started_by_worker_at": job.started_at.isoformat()})
        db.commit()

        try:
            effective_retention_days = retention_days or settings.removed_queue_retention_days
            result = cleanup_removed_queues(db, retention_days=effective_retention_days)
            finished_at = _now()

            job = db.get(JobHistory, job_history_id)
            if not job:
                raise RuntimeError(f"JobHistory {job_history_id} não encontrado após cleanup")

            job.status = "success"
            job.finished_at = finished_at
            job.summary = f"Cleanup concluído: {result['deleted']} queues removidas fisicamente."
            job.details = _merge_details(job, {"result": result})
            db.commit()
            logger.info("Cleanup de queues removidas concluído. job_id=%s result=%s", job_history_id, result)
            return result
        except Exception as exc:  # noqa: BLE001
            finished_at = _now()
            job = db.get(JobHistory, job_history_id)
            if job:
                message = str(exc)
                job.status = "error"
                job.finished_at = finished_at
                job.summary = f"Falha no cleanup de queues removidas: {message}"
                job.details = _merge_details(job, {"error": message})
                db.commit()
            logger.exception("Falha no cleanup de queues removidas. job_id=%s", job_history_id)
            raise
