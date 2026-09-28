from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.service import create_audit_log
from app.core.config import settings
from app.jobs.cleanup import run_removed_queue_cleanup_job
from app.jobs.discovery import run_queue_discovery_job
from app.jobs.datadog_sync import run_datadog_monitor_sync_job
from app.jobs.queue import default_queue
from app.models.cluster import RabbitMQCluster
from app.models.job import JobHistory

ACTIVE_JOB_STATUSES = ("queued", "running")
DISCOVERY_JOB_TYPE = "discovery_queues"
CLEANUP_REMOVED_QUEUES_JOB_TYPE = "cleanup_removed_queues"
DATADOG_SYNC_JOB_TYPE = "datadog_sync_monitors"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def list_jobs(
    db: Session,
    *,
    status: str | None = None,
    job_type: str | None = None,
    cluster_id: int | None = None,
    limit: int = 100,
) -> list[JobHistory]:
    stmt = select(JobHistory).order_by(JobHistory.created_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(JobHistory.status == status)
    if job_type:
        stmt = stmt.where(JobHistory.job_type == job_type)
    if cluster_id:
        stmt = stmt.where(JobHistory.cluster_id == cluster_id)
    return list(db.scalars(stmt).all())


def get_job(db: Session, job_id: int) -> JobHistory:
    job = db.get(JobHistory, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return job


def _get_active_cluster(db: Session, cluster_id: int) -> RabbitMQCluster:
    cluster = db.get(RabbitMQCluster, cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster não encontrado")
    if not cluster.is_active:
        raise HTTPException(status_code=400, detail=f'Cluster "{cluster.name}" não está ativo.')
    if not cluster.monitor_queues:
        raise HTTPException(status_code=400, detail=f'Cluster "{cluster.name}" não está com monitoramento de queues habilitado.')
    return cluster


def _find_active_discovery_job(db: Session, cluster_id: int) -> JobHistory | None:
    return db.scalar(
        select(JobHistory)
        .where(
            JobHistory.job_type == DISCOVERY_JOB_TYPE,
            JobHistory.cluster_id == cluster_id,
            JobHistory.status.in_(ACTIVE_JOB_STATUSES),
        )
        .order_by(JobHistory.created_at.desc())
        .limit(1)
    )


def _find_active_cleanup_job(db: Session) -> JobHistory | None:
    return db.scalar(
        select(JobHistory)
        .where(
            JobHistory.job_type == CLEANUP_REMOVED_QUEUES_JOB_TYPE,
            JobHistory.status.in_(ACTIVE_JOB_STATUSES),
        )
        .order_by(JobHistory.created_at.desc())
        .limit(1)
    )




def _find_active_datadog_sync_job(
    db: Session,
    *,
    datadog_org_id: int | None = None,
    template_id: int | None = None,
) -> JobHistory | None:
    stmt = (
        select(JobHistory)
        .where(
            JobHistory.job_type == DATADOG_SYNC_JOB_TYPE,
            JobHistory.status.in_(ACTIVE_JOB_STATUSES),
        )
        .order_by(JobHistory.created_at.desc())
        .limit(1)
    )
    # job_history não tem colunas específicas de org/template; usamos details como guardrail simples.
    for job in db.scalars(stmt).all():
        details = job.details or {}
        if datadog_org_id is not None and details.get("datadog_org_id") != datadog_org_id:
            continue
        if template_id is not None and details.get("template_id") != template_id:
            continue
        return job
    return None

def _merge_details(job: JobHistory, data: dict[str, Any]) -> dict[str, Any]:
    details = dict(job.details or {})
    details.update(data)
    return details


def enqueue_cluster_discovery_job(
    db: Session,
    cluster_id: int,
    *,
    source: str = "manual",
    skip_if_active: bool = True,
) -> tuple[JobHistory, bool]:
    """Enfileira discovery de queues para um cluster.

    Retorna (job, skipped), onde skipped=True significa que já havia job queued/running
    para o mesmo cluster e ele foi reaproveitado.
    """
    cluster = _get_active_cluster(db, cluster_id)

    if skip_if_active:
        existing = _find_active_discovery_job(db, cluster.id)
        if existing:
            return existing, True

    job = JobHistory(
        job_type=DISCOVERY_JOB_TYPE,
        status="pending",
        cluster_id=cluster.id,
        summary=f"Discovery de queues enfileirado para {cluster.name}",
        details={
            "source": source,
            "cluster_name": cluster.name,
            "requested_at": _now().isoformat(),
        },
    )
    db.add(job)
    db.flush()
    db.commit()
    db.refresh(job)

    try:
        rq_job = default_queue.enqueue(
            run_queue_discovery_job,
            job.id,
            cluster.id,
            job_timeout=1800,
            result_ttl=86400,
            failure_ttl=604800,
        )
    except Exception as exc:  # noqa: BLE001
        job.status = "error"
        job.finished_at = _now()
        job.summary = f"Falha ao enfileirar discovery de queues para {cluster.name}"
        job.details = _merge_details(job, {"enqueue_error": str(exc)})
        db.commit()
        raise HTTPException(status_code=500, detail=f"Falha ao enfileirar job no Redis/RQ: {exc}") from exc

    job.status = "queued"
    job.details = _merge_details(job, {"rq_job_id": rq_job.id})

    create_audit_log(
        db,
        entity_type="job",
        entity_id=job.id,
        action="queued",
        summary=f"Job de discovery de queues enfileirado para {cluster.name}",
        after_data={"job_id": job.id, "cluster_id": cluster.id, "source": source, "rq_job_id": rq_job.id},
    )
    db.commit()
    db.refresh(job)
    return job, False


def enqueue_all_active_cluster_discoveries(
    db: Session,
    *,
    source: str = "scheduler",
    skip_if_active: bool = True,
) -> dict[str, Any]:
    clusters = list(
        db.scalars(
            select(RabbitMQCluster)
            .where(RabbitMQCluster.is_active.is_(True), RabbitMQCluster.monitor_queues.is_(True))
            .order_by(RabbitMQCluster.name)
        ).all()
    )

    enqueued_jobs: list[JobHistory] = []
    skipped_jobs: list[JobHistory] = []
    errors: list[dict[str, Any]] = []

    for cluster in clusters:
        try:
            job, skipped = enqueue_cluster_discovery_job(
                db,
                cluster.id,
                source=source,
                skip_if_active=skip_if_active,
            )
            if skipped:
                skipped_jobs.append(job)
            else:
                enqueued_jobs.append(job)
        except Exception as exc:  # noqa: BLE001 - enfileira o máximo possível e reporta falhas pontuais.
            errors.append({"cluster_id": cluster.id, "cluster_name": cluster.name, "error": str(exc)})

    return {
        "enqueued": len(enqueued_jobs),
        "skipped": len(skipped_jobs),
        "errors": errors,
        "jobs": enqueued_jobs,
        "skipped_jobs": skipped_jobs,
    }


def enqueue_removed_queue_cleanup_job(
    db: Session,
    *,
    source: str = "manual",
    skip_if_active: bool = True,
    retention_days: int | None = None,
) -> tuple[JobHistory, bool]:
    """Enfileira limpeza física de queues marcadas como removidas há mais de N dias."""
    if skip_if_active:
        existing = _find_active_cleanup_job(db)
        if existing:
            return existing, True

    effective_retention_days = retention_days or settings.removed_queue_retention_days
    job = JobHistory(
        job_type=CLEANUP_REMOVED_QUEUES_JOB_TYPE,
        status="pending",
        cluster_id=None,
        summary=f"Cleanup de queues removidas enfileirado. Retenção: {effective_retention_days} dias.",
        details={
            "source": source,
            "retention_days": effective_retention_days,
            "requested_at": _now().isoformat(),
        },
    )
    db.add(job)
    db.flush()
    db.commit()
    db.refresh(job)

    try:
        rq_job = default_queue.enqueue(
            run_removed_queue_cleanup_job,
            job.id,
            effective_retention_days,
            job_timeout=1800,
            result_ttl=86400,
            failure_ttl=604800,
        )
    except Exception as exc:  # noqa: BLE001
        job.status = "error"
        job.finished_at = _now()
        job.summary = "Falha ao enfileirar cleanup de queues removidas"
        job.details = _merge_details(job, {"enqueue_error": str(exc)})
        db.commit()
        raise HTTPException(status_code=500, detail=f"Falha ao enfileirar job no Redis/RQ: {exc}") from exc

    job.status = "queued"
    job.details = _merge_details(job, {"rq_job_id": rq_job.id})

    create_audit_log(
        db,
        entity_type="job",
        entity_id=job.id,
        action="queued",
        summary="Job de cleanup de queues removidas enfileirado",
        after_data={"job_id": job.id, "source": source, "retention_days": effective_retention_days, "rq_job_id": rq_job.id},
    )
    db.commit()
    db.refresh(job)
    return job, False


def enqueue_datadog_monitor_sync_job(
    db: Session,
    *,
    datadog_org_id: int | None = None,
    template_id: int | None = None,
    monitor_ids: list[int] | None = None,
    source: str = "manual",
    skip_if_active: bool = True,
) -> tuple[JobHistory, bool]:
    """Enfileira criação/atualização de monitores dedicados no Datadog."""
    if skip_if_active and not monitor_ids:
        existing = _find_active_datadog_sync_job(db, datadog_org_id=datadog_org_id, template_id=template_id)
        if existing:
            return existing, True

    job = JobHistory(
        job_type=DATADOG_SYNC_JOB_TYPE,
        status="pending",
        cluster_id=None,
        summary="Sync de monitores Datadog enfileirado",
        details={
            "source": source,
            "datadog_org_id": datadog_org_id,
            "template_id": template_id,
            "monitor_ids": monitor_ids,
            "requested_at": _now().isoformat(),
        },
    )
    db.add(job)
    db.flush()
    db.commit()
    db.refresh(job)

    try:
        rq_job = default_queue.enqueue(
            run_datadog_monitor_sync_job,
            job.id,
            datadog_org_id,
            template_id,
            monitor_ids,
            job_timeout=3600,
            result_ttl=86400,
            failure_ttl=604800,
        )
    except Exception as exc:  # noqa: BLE001
        job.status = "error"
        job.finished_at = _now()
        job.summary = "Falha ao enfileirar sync de monitores Datadog"
        job.details = _merge_details(job, {"enqueue_error": str(exc)})
        db.commit()
        raise HTTPException(status_code=500, detail=f"Falha ao enfileirar job no Redis/RQ: {exc}") from exc

    job.status = "queued"
    job.details = _merge_details(job, {"rq_job_id": rq_job.id})

    create_audit_log(
        db,
        entity_type="job",
        entity_id=job.id,
        action="queued",
        summary="Job de sync de monitores Datadog enfileirado",
        after_data={
            "job_id": job.id,
            "source": source,
            "datadog_org_id": datadog_org_id,
            "template_id": template_id,
            "monitor_ids": monitor_ids,
            "rq_job_id": rq_job.id,
        },
    )
    db.commit()
    db.refresh(job)
    return job, False


def retry_job(db: Session, job_id: int) -> JobHistory:
    original = get_job(db, job_id)

    if original.job_type == DISCOVERY_JOB_TYPE:
        if not original.cluster_id:
            raise HTTPException(status_code=400, detail="Job não possui cluster associado para reexecução.")
        job, _ = enqueue_cluster_discovery_job(
            db,
            original.cluster_id,
            source=f"retry:{original.id}",
            skip_if_active=False,
        )
        return job

    if original.job_type == CLEANUP_REMOVED_QUEUES_JOB_TYPE:
        retention_days = None
        if original.details and isinstance(original.details.get("retention_days"), int):
            retention_days = original.details["retention_days"]
        job, _ = enqueue_removed_queue_cleanup_job(
            db,
            source=f"retry:{original.id}",
            skip_if_active=False,
            retention_days=retention_days,
        )
        return job


    if original.job_type == DATADOG_SYNC_JOB_TYPE:
        details = original.details or {}
        job, _ = enqueue_datadog_monitor_sync_job(
            db,
            datadog_org_id=details.get("datadog_org_id"),
            template_id=details.get("template_id"),
            monitor_ids=details.get("monitor_ids"),
            source=f"retry:{original.id}",
            skip_if_active=False,
        )
        return job

    raise HTTPException(status_code=400, detail=f'Job do tipo "{original.job_type}" não pode ser reexecutado neste momento.')
