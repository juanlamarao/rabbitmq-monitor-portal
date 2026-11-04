"""Membership via Graph /me/checkMemberGroups (delegated User.Read).

Never put Microsoft tokens in the browser. The refresh token is encrypted at rest
in Redis using the app's credential key or a key derived from its Entra secret.
"""
import base64
import hashlib
import json
import logging
import time
from uuid import UUID

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select

from app.core.config import settings
from app.core.redis import redis_cache_client
from app.models.access import EntraAccessGroup

log = logging.getLogger(__name__)
GRAPH_URL = 'https://graph.microsoft.com/v1.0/me/checkMemberGroups'


def group_revision() -> int:
    return int(redis_cache_client.get('rmp:entra:groups:revision') or 0)


def bump_group_revision():
    redis_cache_client.incr('rmp:entra:groups:revision')


def configured_group_ids(db) -> list[str]:
    ids = db.scalars(select(EntraAccessGroup.object_id).where(EntraAccessGroup.is_active.is_(True))).all()
    if settings.entra_admin_group_id:
        ids.append(settings.entra_admin_group_id)
    normalized = set()
    for item in ids:
        try:
            normalized.add(str(UUID(item)))
        except (ValueError, TypeError, AttributeError):
            log.warning('Object ID de grupo Entra inválido na configuração')
    return sorted(normalized)


def _cipher():
    key = settings.credential_encryption_key
    if key:
        return Fernet(key.encode())
    if not settings.entra_client_secret:
        raise ValueError('Entra client secret não configurado')
    material = (settings.entra_tenant_id + ':' + settings.entra_client_secret).encode()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(material).digest()))


def seal_refresh_token(token: str | None) -> str | None:
    return _cipher().encrypt(token.encode()).decode() if token else None


def unseal_refresh_token(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _cipher().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        return None


async def check_memberships(access_token: str, configured: list[str]) -> list[str]:
    if not configured:
        return []
    found = set()
    async with httpx.AsyncClient(timeout=12) as client:
        for i in range(0, len(configured), 20):
            chunk = configured[i:i + 20]
            response = await client.post(GRAPH_URL, json={'groupIds': chunk}, headers={
                'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json',
            })
            response.raise_for_status()
            value = response.json().get('value')
            if not isinstance(value, list):
                raise ValueError('Resposta de grupos do Microsoft Graph inválida')
            allowed = set(chunk)
            for item in value:
                try:
                    normalized = str(UUID(item))
                except (ValueError, TypeError, AttributeError):
                    raise ValueError('Graph retornou Object ID inválido') from None
                if normalized not in allowed:
                    raise ValueError('Graph retornou grupo fora da consulta')
                found.add(normalized)
    return sorted(found)


async def refresh_access_token(refresh_token: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f'https://login.microsoftonline.com/{settings.entra_tenant_id}/oauth2/v2.0/token',
            data={
                'client_id': settings.entra_client_id,
                'client_secret': settings.entra_client_secret,
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
                'scope': 'openid profile email offline_access ' + settings.entra_graph_scopes,
            },
        )
        response.raise_for_status()
        data = response.json()
        if not data.get('access_token'):
            raise ValueError('Resposta de refresh sem access token')
        return data


def membership_state(groups: list[str], status: str, revision: int) -> dict:
    return {
        'groups': groups, 'groups_status': status, 'groups_checked_at': int(time.time()),
        'groups_revision': revision,
    }


async def resolve_login_groups(db, token_data: dict) -> dict:
    revision = group_revision()
    try:
        groups = await check_memberships(token_data['access_token'], configured_group_ids(db))
        return membership_state(groups, 'ok', revision)
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        log.warning('Falha na verificação dos grupos no login: %s', type(exc).__name__)
        return membership_state([], 'error', revision)


async def revalidate_session_groups(identity: dict, db) -> dict:
    """Revalidate membership every TTL, or immediately after group configuration edits.

A failed Graph call always removes graph-derived privileges.
    """
    if identity.get('local') or settings.entra_groups_source != 'graph':
        return identity
    ttl = max(30, settings.entra_groups_cache_ttl)
    revision = group_revision()
    if (identity.get('groups_status') in ('ok', 'error')
            and int(time.time()) - int(identity.get('groups_checked_at') or 0) < ttl
            and identity.get('groups_revision') == revision):
        return identity
    refresh_token = unseal_refresh_token(identity.get('_graph_refresh_token'))
    try:
        if not refresh_token:
            raise ValueError('Refresh token indisponível; novo login necessário')
        data = await refresh_access_token(refresh_token)
        groups = await check_memberships(data['access_token'], configured_group_ids(db))
        identity.update(membership_state(groups, 'ok', revision))
        if data.get('refresh_token'):
            identity['_graph_refresh_token'] = seal_refresh_token(data['refresh_token'])
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        log.warning('Falha ao revalidar grupos Entra: %s', type(exc).__name__)
        identity.update(membership_state([], 'error', revision))
    return identity
