"""Desired-state manager for the three Datadog notification webhooks.

No webhook endpoint is contacted by the portal: only Datadog's configuration
API. URLs/payloads/headers stay in MySQL and are never logged as audit values.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.service import create_audit_log
from app.core.security import decrypt_secret, encrypt_secret
from app.models.component import RabbitMQQueue
from app.models.cluster import RabbitMQCluster
from app.models.datadog_org import DatadogOrg
from app.models.webhook import DatadogWebhookOrgState, DatadogWebhookTemplate
from app.providers.datadog.client import DatadogApiError, DatadogMonitorClient
from app.services.datadog_sync_queue_service import mark_queues_dirty

logger = logging.getLogger(__name__)
KINDS = ('sre_ops', 'ccbp', 'vicci')
LABELS = {'sre_ops': 'Webhook SRE OPS', 'ccbp': 'Webhook CCBP', 'vicci': 'Webhook VICCI'}
QUEUE_FLAGS = {'sre_ops': 'notify_sre_ops', 'ccbp': 'notify_ccbp', 'vicci': 'notify_vicci'}
WEBHOOK_PATH = '/api/v1/integration/webhooks/configuration/webhooks'
NAME_RE = re.compile(r'^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$')


def _plain_json(value: str) -> str:
    # SQL seed/legacy values are plain JSON. Newly saved values use the same
    # Fernet key as the existing Datadog credentials.
    return decrypt_secret(value[7:]) if value and value.startswith('enc:v1:') else (value or '{}')


def _secure_json(value: str) -> str:
    return 'enc:v1:' + encrypt_secret(value)



def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def validate_webhook_input(name: str, url: str, payload: str, custom_headers: str) -> None:
    if not NAME_RE.fullmatch(name):
        raise HTTPException(422, 'Name deve conter letras/números separados apenas por hífen (-), sem espaços.')
    if url:
        parts = urlparse(url)
        if parts.scheme not in ('https', 'http') or not parts.hostname or parts.username or parts.password or parts.fragment:
            raise HTTPException(422, 'URL deve ser HTTP(S) válida e não conter credenciais ou fragmento.')
    for label, raw in [('Payload', payload), ('Custom headers', custom_headers)]:
        try:
            value = json.loads(raw)
        except (ValueError, TypeError) as exc:
            raise HTTPException(422, f'{label} precisa ser um JSON válido.') from exc
        if not isinstance(value, dict):
            raise HTTPException(422, f'{label} precisa ser um objeto JSON.')
        if label == 'Custom headers' and any(not isinstance(v, str) for v in value.values()):
            raise HTTPException(422, 'Custom headers: os valores dos headers devem ser strings.')


def current_templates(db: Session) -> dict[str, DatadogWebhookTemplate]:
    return {t.kind: t for t in db.scalars(select(DatadogWebhookTemplate)).all()}


def render_webhook_actions(db: Session, queue: RabbitMQQueue, templates: dict | None = None) -> str:
    templates = templates if templates is not None else current_templates(db)
    result = []
    for kind in KINDS:
        if not getattr(queue, QUEUE_FLAGS[kind], False):
            continue
        template = templates.get(kind)
        # Do not emit a broken @webhook mention until the target is configured.
        if not template or not template.url:
            continue
        if kind == 'vicci' and not (queue.vicci_email or '').strip():
            continue
        result.append('@webhook-' + template.name)
    return '\n'.join(result)


def vicci_monitor_tags(queue: RabbitMQQueue) -> list[str]:
    if not queue.notify_vicci or not queue.vicci_email or '@' not in queue.vicci_email:
        return []
    local, domain = queue.vicci_email.strip().lower().rsplit('@', 1)
    return [f'vicci_notify_user:{local}', f'vicci_notify_domain:{domain}']


def template_dict(row: DatadogWebhookTemplate) -> dict:
    return {'kind': row.kind, 'label': LABELS[row.kind], 'name': row.name,
            'url': row.url, 'payload': _plain_json(row.payload), 'custom_headers': _plain_json(row.custom_headers),
            'configured': bool(row.url), 'updated_at': row.updated_at}


def save_template(db: Session, kind: str, data: dict) -> dict:
    row = db.get(DatadogWebhookTemplate, kind)
    if row is None:
        raise HTTPException(404, 'Modelo de webhook não encontrado.')
    desired = {k: (data.get(k, _plain_json(getattr(row, k)) if k in ('payload', 'custom_headers') else getattr(row, k)) or '').strip()
               for k in ('name', 'url', 'payload', 'custom_headers')}
    validate_webhook_input(**desired)
    duplicate = db.scalar(select(DatadogWebhookTemplate.kind).where(
        DatadogWebhookTemplate.name == desired['name'], DatadogWebhookTemplate.kind != kind))
    if duplicate:
        raise HTTPException(409, 'O nome já é usado por outro webhook gerenciado.')
    old_name, old_configured = row.name, bool(row.url)
    changed_fields = [key for key, value in desired.items() if (_plain_json(getattr(row, key)) if key in ('payload', 'custom_headers') else getattr(row, key)) != value]
    if not changed_fields:
        return template_dict(row)
    for field, value in desired.items():
        setattr(row, field, _secure_json(value) if field in ('payload', 'custom_headers') else value)
    for state in db.scalars(select(DatadogWebhookOrgState).where(DatadogWebhookOrgState.kind == kind)).all():
        state.status = 'unknown'
    # New mentions are necessary only for changed name or first-time configuration.
    # URL/payload/header drifts are reconciled in Datadog independently of monitors.
    if old_name != row.name or old_configured != bool(row.url):
        queue_ids = db.scalars(select(RabbitMQQueue.id).where(
            getattr(RabbitMQQueue, QUEUE_FLAGS[kind]).is_(True),
            RabbitMQQueue.is_removed.is_(False))).all()
        mark_queues_dirty(db, queue_ids, f'webhook_{kind}_name_or_activation')
    create_audit_log(db, entity_type='webhook_template', entity_id=kind, action='updated',
                     summary=f'Webhook {LABELS[kind]}: {", ".join(changed_fields)} alterado(s)',
                     before_data={'name': old_name, 'configured': old_configured},
                     after_data={'name': row.name, 'configured': bool(row.url), 'changed_fields': changed_fields})
    db.commit()
    db.refresh(row)
    return template_dict(row)


def _normalized_json(raw: Any) -> Any:
    if not raw:
        return {}
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return raw


def _matches(remote: dict, desired: DatadogWebhookTemplate) -> bool:
    return (str(remote.get('name') or '').lower() == desired.name.lower()
            and (remote.get('url') or '') == desired.url
            and _normalized_json(remote.get('payload')) == _normalized_json(_plain_json(desired.payload))
            and _normalized_json(remote.get('custom_headers')) == _normalized_json(_plain_json(desired.custom_headers))
            and (remote.get('encode_as') or 'json') == 'json')


def _client(org: DatadogOrg) -> DatadogMonitorClient:
    if not org.has_credentials:
        raise ValueError('Organização sem credenciais Datadog.')
    return DatadogMonitorClient(api_url=org.api_url,
                                api_key=decrypt_secret(org.api_key_encrypted),
                                app_key=decrypt_secret(org.app_key_encrypted), org_url=org.org_url)


def _sanitize_error(exc: Exception) -> str:
    # Never leak response bodies (they might include payload/headers or URL secrets).
    if isinstance(exc, DatadogApiError):
        return f'Datadog HTTP {exc.status_code}'
    return type(exc).__name__


def check_org(db: Session, org: DatadogOrg, *, repair: bool = False) -> dict:
    templates = current_templates(db)
    states = {item.kind: item for item in db.scalars(select(DatadogWebhookOrgState).where(
        DatadogWebhookOrgState.org_id == org.id)).all()}
    results = {}
    client = None
    for kind in KINDS:
        desired = templates.get(kind)
        state = states.get(kind)
        if state is None:
            state = DatadogWebhookOrgState(org_id=org.id, kind=kind)
            db.add(state)
        status, message = 'unconfigured', None
        if desired and desired.url:
            try:
                if client is None:
                    client = _client(org)
                # A API Datadog não publica GET-list de todos os webhooks.
                # Identificamos cada integração pelo nome esperado.
                try:
                    remote = client.get_webhook(desired.name)
                except DatadogApiError as exc:
                    if exc.status_code != 404:
                        raise
                    remote = None
                status = 'missing' if remote is None else ('ok' if _matches(remote, desired) else 'different')
                if repair and status in ('missing', 'different'):
                    if remote is None:
                        client.create_webhook(desired_api_body(desired))
                    else:
                        client.update_webhook(desired.name, desired_api_body(desired))
                    # Verify after the write, rather than assuming it succeeded.
                    verified = client.get_webhook(desired.name)
                    status = 'ok' if _matches(verified, desired) else 'different'
                if status == 'ok':
                    state.remote_name = desired.name
            except Exception as exc:
                logger.warning('Webhook reconciliation org_id=%s kind=%s error=%s', org.id, kind, _sanitize_error(exc))
                status, message = 'error', _sanitize_error(exc)
        state.status, state.checked_at, state.last_error = status, utcnow(), message
        results[kind] = {'status': status, 'error': message, 'checked_at': state.checked_at.isoformat()}
        db.commit()  # progress persists even if the next webhook/org fails
    return results


def desired_api_body(t: DatadogWebhookTemplate) -> dict:
    # Datadog v1 expects payload/custom_headers as *JSON strings*.
    return {'name': t.name, 'url': t.url, 'payload': _plain_json(t.payload),
            'custom_headers': _plain_json(t.custom_headers), 'encode_as': 'json'}


def dashboard(db: Session) -> dict:
    orgs = db.scalars(select(DatadogOrg).order_by(DatadogOrg.name)).all()
    rows = db.scalars(select(DatadogWebhookOrgState)).all()
    states = {(r.org_id, r.kind): r for r in rows}
    items = []
    for org in orgs:
        integrations = {}
        for kind in KINDS:
            state = states.get((org.id,kind))
            integrations[kind] = {'status': state.status if state else 'unknown',
                                  'error': state.last_error if state else None,
                                  'checked_at': state.checked_at.isoformat() if state and state.checked_at else None}
        statuses = [x['status'] for x in integrations.values()]
        overall = 'ok' if all(s == 'ok' for s in statuses) else ('not_ok' if all(s != 'ok' for s in statuses) else 'partial')
        items.append({'id': org.id, 'name': org.name, 'org_url': org.org_url or org.api_url,
                      'is_active': org.is_active, 'overall': overall, 'integrations': integrations})
    return {'total': len(items), 'ok': sum(1 for i in items if i['overall']=='ok'),
            'partial': sum(1 for i in items if i['overall']=='partial'),
            'not_ok': sum(1 for i in items if i['overall']=='not_ok'), 'orgs': items}
