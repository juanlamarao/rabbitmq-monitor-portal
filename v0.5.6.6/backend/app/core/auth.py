"""Servidor de sessões: o navegador recebe um token opaco HttpOnly, nunca tokens Microsoft."""
import base64
import hashlib
import json
import secrets
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from fastapi import HTTPException, Request
from app.core.config import settings
from app.core.redis import redis_cache_client

SESSION_COOKIE = 'rmp_session'
OAUTH_COOKIE = 'rmp_oauth_state'
_actor: ContextVar[str] = ContextVar('rmp_actor', default='system')


def actor_name() -> str:
    return _actor.get()


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def issuer() -> str:
    return f'https://login.microsoftonline.com/{settings.entra_tenant_id.lower()}/v2.0'


def _oauth_base() -> str:
    return f'https://login.microsoftonline.com/{settings.entra_tenant_id}/oauth2/v2.0'


def assert_entra_configured():
    if not all((settings.entra_tenant_id, settings.entra_client_id, settings.entra_client_secret, settings.entra_redirect_uri)):
        raise HTTPException(503, 'SSO Microsoft Entra ainda não configurado.')


def new_oauth_state() -> tuple[str,str,str]:
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    redis_cache_client.setex(f'rmp:oauth:{_digest(state)}', 300, json.dumps({'nonce': nonce, 'verifier': verifier}))
    return state, nonce, verifier


def authorization_url(state: str, nonce: str, verifier: str) -> str:
    import base64
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    return _oauth_base() + '/authorize?' + urlencode({
        'client_id': settings.entra_client_id,
        'response_type': 'code',
        'redirect_uri': settings.entra_redirect_uri,
        'response_mode': 'query',
        'scope': 'openid profile email User.Read',
        'state': state,
        'nonce': nonce,
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
    })


async def redeem_oidc(code: str, verifier: str, nonce: str) -> dict[str, Any]:
    assert_entra_configured()
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(_oauth_base()+'/token', data={
            'grant_type': 'authorization_code',
            'client_id': settings.entra_client_id,
            'client_secret': settings.entra_client_secret,
            'redirect_uri': settings.entra_redirect_uri,
            'code': code,
            'code_verifier': verifier,
            'scope': 'openid profile email User.Read',
        })
    if response.status_code != 200:
        raise HTTPException(401, 'Não foi possível concluir a autenticação com Microsoft Entra.')
    token_data = response.json()
    id_token = token_data.get('id_token')
    if not id_token:
        raise HTTPException(401, 'ID Token ausente na resposta do Entra.')
    try:
        jwks = jwt.PyJWKClient(f'https://login.microsoftonline.com/{settings.entra_tenant_id}/discovery/v2.0/keys')
        key = jwks.get_signing_key_from_jwt(id_token)
        claims = jwt.decode(id_token,key.key,algorithms=['RS256'],audience=settings.entra_client_id,issuer=issuer(),options={'require':['iss','aud','exp','iat','nonce','oid','tid']})
    except jwt.PyJWTError as exc:
        raise HTTPException(401, 'Token de identidade inválido.') from exc
    if claims.get('nonce') != nonce or str(claims.get('tid','')).lower() != settings.entra_tenant_id.lower():
        raise HTTPException(401, 'Identidade ou nonce inválidos.')
    if claims.get('hasgroups') or 'groups' in claims.get('_claim_names', {}):
        # Continua com leitura padrão, mas nunca concede edição a partir de grupos incompletos.
        # App Role admin verificada separadamente pela claim roles.
        claims['groups_overage'] = True
        claims['groups'] = []
    # Optional avatar: read the signed-in user's thumbnail with the short-lived
    # delegated Graph token; never store/return the Microsoft access token.
    graph_access_token = token_data.get('access_token')
    if graph_access_token:
        try:
            async with httpx.AsyncClient(timeout=6) as graph_client:
                photo_response = await graph_client.get(
                    'https://graph.microsoft.com/v1.0/me/photos/48x48/$value',
                    headers={'Authorization': f'Bearer {graph_access_token}'},
                )
            if (photo_response.status_code == 200 and photo_response.headers.get('content-type','').startswith('image/')
                    and 0 < len(photo_response.content) < 150000):
                mime = photo_response.headers['content-type'].split(';')[0]
                claims['_avatar_url'] = f'data:{mime};base64,' + base64.b64encode(photo_response.content).decode('ascii')
        except httpx.HTTPError:
            pass  # No photo, Graph policy or timeout: initials remain the fallback.
    return claims


def create_session(*, oid: str, tid: str, email: str, name: str, groups: list[str], roles: list[str], local: bool = False, groups_overage: bool = False, avatar_url: str | None = None) -> tuple[str, str]:
    token = secrets.token_urlsafe(48)
    csrf = secrets.token_urlsafe(32)
    identity = {'oid': oid, 'tid': tid, 'email': email, 'name': name, 'groups': groups, 'roles': roles, 'local': local, 'csrf': csrf, 'groups_overage': groups_overage, 'avatar_url': avatar_url}
    redis_cache_client.setex(f'rmp:session:{_digest(token)}', settings.session_ttl_seconds, json.dumps(identity))
    return token, csrf


def get_session(request: Request) -> dict | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    raw = redis_cache_client.get(f'rmp:session:{_digest(token)}')
    try:
        return json.loads(raw) if raw else None
    except (ValueError, TypeError):
        return None


def destroy_session(request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        redis_cache_client.delete(f'rmp:session:{_digest(token)}')


def is_admin(identity: dict) -> bool:
    if identity.get('local') or identity.get('_db_admin'):
        return True
    roles = identity.get('roles') or []
    if settings.entra_admin_app_role in roles:
        return True
    if settings.entra_admin_group_id and settings.entra_admin_group_id.lower() in [g.lower() for g in identity.get('groups',[])]:
        return True
    return False


def verify_local_admin(password: str, remote_ip: str) -> bool:
    if not settings.local_admin_enabled or not settings.local_admin_password_hash:
        return False
    key = 'rmp:auth:attempts:'+_digest(remote_ip)
    if int(redis_cache_client.get(key) or 0) >= 5:
        raise HTTPException(429, 'Muitas tentativas; tente novamente mais tarde.')
    try:
        ok = PasswordHasher().verify(settings.local_admin_password_hash,password)
    except (VerifyMismatchError, VerificationError, ValueError):
        ok = False
    if not ok:
        redis_cache_client.incr(key)
        redis_cache_client.expire(key,900)
    else:
        redis_cache_client.delete(key)
    return ok


def set_session_cookie(response, token: str):
    response.set_cookie(SESSION_COOKIE, token, max_age=settings.session_ttl_seconds, httponly=True, secure=settings.session_cookie_secure, samesite='lax', path='/')
