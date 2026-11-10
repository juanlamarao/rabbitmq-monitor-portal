"""Worker RQ: progress and active-run metadata are held in Redis."""
import json
from datetime import datetime, timezone
from app.core.database import SessionLocal
from app.core.redis import redis_cache_client
from app.models.datadog_org import DatadogOrg
from app.services.webhook_service import check_org
from sqlalchemy import select


def _write(run_id, info):
    redis_cache_client.setex('rmp:webhooks:run:' + run_id, 86400, json.dumps(info))


def run_webhook_reconciliation(run_id: str, *, repair: bool, org_id: int | None = None):
    info = {'id': run_id, 'status': 'running', 'repair': repair, 'total': 0,
            'processed': 0, 'errors': 0, 'current_org': '', 'results': [],
            'started_at': datetime.now(timezone.utc).isoformat()}
    _write(run_id, info)
    try:
        with SessionLocal() as db:
            stmt = select(DatadogOrg).where(DatadogOrg.is_active.is_(True)).order_by(DatadogOrg.name)
            if org_id is not None:
                stmt = stmt.where(DatadogOrg.id == org_id)
            orgs = db.scalars(stmt).all()
            info['total'] = len(orgs)
            _write(run_id, info)
            for org in orgs:
                info['current_org'] = org.name
                _write(run_id, info)
                try:
                    outcome = check_org(db, org, repair=repair)
                    failures = sum(1 for obj in outcome.values() if obj['status'] == 'error')
                    info['errors'] += failures
                    info['results'].append({'org_id': org.id, 'name': org.name, 'integrations': outcome})
                except Exception as exc:
                    db.rollback()
                    info['errors'] += 1
                    info['results'].append({'org_id': org.id, 'name': org.name, 'error': type(exc).__name__})
                info['processed'] += 1
                _write(run_id, info)
        info['status'] = 'done_with_errors' if info['errors'] else 'done'
    except Exception as exc:
        info['status'] = 'error'
        info['error'] = type(exc).__name__
    finally:
        info['current_org'] = ''
        info['finished_at'] = datetime.now(timezone.utc).isoformat()
        _write(run_id, info)
        from app.core.config import settings
        lock = 'rmp:webhooks:active:' + settings.app_env
        # Remove only our own lock; never discard a newer run.
        if redis_cache_client.get(lock) == run_id:
            redis_cache_client.delete(lock)
            pending_key = 'rmp:webhooks:rerun:' + settings.app_env
            if redis_cache_client.get(pending_key):
                redis_cache_client.delete(pending_key)
                try:
                    from app.services.webhook_queue import enqueue_webhook_run
                    enqueue_webhook_run(repair=True)
                except Exception:
                    # Scheduler retries next day if Redis/RQ is unavailable.
                    pass
    return info
