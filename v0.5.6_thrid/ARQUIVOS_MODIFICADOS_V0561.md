# Arquivos modificados — v0.5.6.1

Base: monitor-portal-v0.5.6-local-eks-ready-nomes-padronizados.zip

- `DEPLOY_V0561_QUEUE_SAVE_AND_PUBLIC.md` (novo)
- `VERSION`
- `backend/app/api/routes/components.py`
- `backend/app/main.py`
- `backend/app/providers/datadog/client.py`
- `backend/app/schemas/component.py`
- `backend/app/schemas/public_reference.py`
- `backend/app/services/component_service.py`
- `backend/app/services/datadog_planner_service.py`
- `backend/app/services/public_reference_service.py`
- `backend/app/workers/datadog_dispatcher.py`
- `frontend/package.json`
- `frontend/src/pages/PublicQueueReferencePage.tsx`
- `frontend/src/pages/QueuesPage.tsx`
- `frontend/src/types/api.ts`
- `infra/mysql/init/001_schema.sql`
- `infra/mysql/upgrade/010_v0_5_6_1_fix_mojibake_templates.sql` (novo)

**Sem alterações:** Dockerfiles, Docker Compose local e os três manifestos EKS.
**SQL 010:** reparo dos textos de templates existentes; não altera estrutura de tabela.
