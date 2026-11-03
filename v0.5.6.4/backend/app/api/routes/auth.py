import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.auth import (SESSION_COOKIE, OAUTH_COOKIE, actor_name, assert_entra_configured,
    authorization_url, create_session, destroy_session, get_session, is_admin, new_oauth_state, redeem_oidc, set_session_cookie, verify_local_admin)
from app.core.config import settings
from app.core.database import get_db
from app.core.redis import redis_cache_client
from app.core.access import editable_clusters
from app.models.access import PortalUser

router = APIRouter()

class LocalLogin(BaseModel):
    password: str

@router.get('/login')
def login():
    assert_entra_configured()
    state,nonce,verifier = new_oauth_state()
    response=RedirectResponse(authorization_url(state,nonce,verifier), status_code=302)
    response.set_cookie(OAUTH_COOKIE,state,max_age=300,httponly=True,secure=settings.session_cookie_secure,samesite='lax',path='/api/auth/entra/callback')
    return response

@router.get('/entra/callback')
async def callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None, db: Session = Depends(get_db)):
    from app.core.auth import _digest
    if error or not code or not state or request.cookies.get(OAUTH_COOKIE)!=state:
        raise HTTPException(401,'Login cancelado ou estado OAuth inválido.')
    key = 'rmp:oauth:'+_digest(state)
    value = redis_cache_client.getdel(key)
    if not value:
        raise HTTPException(401,'Estado OAuth expirado ou reutilizado.')
    data = json.loads(value)
    claims = await redeem_oidc(code,data['verifier'],data['nonce'])
    email = claims.get('preferred_username') or claims.get('email') or claims.get('upn') or ''
    display_name = claims.get('name') or email
    oid = claims['oid']
    tid = claims['tid']
    user = db.scalar(select(PortalUser).where(PortalUser.tenant_id==tid, PortalUser.object_id==oid))
    if user is None:
        user = PortalUser(tenant_id=tid,object_id=oid,email=email,display_name=display_name)
        db.add(user)
    user.email=email
    user.display_name=display_name
    user.last_login_at=datetime.now(timezone.utc)
    db.commit()
    token,_ = create_session(oid=oid,tid=tid,email=email,name=display_name,groups=[g.lower() for g in claims.get('groups',[])],roles=claims.get('roles',[]),groups_overage=claims.get('groups_overage',False))
    response = RedirectResponse(settings.portal_public_base_url.rstrip('/')+'/',status_code=302)
    set_session_cookie(response,token)
    response.delete_cookie(OAUTH_COOKIE,path='/api/auth/entra/callback')
    return response

@router.post('/local/login')
def local_login(payload: LocalLogin, request: Request):
    if not verify_local_admin(payload.password,request.client.host if request.client else 'unknown'):
        raise HTTPException(401,'Credenciais inválidas.')
    token,_=create_session(oid='local-admin',tid='local',email='local-admin',name='Administrador de emergência',groups=[],roles=['local-admin'],local=True)
    response=Response(status_code=204)
    set_session_cookie(response,token)
    return response

@router.get('/me')
def me(request: Request, db: Session = Depends(get_db)):
    identity = request.state.identity
    return {'email': identity['email'],'name':identity['name'],'local':identity.get('local',False),
            'is_admin':is_admin(identity),'edit_cluster_ids':list(editable_clusters(db,identity)),
            'csrf_token':identity['csrf'],'groups_overage':identity.get('groups_overage',False)}

@router.post('/logout')
def logout(request: Request):
    destroy_session(request)
    response=Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE,path='/')
    return response

@router.get('/settings')
def auth_settings():
    return {'entra_available':bool(settings.entra_client_id and settings.entra_tenant_id), 'local_admin_available':settings.local_admin_enabled}
