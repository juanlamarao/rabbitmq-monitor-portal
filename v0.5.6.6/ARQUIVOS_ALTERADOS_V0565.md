# Arquivos novos ou modificados — Monitor Portal v0.5.6.5

Comparação realizada contra o ZIP completo da v0.5.6.4, arquivo a arquivo.

## Frontend (5)

- `frontend/src/pages/AppearancePage.tsx`
- `frontend/src/pages/AuditLogPage.tsx`
- `frontend/src/pages/DatadogSyncPage.tsx`
- `frontend/src/pages/PublicQueueReferencePage.tsx`
- `frontend/src/pages/ReportsPage.tsx`

## Versão e documentação (4)

- `VERSION`
- `README.md`
- `ALTERACOES_V0565.md` (novo)
- `ACESSO_MYSQL_EKS_DEV_UAT_PROD.md` (novo)

## Manifestos opcionais (3 novos)

- `infra/kubernetes/mysql-access/mysql-nodeport-dev.yaml`
- `infra/kubernetes/mysql-access/mysql-nlb-internal-aws-controller.yaml`
- `infra/kubernetes/mysql-access/mysql-nlb-internal-eks-auto-mode.yaml`

## Scripts opcionais (3 novos)

- `scripts/eks-mysql-access/diagnostico-mysql.ps1`
- `scripts/eks-mysql-access/port-forward-mysql.ps1`
- `scripts/eks-mysql-access/port-forward-mysql.sh`

## Este próprio índice (1 novo)

- `ARQUIVOS_ALTERADOS_V0565.md`

**Total: 16 arquivos.**

### Confirmações de compatibilidade

- Nenhum arquivo `backend/` modificado.
- Nenhum `docker-compose.local.yml`, `Dockerfile_frontend`, `Dockerfile_Backend` ou `kubernetes.dev.yaml`, `kubernetes.uat.yaml`, `kubernetes.prod.yaml` modificado.
- Nenhuma migração SQL necessária nesta revisão.
- Os Services opcionais só são criados ao executar `kubectl apply` explicitamente.
