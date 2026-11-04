# Monitor Portal — v0.5.5 Visual v1: arquivos alterados

Base de comparação: `rabbitmq-monitor-portal-v0.5.5_minorFix-completo.zip`, com integração do `client.py` LDAP funcional compartilhado posteriormente.

## Relação completa

| Status | Arquivo |
|---|---|
| NOVO | `DEPLOY_VISUAL_V1.md` |
| MODIFICADO | `Dockerfile_frontend` |
| MODIFICADO | `README.md` |
| MODIFICADO | `VERSION` |
| NOVO | `backend/app/api/routes/dashboard.py` |
| NOVO | `backend/app/api/routes/portal_ui.py` |
| MODIFICADO | `backend/app/core/config.py` |
| MODIFICADO | `backend/app/core/middleware.py` |
| MODIFICADO | `backend/app/main.py` |
| MODIFICADO | `backend/app/models/__init__.py` |
| NOVO | `backend/app/models/portal_settings.py` |
| MODIFICADO | `backend/app/providers/ldap/client.py` |
| MODIFICADO | `frontend/index.html` |
| NOVO | `frontend/public/branding/README.md` |
| NOVO | `frontend/public/favicon.svg` |
| MODIFICADO | `frontend/src/App.tsx` |
| MODIFICADO | `frontend/src/components/AppLayout.tsx` |
| NOVO | `frontend/src/components/BrandIdentity.tsx` |
| NOVO | `frontend/src/components/ParticlesBackground.tsx` |
| MODIFICADO | `frontend/src/pages/AdminPage.tsx` |
| NOVO | `frontend/src/pages/AppearancePage.tsx` |
| MODIFICADO | `frontend/src/pages/DashboardPage.tsx` |
| MODIFICADO | `frontend/src/pages/LoginPage.tsx` |
| NOVO | `frontend/src/pages/WorkspaceHomePage.tsx` |
| NOVO | `frontend/src/services/appearance.tsx` |
| MODIFICADO | `frontend/src/styles/global.css` |
| MODIFICADO | `infra/mysql/init/001_schema.sql` |
| NOVO | `infra/mysql/upgrade/008_v0_5_5_visual_v1.sql` |
| MODIFICADO | `kubernetes.dev.yaml` |
| MODIFICADO | `kubernetes.prod.yaml` |
| MODIFICADO | `kubernetes.uat.yaml` |

## Organização por repositório

**Aplicação (código React/FastAPI):** pastas `frontend/`, `backend/`, `infra/mysql/`, `Dockerfile_frontend`, `VERSION`, `README.md`.

**Azure DevOps / Deploy:** `kubernetes.dev.yaml`, `kubernetes.uat.yaml`, `kubernetes.prod.yaml`, e instruções `DEPLOY_VISUAL_V1.md` conforme sua estrutura corporativa.

⚠️ Para bancos já existentes, executar SQL 008 manualmente antes de publicar a nova API.

⚠️ Os arquivos locais que não foram enviados não podem ser comparados automaticamente; revisar conflitos antes de aplicar.
