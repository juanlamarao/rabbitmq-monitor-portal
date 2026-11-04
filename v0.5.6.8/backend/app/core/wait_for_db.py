"""Kubernetes initContainer: wait until the MySQL schema is available.

This is not a migration runner. The fresh DEV schema is installed by the MySQL
/docker-entrypoint-initdb.d bootstrap; existing databases need an explicit migration.
"""
import logging
import time
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from app.core.config import settings
from app.core.database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    logger.info(
        "Verificando schema MySQL: host=%s porta=%s banco=%s usuario=%s",
        settings.mysql_host,
        settings.mysql_port,
        settings.mysql_database,
        settings.mysql_user,
    )
    for attempt in range(1, 61):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1 FROM monitor_templates LIMIT 1"))
            logger.info("Schema MySQL disponível.")
            return
        except Exception as exc:
            # Mostra classe do erro e código MySQL, sem registrar usuário/senha/DSN.
            mysql_code = None
            if isinstance(exc, DBAPIError) and getattr(exc.orig, "args", None):
                mysql_code = exc.orig.args[0]
            logger.warning(
                "Aguardando schema MySQL (tentativa %s/60): erro=%s mysql_code=%s",
                attempt,
                type(exc).__name__,
                mysql_code,
            )
            if attempt == 60:
                raise
            time.sleep(5)


if __name__ == "__main__":
    main()
