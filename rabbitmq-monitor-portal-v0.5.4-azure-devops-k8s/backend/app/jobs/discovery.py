from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from app.core.database import SessionLocal
from app.core.logging import logger
from app.models.job import JobHistory
from app.services.cluster_service import discover_queues


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _merge_details(job: JobHistory, data: dict[str, Any]) -> dict[str, Any]:
    details = dict(job.details or {})
    details.update(data)
    return details


def _exception_message(exc: Exception) -> str:
    if isinstance(exc, HTTPException):
        return str(exc.detail)
    return str(exc)


def run_queue_discovery_job(job_history_id: int, cluster_id: int) -> dict[str, Any]:
    """Executa discovery de queues via worker RQ.

    Esta função precisa ser síncrona para o RQ. A chamada async à API RabbitMQ
    é executada internamente com asyncio.run().
    """
    with SessionLocal() as db:
        job = db.get(JobHistory, job_history_id)
        if not job:
            raise RuntimeError(f"JobHistory {job_history_id} não encontrado")

        job.status = "running"
        job.started_at = _now()
        job.summary = "Discovery de queues em execução"
        job.details = _merge_details(job, {"started_by_worker_at": job.started_at.isoformat()})
        db.commit()

        try:
            result = asyncio.run(discover_queues(db, cluster_id))
            finished_at = _now()

            job = db.get(JobHistory, job_history_id)
            if not job:
                raise RuntimeError(f"JobHistory {job_history_id} não encontrado após discovery")

            result_data = result.model_dump()
            job.status = "success"
            job.finished_at = finished_at
            job.summary = (
                f"Discovery concluído: {result.fetched} filas encontradas, "
                f"{result.created} criadas, {result.updated} atualizadas, "
                f"{result.restored} restauradas e {result.marked_removed} removidas."
            )
            job.details = _merge_details(job, {"result": result_data})
            db.commit()
            logger.info("Discovery de queues concluído. job_id=%s cluster_id=%s result=%s", job_history_id, cluster_id, result_data)
            return result_data
        except Exception as exc:  # noqa: BLE001 - registrar falha no histórico antes de propagar para o RQ.
            finished_at = _now()
            job = db.get(JobHistory, job_history_id)
            if job:
                message = _exception_message(exc)
                job.status = "error"
                job.finished_at = finished_at
                job.summary = f"Falha no discovery de queues: {message}"
                job.details = _merge_details(job, {"error": message})
                db.commit()
            logger.exception("Falha no discovery de queues. job_id=%s cluster_id=%s", job_history_id, cluster_id)
            raise
