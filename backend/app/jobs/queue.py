from rq import Queue

from app.core.redis import redis_client


default_queue = Queue(
    name="default",
    connection=redis_client,
)
