import redis

from app.core.config import settings


# Cliente usado por funcionalidades de cache da aplicação, onde os valores são
# texto/JSON e podem ser decodificados automaticamente para str.
redis_cache_client = redis.Redis.from_url(
    settings.redis_url,
    decode_responses=True,
)

# Cliente usado pelo RQ. O RQ armazena payloads serializados em bytes/pickle no
# Redis; por isso NÃO pode usar decode_responses=True, senão o worker tenta
# decodificar bytes binários como UTF-8 e falha com UnicodeDecodeError.
redis_rq_client = redis.Redis.from_url(
    settings.redis_url,
    decode_responses=False,
)

# Compatibilidade com o código existente: redis_client continua sendo o cliente
# textual usado para cache JSON da aplicação.
redis_client = redis_cache_client
