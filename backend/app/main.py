from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Importa modelos para garantir registro no metadata SQLAlchemy.
from app import models  # noqa: F401
from app.api.routes import admin, audit, clusters, components, directory, health, jobs, templates
from app.core.bootstrap import seed_initial_data
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine

app = FastAPI(
    title="RabbitMQ Monitor Portal API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # O script SQL em infra/mysql/init é a forma recomendada para criar o banco.
    # Mantemos create_all para facilitar desenvolvimento local quando o volume já existe sem schema.
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_initial_data(db)


app.include_router(health.router, prefix="/health", tags=["Health"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(clusters.router, prefix="/clusters", tags=["Clusters"])
app.include_router(components.router, prefix="/components", tags=["Components"])
app.include_router(directory.router, prefix="/directory", tags=["Directory"])
app.include_router(templates.router, prefix="/templates", tags=["Templates"])
app.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
app.include_router(audit.router, prefix="/audit-logs", tags=["Audit"])
