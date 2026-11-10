# Monitor Portal v0.5.6.1 — fila de monitores / referência pública

## Escopo

- Página pública com identidade BTG Light, botão **Acessar portal** e botão **Acessar Datadog**.
- URL Datadog construída pelo backend da organização ligada ao cluster, com busca `tag:"managed_by:rabbitmq-monitor-portal" scope:("<cluster_tag_key>:<cluster_tag_value>" AND "<queue_tag_key>:<queue_name>")`.
- Edição de fila por rascunho: metadados, adição, customização, habilitação e remoção de templates são locais até **Salvar alterações**.
- Novo endpoint atômico `PUT /components/queues/{id}/configuration`; o backend valida todos os IDs antes de alterar a base, registra auditoria e publica uma só revisão na outbox MySQL.
- Quando um template é explicitamente removido, o monitor externo correspondente é marcado para exclusão, processada pelo dispatcher. Remoções automáticas por discovery ou desativação global de templates continuam na proteção contra órfãos.
- Mensagens geradas incluem serviço, criticidade, jornada e URL pública. Essas informações são adicionadas ao final da mensagem para preservar templates personalizados existentes; tags adicionais são emitidas para serviço/criticidade/jornada quando preenchidas.
- SQL 010 opcional corrige padrões conhecidos de mojibake (`ðŸš¨`, `âœ…`) no banco em execução e re-enfileira filas afetadas.

## Compatibilidade Local/EKS

Nenhum nome de container/serviço mudou; `docker-compose.local.yml`, `Dockerfile_Backend`, `Dockerfile_frontend`, `kubernetes.dev.yaml`, `kubernetes.uat.yaml`, `kubernetes.prod.yaml` são idênticos aos da v0.5.6 anterior. Rebuild de **ambas** as imagens Backend e Frontend; não exige novos serviços ou novo schema MySQL.

## Aplicar no Desktop (PowerShell)

1. Atualize os arquivos e mantenha seu `.env.local` e `CREDENTIAL_ENCRYPTION_KEY` atuais.
2. Faça backup antes de alterar templates existentes (recomenda-se backup completo do banco).
3. Para aplicar o patch de caracteres **no banco já existente**, utilize `docker compose cp` para evitar problemas de redirecionamento de UTF-8 pelo PowerShell:

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml cp infra/mysql/upgrade/010_v0_5_6_1_fix_mojibake_templates.sql mysql:/tmp/010.sql
docker compose --env-file .env.local -f docker-compose.local.yml exec mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --default-character-set=utf8mb4 rabbitmq_monitor_portal < /tmp/010.sql'
```

4. Publicar o código:

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml up -d --build rabbitmq-monitor-api rabbitmq-monitor-frontend rabbitmq-monitor-sync-dispatcher
```

5. Atualize a página (Ctrl+Shift+R); acesse uma fila no modo Editar, adicione/customize/remova um template sem salvar, confirme que a fila Datadog não sofreu alterações; clique **Salvar alterações** e observe o status e os logs do dispatcher.

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml logs -f rabbitmq-monitor-sync-dispatcher
```

6. Teste a página pública, seus dois links e o monitor remoto, incluindo **alert** e **recovery**. O link da organização Datadog vem do `Org URL` cadastrado. O link `Acessar Datadog` fica desabilitado se a organização não tiver URL HTTPS configurada.

## Compatibilidade com templates antigos

O SQL 010 só corrige as ocorrências conhecidas de dois emojis corrompidos, sem substituir mensagens customizadas. Para monitores já existentes com texto íntegro, a nova seção de contexto será aplicada no próximo sync daquela queue (por exemplo, ao salvar a fila). O SQL 010 não enfileira indiscriminadamente todos os monitores do ambiente corporativo.

## Controle de edição Datadog

Não existe ACL nativa "somente esta API Key pode editar este monitor". O Datadog restringe edição por identidades, papéis (restricted_roles) e políticas de acesso (Restriction Policies). Para ambiente corporativo, crie uma service account e uma App Key exclusiva para o portal; associe um papel Datadog específico à service account e restrinja os monitores a esse papel, confirmando antes que o portal mantém permissão de editor. Não configuramos roles automaticamente sem os UUIDs da organização. Veja https://docs.datadoghq.com/monitors/guide/how-to-set-up-rbac-for-monitors/ .

## Cuidados

- Exclusão explícita: ao salvar a retirada de um template, o dispatcher **poderá excluir seu monitor Datadog real**. O modal mostra a prévia e exige confirmação ao marcar a retirada.
- O processamento externo é eventual e continua sujeito a retries/limites da API. Não considere sincronizado antes de `Em sync`.
- Não foi possível fazer testes E2E com Docker e Datadog nesse ambiente. Foram feitas verificações estáticas (sintaxe Python/TS, YAML, URLs e inventário de arquivos).
