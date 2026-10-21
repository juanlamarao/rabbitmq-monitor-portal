from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.database import SessionLocal
from app.core.logging import logger
from app.models.job import JobHistory
from app.services.datadog_sync_service import apply_datadog_monitors


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _merge_details(job: JobHistory, data: dict[str, Any]) -> dict[str, Any]:
    details = dict(job.details or {})
    details.update(data)
    return details


def run_datadog_monitor_sync_job(
    job_id: int,
    datadog_org_id: int | None = None,
    template_id: int | None = None,
    monitor_ids: list[int] | None = None,
) -> dict[str, Any]:
    with SessionLocal() as db:
        job = db.get(JobHistory, job_id)
        if not job:
            raise RuntimeError(f"Job {job_id} não encontrado")

        job.status = "running"
        job.started_at = _now()
        job.summary = "Sync de monitores Datadog em execução"
        job.details = _merge_details(
            job,
            {
                "datadog_org_id": datadog_org_id,
                "template_id": template_id,
                "monitor_ids": monitor_ids,
            },
        )
        db.commit()

        try:
            result = apply_datadog_monitors(
                db,
                datadog_org_id=datadog_org_id,
                template_id=template_id,
                monitor_ids=monitor_ids,
                actor="worker",
            )
            result_data = result.to_dict()
            job.status = "success" if result.failed == 0 else "error"
            job.finished_at = _now()
            job.summary = (
                f"Sync Datadog finalizado: {result.created} criados, {result.updated} atualizados, "
                f"{result.failed} falhas, {result.skipped} ignorados."
            )
            job.details = _merge_details(job, result_data)
            db.commit()
            return result_data
        except Exception as exc:  # noqa: BLE001
            logger.exception("Falha no sync de monitores Datadog. job_id=%s", job_id)
            job.status = "error"
            job.finished_at = _now()
            job.summary = "Falha no sync de monitores Datadog"
            job.details = _merge_details(job, {"error": str(exc)})
            db.commit()
            raise
