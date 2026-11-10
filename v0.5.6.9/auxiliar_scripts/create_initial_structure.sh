#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="${1:-rabbitmq-monitor-portal}"

echo "Criando projeto em: ${PROJECT_DIR}"

mkdir -p "${PROJECT_DIR}"

# ==============================================================================
# Diretórios principais
# ==============================================================================

mkdir -p "${PROJECT_DIR}/frontend/src/routes"
mkdir -p "${PROJECT_DIR}/frontend/src/components"
mkdir -p "${PROJECT_DIR}/frontend/src/pages"
mkdir -p "${PROJECT_DIR}/frontend/src/services"
mkdir -p "${PROJECT_DIR}/frontend/src/styles"

mkdir -p "${PROJECT_DIR}/backend/app/api/routes"
mkdir -p "${PROJECT_DIR}/backend/app/core"
mkdir -p "${PROJECT_DIR}/backend/app/models"
mkdir -p "${PROJECT_DIR}/backend/app/schemas"
mkdir -p "${PROJECT_DIR}/backend/app/services"
mkdir -p "${PROJECT_DIR}/backend/app/workers"
mkdir -p "${PROJECT_DIR}/backend/app/providers/rabbitmq"
mkdir -p "${PROJECT_DIR}/backend/app/providers/datadog"
mkdir -p "${PROJECT_DIR}/backend/app/providers/zabbix"
mkdir -p "${PROJECT_DIR}/backend/app/providers/dynatrace"
mkdir -p "${PROJECT_DIR}/backend/app/jobs"
mkdir -p "${PROJECT_DIR}/backend/app/audit"
mkdir -p "${PROJECT_DIR}/backend/migrations/versions"

mkdir -p "${PROJECT_DIR}/infra/rabbitmq"
mkdir -p "${PROJECT_DIR}/docs"

# ==============================================================================
# Arquivos Python __init__.py
# ==============================================================================

touch "${PROJECT_DIR}/backend/app/__init__.py"
touch "${PROJECT_DIR}/backend/app/api/__init__.py"
touch "${PROJECT_DIR}/backend/app/api/routes/__init__.py"
touch "${PROJECT_DIR}/backend/app/core/__init__.py"
touch "${PROJECT_DIR}/backend/app/models/__init__.py"
touch "${PROJECT_DIR}/backend/app/schemas/__init__.py"
touch "${PROJECT_DIR}/backend/app/services/__init__.py"
touch "${PROJECT_DIR}/backend/app/workers/__init__.py"
touch "${PROJECT_DIR}/backend/app/providers/__init__.py"
touch "${PROJECT_DIR}/backend/app/providers/rabbitmq/__init__.py"
touch "${PROJECT_DIR}/backend/app/providers/datadog/__init__.py"
touch "${PROJECT_DIR}/backend/app/providers/zabbix/__init__.py"
touch "${PROJECT_DIR}/backend/app/providers/dynatrace/__init__.py"
touch "${PROJECT_DIR}/backend/app/jobs/__init__.py"
touch "${PROJECT_DIR}/backend/app/audit/__init__.py"

# ==============================================================================
# Backend - Dockerfile
# ==============================================================================

cat > "${PROJECT_DIR}/backend/Dockerfile" <<'EOF'
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    default-libmysqlclient-dev \
    pkg-config \
    curl \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
EOF

# ==============================================================================
# Backend - requirements.txt
# ==============================================================================

cat > "${PROJECT_DIR}/backend/requirements.txt" <<'EOF'
fastapi==0.115.6
uvicorn[standard]==0.34.0

pydantic==2.10.4
pydantic-settings==2.7.1

sqlalchemy==2.0.36
alembic==1.14.0
pymysql==1.1.1

redis==5.2.1
rq==2.1.0

httpx==0.28.1
python-dotenv==1.0.1

structlog==24.4.0
EOF

# ==============================================================================
# Backend - app/main.py
# ==============================================================================

cat > "${PROJECT_DIR}/backend/app/main.py" <<'EOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health

app = FastAPI(
    title="RabbitMQ Monitor Portal API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/health", tags=["Health"])
