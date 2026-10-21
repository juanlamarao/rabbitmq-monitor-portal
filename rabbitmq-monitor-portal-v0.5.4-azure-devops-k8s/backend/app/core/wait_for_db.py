"""Kubernetes initContainer: wait until the MySQL schema is available.

This is not a migration runner. The fresh DEV schema is installed by the MySQL
/docker-entrypoint-initdb.d bootstrap; existing databases need an explicit migration.
"""
import logging
import time
from sqlalchemy import text
from app.core.database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    for attempt in range(1, 61):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1 FROM monitor_templates LIMIT 1"))
            logger.info("Schema MySQL disponível.")
            return
        except Exception as exc:
            if attempt == 60:
                logger.error("Schema MySQL indisponível após 60 tentativas: %s", type(exc).__name__)
                raise
            logger.info("Aguardando schema MySQL (tentativa %s/60).", attempt)
            time.sleep(5)


if __name__ == "__main__":
    main()
