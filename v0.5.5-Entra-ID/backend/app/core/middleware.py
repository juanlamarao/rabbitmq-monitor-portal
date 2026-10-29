"""Central RBAC fail-closed. Never rely on hidden React buttons for authorization."""
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import select
from app.core.auth import _actor, get_session, is_admin
from app.core.access import can_edit_cluster
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.access import EntraAccessGroup
from app.models.component import RabbitMQQueue


async def authorization_middleware(request: Request, call_next):
    path=request.url.path
    method=request.method
    if method=='OPTIONS' or path.startswith('/health') or path.startswith('/public') or path in ('/auth/login','/auth/entra/callback','/auth/local/login','/auth/settings'):
        if path=='/auth/local/login' and method=='POST':
            origin=request.headers.get('origin')
            allowed={settings.portal_public_base_url.rstrip('/'),*settings.cors_origins_list}
            if origin and origin.rstrip('/') not in allowed:
                return JSONResponse({'detail':'Origem não autorizada.'},status_code=403)
        return await call_next(request)
    try:
        identity=get_session(request)
    except Exception:
        return JSONResponse({'detail':'Serviço de sessões indisponível.'},status_code=503)
    if not identity:
        return JSONResponse({'detail':'Sessão expirada ou ausente.'},status_code=401)
    request.state.identity=identity
    token=_actor.set(identity.get('email','unknown'))
    try:
        if method not in ('GET','HEAD','OPTIONS'):
            # Cookie é enviado automaticamente; CSRF token deve vir explicitamente do SPA.
            if request.headers.get('x-csrf-token') != identity.get('csrf'):
                return JSONResponse({'detail':'CSRF token ausente ou inválido.'},status_code=403)
            origin=request.headers.get('origin')
            allowed={settings.portal_public_base_url.rstrip('/'),*settings.cors_origins_list}
            if origin and origin.rstrip('/') not in allowed:
                return JSONResponse({'detail':'Origem não autorizada.'},status_code=403)
        with SessionLocal() as db:
            # Também suporta grupo admin cadastrado no portal (além de App Role).
            if not is_admin(identity):
                groups=[s.lower() for s in identity.get('groups',[])]
                if groups:
                    admin_match=db.scalar(select(EntraAccessGroup.id).where(EntraAccessGroup.object_id.in_(groups),EntraAccessGroup.is_admin.is_(True),EntraAccessGroup.is_active.is_(True)).limit(1))
                    if admin_match: identity['_db_admin']=True
            admin=is_admin(identity)
            if path.startswith(('/admin','/access','/templates','/jobs','/datadog-sync','/reports','/bulk-actions')) and not (method=='GET' and (path.startswith('/templates') or path in ('/admin/sre-groups','/admin/datadog-orgs'))):
                if not admin: return JSONResponse({'detail':'Requer administrador.'},status_code=403)
            elif path.startswith('/directory') and method!='GET':
                if not admin: return JSONResponse({'detail':'Requer administrador.'},status_code=403)
            elif path.startswith('/clusters') and method not in ('GET','HEAD'):
                parts=path.strip('/').split('/')
                if len(parts)<2 or not parts[1].isdigit():
                    if not admin: return JSONResponse({'detail':'Requer administrador.'},status_code=403)
                elif not can_edit_cluster(db,identity,int(parts[1])):
                    return JSONResponse({'detail':'Sem permissão de edição para este cluster.'},status_code=403)
            elif path.startswith('/components') and method not in ('GET','HEAD'):
                parts=path.strip('/').split('/')
                if len(parts)>2 and parts[1]=='queues' and parts[2].isdigit():
                    cluster_id=db.scalar(select(RabbitMQQueue.cluster_id).where(RabbitMQQueue.id==int(parts[2])))
                    if not cluster_id:
                        return JSONResponse({'detail':'Queue não encontrada.'},status_code=404)
                    if not can_edit_cluster(db,identity,cluster_id):
                        return JSONResponse({'detail':'Sem permissão de edição para este cluster.'},status_code=403)
                elif not admin:
                    return JSONResponse({'detail':'Requer administrador.'},status_code=403)
        response=await call_next(request)
        response.headers['Cache-Control']='no-store'
        return response
    finally:
        _actor.reset(token)