EOF

# ==============================================================================
# Backend - rotas
# ==============================================================================

cat > "${PROJECT_DIR}/backend/app/api/routes/health.py" <<'EOF'
from fastapi import APIRouter

router = APIRouter()


@router.get("")
def health_check():
    return {
        "status": "ok",
        "service": "rabbitmq-monitor-api",
    }
EOF

cat > "${PROJECT_DIR}/backend/app/api/routes/clusters.py" <<'EOF'
from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_clusters():
    return []
EOF

cat > "${PROJECT_DIR}/backend/app/api/routes/components.py" <<'EOF'
from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_components():
    return []
EOF

cat > "${PROJECT_DIR}/backend/app/api/routes/templates.py" <<'EOF'
from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_templates():
    return []
EOF

cat > "${PROJECT_DIR}/backend/app/api/routes/jobs.py" <<'EOF'
from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_jobs():
    return []
EOF

# ==============================================================================
# Backend - core
# ==============================================================================

cat > "${PROJECT_DIR}/backend/app/core/config.py" <<'EOF'
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "RabbitMQ Monitor Portal"
    app_env: str = "development"
    app_debug: bool = True

    mysql_host: str = "mysql"
    mysql_port: int = 3306
    mysql_database: str = "rabbitmq_monitor_portal"
    mysql_user: str = "app"
    mysql_password: str = "app_password"

    redis_host: str = "redis"
    redis_port: int = 6379
    redis_db: int = 0

    rabbitmq_demo_host: str = "rabbitmq"
    rabbitmq_demo_port: int = 15672
    rabbitmq_demo_username: str = "guest"
    rabbitmq_demo_password: str = "guest"

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
        )

    @property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
EOF

cat > "${PROJECT_DIR}/backend/app/core/database.py" <<'EOF'
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
EOF

cat > "${PROJECT_DIR}/backend/app/core/redis.py" <<'EOF'
import redis

from app.core.config import settings


redis_client = redis.Redis.from_url(
    settings.redis_url,
    decode_responses=True,
)
EOF

cat > "${PROJECT_DIR}/backend/app/core/security.py" <<'EOF'
# Futuramente:
# - hashing de senhas
# - JWT
# - criptografia de credenciais
# - integração SAML
EOF

cat > "${PROJECT_DIR}/backend/app/core/logging.py" <<'EOF'
import logging


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger("rabbitmq-monitor-portal")
EOF

# ==============================================================================
# Backend - workers
# ==============================================================================

cat > "${PROJECT_DIR}/backend/app/workers/worker.py" <<'EOF'
import time

from app.core.logging import logger


def main():
    logger.info("RabbitMQ Monitor Worker iniciado.")

    while True:
        logger.info("Worker aguardando jobs...")
        time.sleep(30)


if __name__ == "__main__":
    main()
EOF

cat > "${PROJECT_DIR}/backend/app/workers/scheduler.py" <<'EOF'
import time

from app.core.logging import logger


def main():
    logger.info("RabbitMQ Monitor Scheduler iniciado.")

    while True:
        logger.info("Scheduler aguardando próxima execução...")
        time.sleep(60)


if __name__ == "__main__":
    main()
EOF

# ==============================================================================
# Backend - providers RabbitMQ
# ==============================================================================

cat > "${PROJECT_DIR}/backend/app/providers/rabbitmq/client.py" <<'EOF'
import httpx


class RabbitMQClient:
    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.auth = (username, password)

    async def get_overview(self) -> dict:
        async with httpx.AsyncClient(auth=self.auth, timeout=30) as client:
            response = await client.get(f"{self.base_url}/api/overview")
            response.raise_for_status()
            return response.json()

    async def list_queues(self) -> list[dict]:
        async with httpx.AsyncClient(auth=self.auth, timeout=30) as client:
            response = await client.get(f"{self.base_url}/api/queues")
            response.raise_for_status()
            return response.json()
EOF

cat > "${PROJECT_DIR}/backend/app/providers/rabbitmq/collector.py" <<'EOF'
# Responsável por coletar informações do RabbitMQ Management API.
EOF

