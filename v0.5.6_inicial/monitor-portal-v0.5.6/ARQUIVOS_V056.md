# Arquivos da v0.5.6 (relativos ao último pacote v0.5.5 Visual v1.1)

## Novos
- `docker-compose.local.yml`
- `.env.local.example`
- `scripts/setup-local-env.py`
- `infra/rabbitmq/enabled_plugins`
- `infra/datadog/conf.d/rabbitmq.d/conf.yaml`
- `infra/mysql/upgrade/009_v0_5_6_datadog_sync_queue.sql`
- `backend/app/models/datadog_sync_queue.py`
- `backend/app/services/datadog_sync_queue_service.py`
- `backend/app/workers/datadog_dispatcher.py`
- `backend/app/api/routes/datadog_sync_queue.py`
- `INSTALAR_LOCAL_V056.md`
- `ARQUIVOS_V056.md`

## Modificados
- `README.md`
- `.gitignore`
- `VERSION`
- `infra/mysql/init/001_schema.sql`
- `infra/rabbitmq/init-queues.sh`
- `backend/app/core/config.py`
- `backend/app/models/__init__.py`
- `backend/app/models/component.py`
- `backend/app/main.py`
- `backend/app/core/middleware.py`
- `backend/app/providers/ldap/client.py`
- `backend/app/services/datadog_planner_service.py`
- `backend/app/services/template_service.py`
- `backend/app/services/component_service.py`
- `backend/app/services/cluster_service.py`
- `backend/app/services/bulk_action_service.py`
- `backend/app/workers/scheduler.py`
- `backend/app/schemas/component.py`
- `frontend/src/types/api.ts`
- `frontend/src/pages/QueuesPage.tsx`
- `frontend/src/pages/DatadogSyncPage.tsx`
- `frontend/src/pages/AdminPage.tsx`
- `frontend/src/components/AppLayout.tsx`

## Não alterados
- `Dockerfile_Backend`, `Dockerfile_frontend`
- `kubernetes.dev.yaml`, `kubernetes.uat.yaml`, `kubernetes.prod.yaml` (implementação focada em Docker Desktop)
- SQL 007 e 008; os dados existentes são preservados
