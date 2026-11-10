"""All webhook runs use the existing RQ default worker; no new workload required."""
import json
from uuid import uuid4
from fastapi import HTTPException
from app.core.config import settings
from app.core.redis import redis_cache_client
from app.jobs.queue import default_queue


def enqueue_webhook_run(*, repair: bool, org_id: int | None = None) -> dict:
    lock = 'rmp:webhooks:active:' + settings.app_env
    run_id = str(uuid4())
    active = redis_cache_client.get(lock)
    if active:
        existing = get_run(active)
        if existing:
            if repair:
                redis_cache_client.setex('rmp:webhooks:rerun:' + settings.app_env, 86400, '1')
            return existing
    if not redis_cache_client.set(lock, run_id, nx=True, ex=14400):
        active = redis_cache_client.get(lock)
        if repair:
            redis_cache_client.setex('rmp:webhooks:rerun:' + settings.app_env, 86400, '1')
        return get_run(active) or {'id': active, 'status': 'queued'}
    queued = {'id':run_id, 'status':'queued', 'repair':repair, 'total':0,
              'processed':0, 'errors':0, 'results':[]}
    redis_cache_client.setex('rmp:webhooks:run:' + run_id, 86400, json.dumps(queued))
    redis_cache_client.setex('rmp:webhooks:latest:' + settings.app_env, 86400, run_id)
    try:
        from app.jobs.webhook_reconcile import run_webhook_reconciliation
        default_queue.enqueue(run_webhook_reconciliation, run_id, repair=repair, org_id=org_id,
                              job_timeout=14400, result_ttl=3600, failure_ttl=86400)
    except Exception:
        if redis_cache_client.get(lock) == run_id:
            redis_cache_client.delete(lock)
        redis_cache_client.delete('rmp:webhooks:run:' + run_id)
        raise
    return queued


def get_run(run_id: str | None) -> dict | None:
    if not run_id:
        return None
    raw = redis_cache_client.get('rmp:webhooks:run:' + run_id)
    if not raw:
        return None
    state = json.loads(raw)
    if state.get('status') in ('queued', 'running') and not redis_cache_client.get('rmp:webhooks:active:' + settings.app_env):
        state['status'] = 'error'
        state['error'] = 'Execução interrompida ou expirada.'
    return state


def latest_run() -> dict | None:
    run_id = redis_cache_client.get('rmp:webhooks:latest:' + settings.app_env)
    return get_run(run_id)