cat > "${PROJECT_DIR}/backend/app/providers/rabbitmq/normalizer.py" <<'EOF'
# Responsável por normalizar dados brutos do RabbitMQ para o modelo interno.
EOF

# ==============================================================================
# Backend - providers externos placeholders
# ==============================================================================

cat > "${PROJECT_DIR}/backend/app/providers/datadog/client.py" <<'EOF'
# Cliente da API Datadog.
EOF

cat > "${PROJECT_DIR}/backend/app/providers/datadog/monitor_mapper.py" <<'EOF'
# Mapeamento do estado desejado interno para monitores Datadog.
EOF

cat > "${PROJECT_DIR}/backend/app/providers/zabbix/client.py" <<'EOF'
# Cliente da API Zabbix.
EOF

cat > "${PROJECT_DIR}/backend/app/providers/zabbix/trigger_mapper.py" <<'EOF'
# Mapeamento do estado desejado interno para triggers/itens Zabbix.
EOF

cat > "${PROJECT_DIR}/backend/app/providers/dynatrace/client.py" <<'EOF'
# Cliente da API Dynatrace.
EOF

cat > "${PROJECT_DIR}/backend/app/providers/dynatrace/monitor_mapper.py" <<'EOF'
# Mapeamento do estado desejado interno para configurações Dynatrace.
EOF

# ==============================================================================
# Backend - jobs
# ==============================================================================

cat > "${PROJECT_DIR}/backend/app/jobs/queue.py" <<'EOF'
from rq import Queue

from app.core.redis import redis_client


default_queue = Queue(
    name="default",
    connection=redis_client,
)
EOF

cat > "${PROJECT_DIR}/backend/app/jobs/collect_cluster.py" <<'EOF'
def collect_cluster(cluster_id: int):
    print(f"Coletando cluster {cluster_id}")
EOF

cat > "${PROJECT_DIR}/backend/app/jobs/apply_monitors.py" <<'EOF'
def apply_monitors(cluster_id: int):
    print(f"Aplicando monitores do cluster {cluster_id}")
EOF

cat > "${PROJECT_DIR}/backend/app/jobs/sync_provider.py" <<'EOF'
def sync_provider(provider: str):
    print(f"Sincronizando provider {provider}")
EOF

# ==============================================================================
# Backend - services placeholders
# ==============================================================================

cat > "${PROJECT_DIR}/backend/app/services/cluster_service.py" <<'EOF'
# Regras de negócio para clusters RabbitMQ.
EOF

cat > "${PROJECT_DIR}/backend/app/services/component_service.py" <<'EOF'
# Regras de negócio para componentes monitoráveis.
EOF

cat > "${PROJECT_DIR}/backend/app/services/template_service.py" <<'EOF'
# Regras de negócio para templates de monitoramento.
EOF

cat > "${PROJECT_DIR}/backend/app/services/monitor_apply_service.py" <<'EOF'
# Serviço responsável por calcular e aplicar o estado desejado dos monitores.
EOF

# ==============================================================================
# Backend - models placeholders
# ==============================================================================

cat > "${PROJECT_DIR}/backend/app/models/cluster.py" <<'EOF'
# Modelo SQLAlchemy para clusters RabbitMQ.
EOF

cat > "${PROJECT_DIR}/backend/app/models/component.py" <<'EOF'
# Modelo SQLAlchemy para componentes monitoráveis.
EOF

cat > "${PROJECT_DIR}/backend/app/models/monitor_template.py" <<'EOF'
# Modelo SQLAlchemy para templates de monitoramento.
EOF

cat > "${PROJECT_DIR}/backend/app/models/generated_monitor.py" <<'EOF'
# Modelo SQLAlchemy para monitores gerados nas ferramentas externas.
EOF

cat > "${PROJECT_DIR}/backend/app/models/audit_log.py" <<'EOF'
# Modelo SQLAlchemy para auditoria.
EOF

cat > "${PROJECT_DIR}/backend/app/models/job.py" <<'EOF'
# Modelo SQLAlchemy para histórico de jobs.
EOF

