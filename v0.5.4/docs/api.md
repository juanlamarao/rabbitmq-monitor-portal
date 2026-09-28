# API

Base local:

```text
http://localhost:8000
```

## Health

- `GET /health`

## Administração

- `GET /admin/sre-groups`
- `POST /admin/sre-groups`
- `PUT /admin/sre-groups/{group_id}`
- `DELETE /admin/sre-groups/{group_id}`
- `GET /admin/datadog-orgs`
- `POST /admin/datadog-orgs`
- `PUT /admin/datadog-orgs/{org_id}`
- `DELETE /admin/datadog-orgs/{org_id}`

## Clusters

- `GET /clusters`
- `POST /clusters`
- `GET /clusters/{cluster_id}`
- `PUT /clusters/{cluster_id}`
- `POST /clusters/{cluster_id}/test-connection`
- `POST /clusters/{cluster_id}/discover-queues`

O endpoint `/clusters/{cluster_id}/discover-queues` permanece disponível por compatibilidade, mas a partir da v0.2.0 ele enfileira um job assíncrono.

O discovery usa a RabbitMQ Management API:

```http
GET /api/queues/?enable_queue_totals=true&disable_stats=true
```

## Queues

- `GET /components/queues`
- `GET /components/queues?removed_only=true`
- `GET /components/queues?cluster_id=1&search=orders`
- `GET /components/queues?template_id=1&customized_only=true`
- `PUT /components/queues/{queue_id}`
- `GET /components/queues/{queue_id}/templates`
- `POST /components/queues/{queue_id}/templates`
- `PUT /components/queues/{queue_id}/templates/{binding_id}`
- `DELETE /components/queues/{queue_id}/templates/{binding_id}`


## Edição em massa

- `POST /components/queues/bulk/preview`
- `POST /components/queues/bulk/apply`

A prévia recebe filtros de queues e retorna a quantidade total encontrada e uma amostra. A aplicação executa uma das ações:

- `update_metadata`
- `apply_template`
- `remove_template`
- `update_template_overrides`
- `clear_template_overrides`
- `set_template_enabled`

Exemplo de filtro com regex e template:

```json
{
  "filters": {
    "cluster_id": 1,
    "name_regex": "^orders\\.",
    "template_id": 2,
    "customized_only": false,
    "sample_limit": 200
  }
}
```

Exemplo de ação para aplicar template:

```json
{
  "filters": { "cluster_id": 1, "name_regex": "^orders" },
  "action": "apply_template",
  "template_id": 2,
  "overrides": { "threshold": 1000 }
}
```

## Templates

- `GET /templates`
- `GET /templates?component_type=queue`
- `GET /templates?active_only=true&search=messages`
- `POST /templates`
- `GET /templates/{template_id}`
- `PUT /templates/{template_id}`
- `POST /templates/{template_id}/deactivate`
- `POST /templates/{template_id}/reactivate`
- `DELETE /templates/{template_id}`
- `GET /templates/{template_id}/usage`
- `POST /templates/{template_id}/impact`

Na v0.3.0, a tela **Templates** permite gestão completa dos templates de queue. A remoção física só é permitida para templates customizados que não estejam em uso. Templates em uso devem ser desativados para impedir novas aplicações sem quebrar as filas já vinculadas.

## Jobs

- `GET /jobs`
- `GET /jobs?status=error`
- `GET /jobs?cluster_id=1&limit=50`
- `GET /jobs/{job_id}`
- `POST /jobs/discovery/cluster/{cluster_id}`
- `POST /jobs/discovery/all`
- `POST /jobs/cleanup/removed-queues`
- `POST /jobs/{job_id}/retry`

Status esperados:

```text
queued
running
success
error
```

Tipos de job atuais:

```text
discovery_queues
cleanup_removed_queues
```

## Audit Log

- `GET /audit-logs`

## v0.5.0 — Datadog Planner / Dry-run

### Gerar dry-run de monitores Datadog

```http
GET /datadog-sync/plan?datadog_org_id=<id>&template_id=<id>&sample_limit=10
```

Parâmetros opcionais:

