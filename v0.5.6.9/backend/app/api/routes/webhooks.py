"""Admin-only endpoints, protected by existing central RBAC middleware."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.webhook import DatadogWebhookTemplate
from app.models.datadog_org import DatadogOrg
from app.services.webhook_service import KINDS, current_templates, dashboard, save_template, template_dict
from app.services.webhook_queue import enqueue_webhook_run, get_run, latest_run

router = APIRouter()

class WebhookUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(default='', max_length=2048)
    payload: str = '{}'
    custom_headers: str = '{}'

@router.get('/templates')
def templates(db: Session = Depends(get_db)):
    rows = current_templates(db)
    return [template_dict(rows[kind]) for kind in KINDS if kind in rows]

@router.put('/templates/{kind}')
def update_template(kind: str, payload: WebhookUpdate, db: Session = Depends(get_db)):
    if kind not in KINDS:
        raise HTTPException(404, 'Webhook não encontrado.')
    result = save_template(db, kind, payload.model_dump())
    try:
        enqueue_webhook_run(repair=True)
    except Exception:
        # A persistência tem prioridade. O scheduler diário fará retry.
        pass
    return result

@router.get('/dashboard')
def dashboard_route(db: Session = Depends(get_db)):
    return dashboard(db)

@router.get('/runs/latest')
def run_latest():
    return latest_run()

@router.get('/runs/{run_id}')
def run_detail(run_id: str):
    result = get_run(run_id)
    if result is None:
        raise HTTPException(404, 'Execução não encontrada ou expirada.')
    return result

@router.post('/validate', status_code=202)
def validate_all():
    return enqueue_webhook_run(repair=False)

@router.post('/reconcile', status_code=202)
def reconcile_all():
    return enqueue_webhook_run(repair=True)


@router.post('/orgs/{org_id}/validate', status_code=202)
def validate_org(org_id: int, db: Session = Depends(get_db)):
    if db.get(DatadogOrg, org_id) is None:
        raise HTTPException(404, 'Org não encontrada.')
    return enqueue_webhook_run(repair=False, org_id=org_id)

@router.post('/orgs/{org_id}/reconcile', status_code=202)
def reconcile_org(org_id: int, db: Session = Depends(get_db)):
    if db.get(DatadogOrg, org_id) is None:
        raise HTTPException(404, 'Org não encontrada.')
    return enqueue_webhook_run(repair=True, org_id=org_id)
