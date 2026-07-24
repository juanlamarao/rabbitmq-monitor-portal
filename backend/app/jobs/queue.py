from rq import Queue

from app.core.redis import redis_rq_client


default_queue = Queue(
    name="default",
    connection=redis_rq_client,
)
