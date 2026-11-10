"""Kubernetes initContainer: wait until the MySQL schema is available.

Não executa migrações. A instalação nova usa o SQL completo no bootstrap do MySQL;
bancos existentes exigem migrações SQL explícitas antes do deploy.
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
                columns = set(conn.execute(text("""
                    SELECT COLUMN_NAME FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rabbitmq_clusters'
                      AND COLUMN_NAME IN ('connection_type', 'metrics_endpoints',
                                          'datadog_use_cluster_dimension', 'datadog_extra_dimensions')
                """)).scalars())
                required = {'connection_type', 'metrics_endpoints',
                            'datadog_use_cluster_dimension', 'datadog_extra_dimensions'}
                if columns != required:
                    raise RuntimeError('Schema MySQL desatualizado: aplicar migrações 013 e 015 antes do deploy. '
                                       f'Colunas pendentes: {sorted(required-columns)}')
            logger.info("Schema MySQL v0.5.6.10 disponível.")
            return
        except RuntimeError:
            logger.exception('Versão do schema incompatível; não executar migrações automaticamente.')
            raise
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
