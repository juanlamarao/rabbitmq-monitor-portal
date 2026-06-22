import time

from app.core.config import settings
from app.core.logging import logger
from app.services.directory_service import refresh_directory_cache


def _safe_refresh_directory_cache() -> None:
    try:
        result = refresh_directory_cache()
        logger.info("Cache de pessoas do diretório atualizado. result=%s", result)
    except Exception as exc:  # noqa: BLE001 - worker precisa continuar mesmo se LDAP estiver indisponível.
        logger.exception("Falha ao atualizar cache de pessoas do diretório: %s", exc)


def main():
    logger.info("RabbitMQ Monitor Scheduler iniciado.")
    interval = max(settings.directory_cache_refresh_interval_seconds, 60)

    _safe_refresh_directory_cache()
    while True:
        time.sleep(interval)
        _safe_refresh_directory_cache()


if __name__ == "__main__":
    main()
