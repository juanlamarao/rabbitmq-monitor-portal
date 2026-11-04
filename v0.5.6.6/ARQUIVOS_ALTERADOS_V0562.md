# Arquivos novos e modificados — v0.5.6.2

Comparação com `v0.5.6.1-hotfix-queue-tela-branca`.

| Tipo | Caminho |
|---|---|
| NOVO | `DEPLOY_V0562_RECONCILIACAO.md` |
| ALTERADO | `README.md` |
| ALTERADO | `VERSION` |
| NOVO | `backend/app/api/routes/datadog_reconcile.py` |
| ALTERADO | `backend/app/core/bootstrap.py` |
| ALTERADO | `backend/app/core/config.py` |
| ALTERADO | `backend/app/core/middleware.py` |
| ALTERADO | `backend/app/main.py` |
| ALTERADO | `backend/app/models/__init__.py` |
| NOVO | `backend/app/models/datadog_reconciliation.py` |
| ALTERADO | `backend/app/providers/datadog/client.py` |
| ALTERADO | `backend/app/services/datadog_planner_service.py` |
| NOVO | `backend/app/services/datadog_reconcile_service.py` |
| NOVO | `backend/app/workers/datadog_reconciler.py` |
| ALTERADO | `docker-compose.local.yml` |
| ALTERADO | `frontend/package.json` |
| ALTERADO | `frontend/src/App.tsx` |
| ALTERADO | `frontend/src/components/AppLayout.tsx` |
| NOVO | `frontend/src/components/PortalVariableField.tsx` |
| NOVO | `frontend/src/pages/DatadogReconciliationPage.tsx` |
| ALTERADO | `frontend/src/pages/PublicQueueReferencePage.tsx` |
| ALTERADO | `frontend/src/pages/TemplatesPage.tsx` |
| ALTERADO | `infra/mysql/init/001_schema.sql` |
| NOVO | `infra/mysql/upgrade/011_v0_5_6_2_datadog_reconciliation.sql` |
| NOVO | `infra/mysql/upgrade/012_v0_5_6_2_portal_variables.sql` |
| ALTERADO | `kubernetes.dev.yaml` |
| ALTERADO | `kubernetes.prod.yaml` |
| ALTERADO | `kubernetes.uat.yaml` |