# ==============================================================================
# Backend - schemas placeholders
# ==============================================================================

cat > "${PROJECT_DIR}/backend/app/schemas/cluster.py" <<'EOF'
# Schemas Pydantic para clusters.
EOF

cat > "${PROJECT_DIR}/backend/app/schemas/component.py" <<'EOF'
# Schemas Pydantic para componentes.
EOF

cat > "${PROJECT_DIR}/backend/app/schemas/monitor_template.py" <<'EOF'
# Schemas Pydantic para templates.
EOF

cat > "${PROJECT_DIR}/backend/app/schemas/job.py" <<'EOF'
# Schemas Pydantic para jobs.
EOF

# ==============================================================================
# Backend - audit
# ==============================================================================

cat > "${PROJECT_DIR}/backend/app/audit/service.py" <<'EOF'
# Serviço de auditoria.
EOF

# ==============================================================================
# Backend - migrations
# ==============================================================================

cat > "${PROJECT_DIR}/backend/migrations/env.py" <<'EOF'
# Arquivo base do Alembic.
# Será configurado quando iniciarmos as migrations do banco.
EOF

# ==============================================================================
# Frontend - Dockerfile
# ==============================================================================

cat > "${PROJECT_DIR}/frontend/Dockerfile" <<'EOF'
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
EOF

# ==============================================================================
# Frontend - package.json
# ==============================================================================

cat > "${PROJECT_DIR}/frontend/package.json" <<'EOF'
{
  "name": "rabbitmq-monitor-portal-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@emotion/react": "^11.14.0",
    "@emotion/styled": "^11.14.0",
    "@mui/icons-material": "^6.2.1",
    "@mui/material": "^6.2.1",
    "@tanstack/react-query": "^5.62.11",
    "@vitejs/plugin-react": "^4.3.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.7"
  },
  "devDependencies": {
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2"
  }
}
EOF

# ==============================================================================
# Frontend - arquivos base
# ==============================================================================

cat > "${PROJECT_DIR}/frontend/index.html" <<'EOF'
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RabbitMQ Monitor Portal</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

cat > "${PROJECT_DIR}/frontend/vite.config.ts" <<'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
EOF

cat > "${PROJECT_DIR}/frontend/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": []
}
EOF

cat > "${PROJECT_DIR}/frontend/src/main.tsx" <<'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOF

cat > "${PROJECT_DIR}/frontend/src/App.tsx" <<'EOF'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import HomePage from './pages/HomePage';

const theme = createTheme({
  palette: {
    mode: 'dark',
  },
});

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <HomePage />
    </ThemeProvider>
  );
}
EOF

cat > "${PROJECT_DIR}/frontend/src/pages/HomePage.tsx" <<'EOF'
import { Box, Typography, Paper } from '@mui/material';

