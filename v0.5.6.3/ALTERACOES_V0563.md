# Monitor Portal v0.5.6.3 — Correções de frontend e compatibilidade CI/EKS

## Mudanças
- Dockerfile_Backend: `PIP_TRUSTED_HOST` com hosts padrão PyPI como argumento de build; aplica apenas no `pip install`. Preferir CA corporativa confiável assim que disponível.
- Dockerfile_frontend: `NPM_STRICT_SSL` com padrão `false` para compatibilidade com proxy corporativo. Aplica somente no `npm install` e não afeta o Nginx de runtime. Em pipelines com CA válida, passar `--build-arg NPM_STRICT_SSL=true`.
- Manifestos Dev/UAT/Prod: o bootstrap SQL do `prepare-schema` foi convertido para `- |` (YAML literal block), sem mudar seu conteúdo. Todos os demais manifests/workloads preservados.
- Administração: inclusão do card Reconciliação Datadog, menu lateral e cards na mesma ordem; LDAP por último somente na página; cards de altura uniforme e botões alinhados ao rodapé.
- Dashboard: texto atualizado e removidos breadcrumb interno, aviso final e indicador de ambiente.
- Clusters: `environment` oculto no frontend mas mantido no banco/API. O valor existente é preservado ao editar e o valor padrão atual continua sendo enviado para novos cadastros.
- Templates: texto de ajuda reduzido a `[[`.
- Filtros: eliminado override global que removia margem esquerda; Select, FormControl e TextField pequenos no tema, sem mexer em multiline.
- Aparência: alinhamento do Grid de seleção e remoção do breadcrumb interno redundante.
- Audit Logs: novos filtros por texto, entidade, ação, ator e intervalo de datas; backend aplica filtros no MySQL e respeita limite máximo 500, sem necessidade de migração.
- Páginas operacionais: tamanhos de títulos (`h4`) e textos auxiliares (`body2`) padronizados.

## Deploy local
1. Substituir os arquivos do patch, preservando `.env.local` e volumes.
2. `docker compose --env-file .env.local -f docker-compose.local.yml up -d --build --no-deps rabbitmq-monitor-api rabbitmq-monitor-frontend`
3. Reabrir o portal e validar `/audit-logs`, `/admin`, `/templates`, `/queues`, `/clusters` e `/admin/appearance`.

## Deploy no EKS
- Rebuild e publicação de ImageName1 e ImageName2, ambos com os Dockerfiles da raiz.
- Os manifestos foram reformulados somente para legibilidade do comando prepare-schema; nenhuma alteração de recursos ou nomes.
- Não há migração MySQL nesta versão.
- Para alternar verificação TLS no build, `--build-arg NPM_STRICT_SSL=true` e/ou `--build-arg PIP_TRUSTED_HOST=""` (se os repositórios forem confiáveis).

## Validação
- A versão é uma correção de código. Deve ser validada com `npm run build` e Docker Desktop/EKS no ambiente de destino. Nunca execute `docker compose down -v` para aplicar este patch.
