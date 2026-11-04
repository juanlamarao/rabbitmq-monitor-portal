# Monitor Portal v0.5.6 — preparo para implantação EKS

Esta documentação complementa a instalação Docker Compose local. **Não realizar deploy corporativo sem validar antes em Dev.**

## Arquitetura e compatibilidade

- Mantidos nomes de todos os Deployments, StatefulSets, Services, HPA, Ingress, CronJob existentes e volumes.
- Novo Deployment **`rabbitmq-monitor-sync-dispatcher`**, usando a imagem Backend **`ImageName2`**, com `replicas: 1`, sem Service/HPA. Comando `python -m app.workers.datadog_dispatcher`.
- O mesmo comando é utilizado por `rabbitmq-monitor-sync-dispatcher` no Docker Compose local. Nenhum Dockerfile novo.
- Cada dispatcher possui `wait-mysql-schema` e usa MySQL/Redis, `CREDENTIAL_ENCRYPTION_KEY` e configuração de AD existentes, clonados do Worker corporativo.
- Variáveis adicionais do processo: `DATADOG_SYNC_POLL_SECONDS=3`, `DATADOG_SYNC_MAX_ATTEMPTS=8` (valores string). O restante conserva os mesmos `__RBTMQ_PORTAL_*__` da Library, incluindo segredos entre aspas duplas.
- `APP_ENV`: `development` em Dev, `uat` em UAT, `production` em Prod.
- MySQL e Redis do EKS continuam sendo os serviços do cluster. RabbitMQ/LDAP locais são apenas infra de desenvolvimento; no EKS não implantamos RabbitMQ de testes nem OpenLDAP local.
- O scheduler antigo permanece configurado como estava, sem ciclo global Datadog na v0.5.6. O sincronismo Datadog passa pelo Dispatcher.

## Pré-deploy: migração SQL 009

O MySQL já existente **não reexecuta** `infra/mysql/init/001_schema.sql`. Antes de publicar a nova API ou ligar o dispatcher, faça backup e aplique:

`infra/mysql/upgrade/009_v0_5_6_datadog_sync_queue.sql`

Exemplo em Bash/WSL com kubectl e permissões no namespace **Dev**:

```bash
NS=rabbitmq-monitor-dev
kubectl -n "$NS" exec rabbitmq-monitor-mysql-0 -c mysql -- \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot rabbitmq_monitor_portal -e "SHOW TABLES;"'
```

Em PowerShell, execute os comandos com redirecionamento de entrada pelo **WSL/Bash**, ou copie o SQL para o Pod com `kubectl cp` e aplique internamente; o operador `<` não é suportado como em Bash no PowerShell tradicional.

## Pipeline Azure DevOps

A pipeline existente continua gerando duas imagens com `Dockerfile_frontend` e `Dockerfile_Backend` e substituindo `ImageName1`/`ImageName2` e os tokens `__RBTMQ_PORTAL_*__`. Não é necessário alterar o pipeline template para adicionar um build.

Atualize os três manifestos no repositório de deploy, embora apenas Dev seja aplicado agora. **Aplique primeiro SQL 009, depois o manifesto e imagens.** O Deployment `rabbitmq-monitor-sync-dispatcher` inicia automaticamente (1 réplica) ao aplicar o YAML.

## Verificações

```bash
kubectl -n rabbitmq-monitor-dev get deployments rabbitmq-monitor-api rabbitmq-monitor-worker rabbitmq-monitor-scheduler rabbitmq-monitor-sync-dispatcher
kubectl -n rabbitmq-monitor-dev rollout status deployment/rabbitmq-monitor-sync-dispatcher
kubectl -n rabbitmq-monitor-dev logs deployment/rabbitmq-monitor-sync-dispatcher -c sync-dispatcher --tail=100
kubectl -n rabbitmq-monitor-dev get pods -l app=rabbitmq-monitor-sync-dispatcher
```

O dispatcher não possui Service externo: ele somente consome registros na tabela MySQL. A sincronização é dirigida por alterações salvas na aplicação, não por um botão. Confirme os status em Administração > Fila Datadog e na coluna Sync das Queues.

**Operação:** comece com 1 réplica. Embora a tabela use bloqueio transacional `SKIP LOCKED`, a reconciliação com a API Datadog é *at least once*; valide idempotência, recuperação e tratamento de conflitos antes de escalar. Não remover PVCs nem apagar filas existentes para atualizar.