export default function HomePage() {
  return (
    <Box sx={{ minHeight: '100vh', p: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          RabbitMQ Monitor Portal
        </Typography>

        <Typography variant="body1">
          Base inicial do portal de gerenciamento de monitores RabbitMQ.
        </Typography>
      </Paper>
    </Box>
  );
}
EOF

cat > "${PROJECT_DIR}/frontend/src/styles/global.css" <<'EOF'
html,
body,
#root {
  min-height: 100%;
  margin: 0;
}
EOF

# ==============================================================================
# Infra - docker-compose.yml
# ==============================================================================

cat > "${PROJECT_DIR}/infra/docker-compose.yml" <<'EOF'
services:
  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
    container_name: rabbitmq-monitor-frontend
    ports:
      - "3000:5173"
    environment:
      VITE_API_BASE_URL: http://localhost:8000
    volumes:
      - ../frontend:/app
      - frontend_node_modules:/app/node_modules
    depends_on:
      api:
        condition: service_started
    networks:
      - rabbitmq-monitor-net

  api:
    build:
      context: ../backend
      dockerfile: Dockerfile
    container_name: rabbitmq-monitor-api
    command: >
      uvicorn app.main:app
      --host 0.0.0.0
      --port 8000
      --reload
    ports:
      - "8000:8000"
    environment:
      APP_NAME: RabbitMQ Monitor Portal
      APP_ENV: development
      APP_DEBUG: "true"

      MYSQL_HOST: mysql
      MYSQL_PORT: 3306
      MYSQL_DATABASE: rabbitmq_monitor_portal
      MYSQL_USER: app
      MYSQL_PASSWORD: app_password

      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_DB: 0

      RABBITMQ_DEMO_HOST: rabbitmq
      RABBITMQ_DEMO_PORT: 15672
      RABBITMQ_DEMO_USERNAME: guest
      RABBITMQ_DEMO_PASSWORD: guest

      CORS_ORIGINS: http://localhost:3000,http://localhost:5173
    volumes:
      - ../backend:/app
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    networks:
      - rabbitmq-monitor-net

  worker:
    build:
      context: ../backend
      dockerfile: Dockerfile
    container_name: rabbitmq-monitor-worker
    command: python -m app.workers.worker
    environment:
      APP_NAME: RabbitMQ Monitor Portal Worker
      APP_ENV: development
      APP_DEBUG: "true"

      MYSQL_HOST: mysql
      MYSQL_PORT: 3306
      MYSQL_DATABASE: rabbitmq_monitor_portal
      MYSQL_USER: app
      MYSQL_PASSWORD: app_password

      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_DB: 0

      RABBITMQ_DEMO_HOST: rabbitmq
      RABBITMQ_DEMO_PORT: 15672
      RABBITMQ_DEMO_USERNAME: guest
      RABBITMQ_DEMO_PASSWORD: guest
    volumes:
      - ../backend:/app
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    networks:
      - rabbitmq-monitor-net

  scheduler:
    build:
      context: ../backend
      dockerfile: Dockerfile
    container_name: rabbitmq-monitor-scheduler
    command: python -m app.workers.scheduler
    environment:
      APP_NAME: RabbitMQ Monitor Portal Scheduler
      APP_ENV: development
      APP_DEBUG: "true"

      MYSQL_HOST: mysql
      MYSQL_PORT: 3306
      MYSQL_DATABASE: rabbitmq_monitor_portal
      MYSQL_USER: app
      MYSQL_PASSWORD: app_password

      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_DB: 0
    volumes:
      - ../backend:/app
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - rabbitmq-monitor-net

  mysql:
    image: mysql:8.4
    container_name: rabbitmq-monitor-mysql
    ports:
      - "3306:3306"
    environment:
      MYSQL_DATABASE: rabbitmq_monitor_portal
      MYSQL_USER: app
      MYSQL_PASSWORD: app_password
      MYSQL_ROOT_PASSWORD: root_password
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "mysqladmin ping -h localhost -u app -papp_password --silent"
        ]
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - rabbitmq-monitor-net

  redis:
    image: redis:7-alpine
    container_name: rabbitmq-monitor-redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 10
    networks:
      - rabbitmq-monitor-net

  rabbitmq:
    image: rabbitmq:3-management
    container_name: rabbitmq-monitor-demo-rabbitmq
    hostname: rabbitmq-demo
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
      RABBITMQ_DEFAULT_VHOST: /
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 5s
      retries: 15
    networks:
      - rabbitmq-monitor-net

  rabbitmq-init:
    image: curlimages/curl:latest
    container_name: rabbitmq-monitor-rabbitmq-init
    volumes:
      - ./rabbitmq/init-queues.sh:/init-queues.sh:ro
    command: sh /init-queues.sh
    depends_on:
      rabbitmq:
        condition: service_healthy
    networks:
      - rabbitmq-monitor-net
    restart: "no"

volumes:
  mysql_data:
  redis_data:
  rabbitmq_data:
  frontend_node_modules:

networks:
  rabbitmq-monitor-net:
    driver: bridge
EOF

# ==============================================================================
# Infra - .env.example
# ==============================================================================

cat > "${PROJECT_DIR}/infra/.env.example" <<'EOF'
APP_NAME=RabbitMQ Monitor Portal
APP_ENV=development
APP_DEBUG=true

MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_DATABASE=rabbitmq_monitor_portal
MYSQL_USER=app
MYSQL_PASSWORD=app_password
MYSQL_ROOT_PASSWORD=root_password

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0

RABBITMQ_DEMO_HOST=rabbitmq
RABBITMQ_DEMO_PORT=15672
RABBITMQ_DEMO_USERNAME=guest
RABBITMQ_DEMO_PASSWORD=guest

VITE_API_BASE_URL=http://localhost:8000
EOF

# ==============================================================================
# Infra - RabbitMQ init queues
# ==============================================================================

cat > "${PROJECT_DIR}/infra/rabbitmq/init-queues.sh" <<'EOF'
#!/bin/sh

set -eu

RABBITMQ_API_URL="http://rabbitmq:15672/api"
RABBITMQ_USER="guest"
RABBITMQ_PASS="guest"
RABBITMQ_VHOST="%2F"

echo "Aguardando RabbitMQ Management API ficar disponível..."

until curl -fsS -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" "${RABBITMQ_API_URL}/overview" > /dev/null; do
  echo "RabbitMQ ainda não está pronto. Tentando novamente..."
  sleep 3
done

echo "RabbitMQ disponível. Criando filas de validação..."

create_queue() {
  QUEUE_NAME="$1"

  echo "Criando fila: ${QUEUE_NAME}"

  curl -fsS -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" \
    -H "content-type: application/json" \
    -X PUT \
    "${RABBITMQ_API_URL}/queues/${RABBITMQ_VHOST}/${QUEUE_NAME}" \
    -d '{
      "durable": true,
      "auto_delete": false,
      "arguments": {}
    }' > /dev/null
}

create_queue "demo.orders.created"
create_queue "demo.orders.cancelled"
create_queue "demo.orders.payment.pending"
create_queue "demo.orders.payment.approved"
create_queue "demo.orders.payment.failed"

create_queue "demo.customers.created"
create_queue "demo.customers.updated"
create_queue "demo.customers.deleted"

create_queue "demo.notifications.email"
create_queue "demo.notifications.sms"
create_queue "demo.notifications.push"

create_queue "demo.billing.invoice.created"
create_queue "demo.billing.invoice.paid"
create_queue "demo.billing.invoice.overdue"

create_queue "demo.deadletter.default"

echo "Criando exchange demo.direct..."

curl -fsS -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" \
  -H "content-type: application/json" \
  -X PUT \
  "${RABBITMQ_API_URL}/exchanges/${RABBITMQ_VHOST}/demo.direct" \
  -d '{
    "type": "direct",
    "durable": true,
    "auto_delete": false,
    "internal": false,
    "arguments": {}
  }' > /dev/null

echo "Criando bindings das filas na exchange demo.direct..."

bind_queue() {
  QUEUE_NAME="$1"
  ROUTING_KEY="$2"

  echo "Binding: ${QUEUE_NAME} <- ${ROUTING_KEY}"

  curl -fsS -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" \
    -H "content-type: application/json" \
    -X POST \
    "${RABBITMQ_API_URL}/bindings/${RABBITMQ_VHOST}/e/demo.direct/q/${QUEUE_NAME}" \
    -d "{
      \"routing_key\": \"${ROUTING_KEY}\",
      \"arguments\": {}
    }" > /dev/null
}

bind_queue "demo.orders.created" "orders.created"
bind_queue "demo.orders.cancelled" "orders.cancelled"
bind_queue "demo.orders.payment.pending" "orders.payment.pending"
bind_queue "demo.orders.payment.approved" "orders.payment.approved"
bind_queue "demo.orders.payment.failed" "orders.payment.failed"

bind_queue "demo.customers.created" "customers.created"
bind_queue "demo.customers.updated" "customers.updated"
bind_queue "demo.customers.deleted" "customers.deleted"

bind_queue "demo.notifications.email" "notifications.email"
bind_queue "demo.notifications.sms" "notifications.sms"
bind_queue "demo.notifications.push" "notifications.push"

