# Alterações — v0.5.5_minorFix (base: v0.5.5 Entra + AD + EKS)

## Arquivos MODIFICADOS

| Caminho | O que mudou | Repositório sugerido |
|---|---|---|
| `VERSION` | Identificador `0.5.5_minorFix` | Aplicação |
| `kubernetes.dev.yaml` | Todos os tokens para `__RBTMQ_PORTAL_*__`; `ImageName1`/`ImageName2` sem aspas; valores `env:` com tokens entre aspas duplas; `APP_ENV=development` | Deploy / Azure DevOps |
| `AZURE_DEVOPS_AUTH_VARIABLES.env.example` | Nomes das variáveis com prefixo e valores de referência para Dev | Deploy / Azure DevOps |
| `README.md` | Seção v0.5.5_minorFix e referência aos três manifestos | Aplicação (opcional também Deploy) |
| `AZURE_DEVOPS_DEPLOY.md` | Orientação atualizada para novo replace e três ambientes | Deploy / Azure DevOps |
| `DEPLOY_V055.md` | Link para migração DEV e compatibilidade de tokens | Deploy / Azure DevOps |

## Arquivos NOVOS

| Caminho | O que contém | Repositório sugerido |
|---|---|---|
| `kubernetes.uat.yaml` | Mesmo manifesto Dev, somente `APP_ENV=uat` | Deploy / Azure DevOps |
| `kubernetes.prod.yaml` | Mesmo manifesto Dev, somente `APP_ENV=production` | Deploy / Azure DevOps |
| `azure-devops-library-dev.env.example` | Referência de variáveis para o Variable Group Dev | Deploy / Azure DevOps |
| `azure-devops-library-uat.env.example` | Referência de variáveis para o Variable Group UAT | Deploy / Azure DevOps |
| `azure-devops-library-prod.env.example` | Referência de variáveis para o Variable Group Prod | Deploy / Azure DevOps |
| `MIGRACAO_SQL_007_DEV.md` | Execução via `kubectl exec` no MySQL Dev existente | Deploy / operações |
| `ARQUIVOS_ALTERADOS.md` | Esta lista e orientação para divisão dos repositórios | Deploy / operações |

## Arquivos INTENCIONALMENTE NÃO ALTERADOS

- `Dockerfile_frontend` e `Dockerfile_Backend`: nenhum ajuste necessário; o replace das imagens acontece apenas nos manifestos.
- `backend/requirements.txt`, `frontend/package.json`, componentes React e arquivos Python: sem mudanças neste minorFix.
- `infra/mysql/upgrade/007_v0_5_5_entra_auth.sql`: migração original v0.5.5 preservada; executar apenas em Dev no momento.
- Configuração operacional e dados do MySQL/Redis: nenhum PVC modificado/apagado pelo pacote.

## Importante

Você mencionou alterações feitas localmente, mas **não forneceu os arquivos modificados nesta mensagem**. Portanto, este pacote foi preparado sobre a última v0.5.5 disponível; caso seu Git tenha commits adicionais, mescle SOMENTE os arquivos listados e compare antes de substituir, principalmente os manifestos de deployment.