- `datadog_org_id`: filtra uma org Datadog.
- `template_id`: filtra um template.
- `sample_limit`: quantidade de queues de amostra por bucket, entre 1 e 100.

A resposta contém:

- resumo do plano;
- buckets agrupados por org/template/configuração efetiva;
- query renderizada;
- message template renderizado;
- tags/options;
- warnings/errors;
- amostra de filas cobertas.

Nenhuma alteração é aplicada no Datadog nesta versão.

### Referência pública da queue

```http
GET /public/queue-reference?rabbitmq_cluster=<cluster>&vhost=<vhost>&queue=<queue>
```

Endpoint público usado nos alertas Datadog para recuperar o contexto completo da queue no portal.

Essa rota não deve ser protegida por SAML/RBAC em versões futuras.

## v0.5.1 — Estado desejado Datadog

### Persistir plano atual

```http
POST /datadog-sync/plan/persist
```

Body:

```json
{
  "datadog_org_id": null,
  "template_id": null,
  "sample_limit": 10
}
```

A operação salva/atualiza o estado desejado em `generated_monitors`, mas ainda não cria ou altera monitores reais no Datadog.

A resposta contém:

- `created`: novos buckets persistidos;
- `updated`: buckets existentes com hash alterado;
- `unchanged`: buckets sem alteração;
- `orphaned`: monitores planejados antes que saíram do escopo;
- `skipped_with_errors`: buckets ignorados por erro de configuração.

### Listar estado desejado salvo

```http
GET /datadog-sync/generated-monitors?datadog_org_id=<id>&template_id=<id>&sync_status=<status>&active_only=true&limit=200
```

Retorna os monitores planejados salvos no banco, incluindo query, message, tags, options, hashes e status de sync.


## Integração Datadog — v0.5.2

A versão `v0.5.2` aplica o estado desejado salvo em `generated_monitors` criando ou atualizando monitores agrupados reais no Datadog via API.

Fluxo operacional:

1. Gerar dry-run em `Administração > Datadog Sync`.
2. Salvar plano.
3. Clicar em `Aplicar no Datadog`.
4. Acompanhar o job `datadog_sync_monitors` em `Administração > Jobs`.

Guardrails desta versão:

- Só aplica monitores com status `pending_create`, `pending_update` ou `error`.
- Ignora `orphaned` e `disabled`.
- Não deleta, não muta e não renomeia monitores fora de escopo.
- Não aplica se query, message ou credenciais Datadog estiverem ausentes.
- Usa API Datadog v1 de Monitors para `POST /api/v1/monitor` e `PUT /api/v1/monitor/{monitor_id}`.

O resultado do job atualiza:

- `external_monitor_id`
- `external_monitor_url`
- `applied_config_hash`
- `last_synced_at`
- `sync_status`
- `last_error`, quando houver falha

Não há upgrade SQL novo entre `v0.5.1` e `v0.5.2`.


## Integração Datadog — v0.5.4

A versão `v0.5.4` muda a estratégia inicial de integração Datadog para **monitor dedicado por fila/template**. Cada aplicação de template em uma fila gera um monitor Datadog com scope explícito de cluster, vhost e queue. Isso evita que um monitor planejado para poucas filas use um filtro amplo como `rabbitmq_cluster:*` e acabe afetando todas as filas da org.

Também foi adicionado o mapeamento de integração Datadog no cadastro do cluster, permitindo configurar nomes de tags e métricas por cluster, por exemplo `vhost/queue` ou `rabbitmq_vhost/rabbitmq_queue`, além do valor real da tag de cluster no Datadog.

O scheduler passou a usar intervalos diários por padrão para cache LDAP/AD, discovery e sync Datadog. O cache do diretório é atualizado no startup do scheduler e depois a cada `DIRECTORY_CACHE_REFRESH_INTERVAL_SECONDS`; também há botão manual em Administração para forçar o sync do diretório. O healthcheck do OpenLDAP foi reduzido para diminuir ruído de logs.

Upgrade SQL a partir de v0.5.2/v0.5.3:

```bash
cd infra
docker compose exec -T mysql mysql -uroot -proot_password rabbitmq_monitor_portal < mysql/upgrade/006_v0_5_4_dedicated_datadog.sql
docker compose up -d --build
```
