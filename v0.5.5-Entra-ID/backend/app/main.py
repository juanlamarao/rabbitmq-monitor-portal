from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import threading

# Importa modelos para garantir registro no metadata SQLAlchemy.
from app import models  # noqa: F401
from app.api.routes import admin, audit, clusters, components, datadog_sync, directory, health, jobs, public, templates, auth, access
from app.core.bootstrap import seed_initial_data
from app.core.middleware import authorization_middleware
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine

app = FastAPI(
    title="RabbitMQ Monitor Portal API",
    version="0.5.5",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.middleware("http")(authorization_middleware)

@app.on_event("startup")
def on_startup():
    # O script SQL em infra/mysql/init é a forma recomendada para criar o banco.
    # Mantemos create_all para facilitar desenvolvimento local quando o volume já existe sem schema.
    if settings.auto_db_bootstrap:
        Base.metadata.create_all(bind=engine)
        with SessionLocal() as db:
            seed_initial_data(db)
    # First sync when Redis has no cached directory; does not block pod readiness.
    from app.services.directory_service import directory_cache_status, refresh_directory_cache
    from app.core.logging import logger
    def _warm_ad_cache():
        try:
            if directory_cache_status()['refreshed_at'] is None:
                result = refresh_directory_cache()
                logger.info('Warm-up LDAP: %s', result.get('status'))
        except Exception as exc:
            logger.warning('Warm-up LDAP indisponível; cache anterior preservado. erro=%s', type(exc).__name__)
    threading.Thread(target=_warm_ad_cache, daemon=True, name='ldap-cache-warmup').start()


app.include_router(health.router, prefix="/health", tags=["Health"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(clusters.router, prefix="/clusters", tags=["Clusters"])
app.include_router(components.router, prefix="/components", tags=["Components"])
app.include_router(directory.router, prefix="/directory", tags=["Directory"])
app.include_router(templates.router, prefix="/templates", tags=["Templates"])
app.include_router(datadog_sync.router, prefix="/datadog-sync", tags=["Datadog Sync"])
app.include_router(public.router, prefix="/public", tags=["Public"])
app.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
app.include_router(audit.router, prefix="/audit-logs", tags=["Audit"])

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(access.router, prefix="/access", tags=["Access Control"])
