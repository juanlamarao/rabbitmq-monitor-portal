import time

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import logger
from app.services.directory_service import refresh_directory_cache
from app.services.job_service import enqueue_all_active_cluster_discoveries, enqueue_removed_queue_cleanup_job


def _safe_refresh_directory_cache() -> None:
    try:
        result = refresh_directory_cache()
        logger.info("Cache de pessoas do diretório atualizado. result=%s", result)
    except Exception as exc:  # noqa: BLE001 - scheduler precisa continuar mesmo se LDAP estiver indisponível.
        logger.exception("Falha ao atualizar cache de pessoas do diretório: %s", exc)


def _safe_enqueue_discovery_jobs() -> None:
    try:
        with SessionLocal() as db:
            result = enqueue_all_active_cluster_discoveries(db, source="scheduler", skip_if_active=True)
        logger.info(
            "Ciclo de discovery enfileirado. enqueued=%s skipped=%s errors=%s",
            result.get("enqueued"),
            result.get("skipped"),
            result.get("errors"),
        )
    except Exception as exc:  # noqa: BLE001 - scheduler precisa continuar mesmo se Redis/MySQL falharem temporariamente.
        logger.exception("Falha ao enfileirar discoveries recorrentes: %s", exc)


def _safe_enqueue_removed_queue_cleanup() -> None:
    try:
        with SessionLocal() as db:
            job, skipped = enqueue_removed_queue_cleanup_job(db, source="scheduler", skip_if_active=True)
        logger.info("Ciclo de cleanup de queues removidas enfileirado. job_id=%s skipped=%s", job.id, skipped)
    except Exception as exc:  # noqa: BLE001 - scheduler precisa continuar mesmo se Redis/MySQL falharem temporariamente.
        logger.exception("Falha ao enfileirar cleanup de queues removidas: %s", exc)


def main():
    logger.info("RabbitMQ Monitor Scheduler iniciado.")
    directory_interval = max(settings.directory_cache_refresh_interval_seconds, 60)
    discovery_interval = max(settings.discovery_scheduler_interval_seconds, 60)
    cleanup_interval = max(settings.removed_queue_cleanup_interval_seconds, 3600)

    logger.info(
        "Intervalos do scheduler: directory=%ss discovery=%ss cleanup_removed_queues=%ss retention_days=%s",
        directory_interval,
        discovery_interval,
        cleanup_interval,
        settings.removed_queue_retention_days,
    )

    last_directory_refresh = 0.0
    last_discovery_enqueue = 0.0
    last_cleanup_enqueue = 0.0

    while True:
        now = time.monotonic()

        if now - last_directory_refresh >= directory_interval:
            _safe_refresh_directory_cache()
            last_directory_refresh = now

        if now - last_discovery_enqueue >= discovery_interval:
            _safe_enqueue_discovery_jobs()
            last_discovery_enqueue = now

        if now - last_cleanup_enqueue >= cleanup_interval:
            _safe_enqueue_removed_queue_cleanup()
            last_cleanup_enqueue = now

        time.sleep(5)


if __name__ == "__main__":
    main()