bind_queue "demo.billing.invoice.created" "billing.invoice.created"
bind_queue "demo.billing.invoice.paid" "billing.invoice.paid"
bind_queue "demo.billing.invoice.overdue" "billing.invoice.overdue"

bind_queue "demo.deadletter.default" "deadletter.default"

echo "Publicando mensagens de exemplo..."

publish_message() {
  ROUTING_KEY="$1"
  MESSAGE="$2"

  curl -fsS -u "${RABBITMQ_USER}:${RABBITMQ_PASS}" \
    -H "content-type: application/json" \
    -X POST \
    "${RABBITMQ_API_URL}/exchanges/${RABBITMQ_VHOST}/demo.direct/publish" \
    -d "{
      \"properties\": {},
      \"routing_key\": \"${ROUTING_KEY}\",
      \"payload\": \"${MESSAGE}\",
      \"payload_encoding\": \"string\"
    }" > /dev/null
}

publish_message "orders.created" "{\"event\":\"orders.created\",\"order_id\":\"1001\"}"
publish_message "orders.payment.pending" "{\"event\":\"orders.payment.pending\",\"order_id\":\"1001\"}"
publish_message "notifications.email" "{\"event\":\"notifications.email\",\"target\":\"user@example.com\"}"
publish_message "billing.invoice.created" "{\"event\":\"billing.invoice.created\",\"invoice_id\":\"INV-1001\"}"
publish_message "deadletter.default" "{\"event\":\"deadletter.default\",\"reason\":\"demo message\"}"

echo "RabbitMQ demo inicializado com sucesso."
echo "Management UI: http://localhost:15672"
echo "Usuário: guest"
echo "Senha: guest"
EOF

chmod +x "${PROJECT_DIR}/infra/rabbitmq/init-queues.sh"

# ==============================================================================
# Docs
# ==============================================================================

cat > "${PROJECT_DIR}/docs/architecture.md" <<'EOF'
# Arquitetura

Projeto: RabbitMQ Monitor Portal

Stack inicial:

- Frontend: React + TypeScript + Vite
- Backend: Python + FastAPI
- Worker: Python
- Banco principal: MySQL
- Fila/cache/lock: Redis
- Ambiente local: Docker Compose
- RabbitMQ demo: container RabbitMQ com Management Plugin

Arquitetura:

Browser -> Frontend React -> Backend FastAPI -> MySQL
                                      |
                                      v
                                    Redis
                                      |
                                      v
                                  Worker Python
                                      |
          RabbitMQ Management API / Datadog / Zabbix / Dynatrace
EOF

cat > "${PROJECT_DIR}/docs/database.md" <<'EOF'
# Banco de Dados

MySQL será a fonte da verdade do sistema.

Entidades previstas:

- clusters
- components
- monitor_templates
- monitor_template_versions
- component_template_bindings
- generated_monitors
- collection_runs
- collection_run_items
- audit_logs
- jobs
EOF

cat > "${PROJECT_DIR}/docs/api.md" <<'EOF'
# API

Base local:

http://localhost:8000

Endpoints iniciais:

- GET /health
- GET /clusters
- GET /components
- GET /templates
- GET /jobs
EOF

# ==============================================================================
# Gitignore
# ==============================================================================

cat > "${PROJECT_DIR}/.gitignore" <<'EOF'
# Python
__pycache__/
*.py[cod]
*.pyo
*.pyd
.Python
.env
.venv/
venv/
env/
dist/
build/
*.egg-info/

# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.vite/
frontend/dist/

# Docker / local
docker-compose.override.yml

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
EOF

# ==============================================================================
# README
# ==============================================================================

cat > "${PROJECT_DIR}/README.md" <<'EOF'
# RabbitMQ Monitor Portal

Portal web para gerenciamento de monitores RabbitMQ em ferramentas de observabilidade como Datadog, Zabbix e Dynatrace.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Python + FastAPI
- Worker: Python
- Banco: MySQL
- Fila/cache/lock: Redis
- Ambiente: Docker Compose
- RabbitMQ demo para validação local

## Subir ambiente

Na raiz do projeto:

```bash
docker compose -f infra/docker-compose.yml up -d --build
EOF