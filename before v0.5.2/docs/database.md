# Banco de Dados

MySQL é a fonte da verdade do sistema.

## Script inicial

O schema inicial está em:

```text
infra/mysql/init/001_schema.sql
```

O `docker-compose.yml` monta esse diretório em:

```text
/docker-entrypoint-initdb.d
```

Com a imagem `mysql:8.4`, scripts nesse diretório são executados automaticamente apenas quando o volume do MySQL é criado vazio pela primeira vez.

Se o volume `mysql_data` já existir, o MySQL não reexecuta o script automaticamente. Para recriar do zero em ambiente local:

```bash
cd infra
docker compose down -v
docker compose up --build
```

Além do script SQL, a API também executa `create_all` e seed inicial no startup para facilitar desenvolvimento quando o volume já existe sem as tabelas ou sem os dados base.

## Tabelas criadas

- `sre_groups`
- `datadog_orgs`
- `rabbitmq_clusters`
- `cluster_temporary_queue_regexes`
- `rabbitmq_queues`
- `monitor_templates`
- `queue_monitor_templates`
- `generated_monitors`
- `job_history`
- `audit_logs`

## Seeds iniciais

O script cria:

- Grupo `SRE Default`
- Datadog Org `Datadog Default`
- 5 templates de queue:
  - Fila com quantidade de mensagens acima de threshold
  - Fila DLQ com mensagens acima de threshold
  - Fila com mensagens e baixo consumidores
  - Fila com mensagens crescentes
  - Fila sem mensagens

## Histórico de jobs

A tabela `job_history` registra os jobs assíncronos da aplicação.

Na v0.2.1 e v0.3.0, ela é usada principalmente para os jobs:

```text
discovery_queues
cleanup_removed_queues
```

Status esperados:

- `queued`
- `running`
- `success`
- `error`

Os contadores de discovery ficam no campo `details.result`, por exemplo:

```json
{
  "result": {
    "fetched": 15,
    "created": 2,
    "updated": 13,
    "restored": 0,
    "marked_removed": 1,
    "temporary_matched": 0
  }
}
```

## Remoção lógica de queues

Queues que desaparecem no discovery são marcadas com:

- `is_removed = true`
- `removed_at = NOW()`

Elas não aparecem no frontend por padrão. Só aparecem quando o filtro `Mostrar removidas` estiver habilitado.

A partir da v0.2.1, a remoção física é feita por job assíncrono `cleanup_removed_queues`.

A rotina apaga definitivamente queues que atendam aos critérios:

- `is_removed = true`
- `removed_at IS NOT NULL`
- `removed_at <= NOW() - REMOVED_QUEUE_RETENTION_DAYS`

O padrão de retenção é 60 dias.

## Herança dinâmica de templates

A tabela `queue_monitor_templates` vincula uma queue a um template.

A configuração efetiva é calculada com:

```text
default_config do template atual + overrides locais da queue
```

Assim, quando o template padrão muda, as queues vinculadas passam a herdar o novo padrão automaticamente, exceto campos que tenham override local.


Na v0.3.0, os templates podem ser criados, editados, desativados e reativados pela interface. A rotina de seed inicial deixou de sobrescrever templates já existentes no startup para preservar customizações feitas no portal.

## Criptografia compartilhada

Credenciais RabbitMQ e Datadog são criptografadas com Fernet. A mesma `CREDENTIAL_ENCRYPTION_KEY` deve ser usada por `api`, `worker` e `scheduler`, porque a API salva a credencial e o worker precisa descriptografá-la durante jobs de discovery/sync.


## Edição em massa

A versão `v0.4.0` não adiciona novas tabelas. As ações em massa reutilizam:

- `rabbitmq_queues` para metadados operacionais;
- `queue_monitor_templates` para vínculos e overrides;
- `audit_logs` para registrar cada operação em massa.

## v0.5.0 — Campos Datadog em monitor_templates

A versão v0.5.0 adiciona campos para planejamento Datadog nos templates:

```text
datadog_monitor_type VARCHAR(80)
datadog_query_template TEXT
datadog_message_template TEXT
datadog_tags_template JSON
datadog_options JSON
```

Upgrade para bancos existentes:

```bash
cd infra
docker compose exec -T mysql mysql -uroot -proot_password rabbitmq_monitor_portal < mysql/upgrade/004_v0_5_0_datadog_planner.sql
```

A versão v0.5.0 não altera a tabela `generated_monitors`; a persistência do estado desejado fica planejada para v0.5.1.

## v0.5.1 — Estado desejado em generated_monitors

A versão v0.5.1 expande `generated_monitors` para armazenar o estado desejado dos monitores Datadog agrupados antes da criação real via API.

Novos campos principais:

```text
datadog_org_id
cluster_id
monitor_scope_type
grouping_key
name
query
message
tags_json
options_json
covered_queues_count
sample_queues_json
desired_config_hash
applied_config_hash
sync_status
external_monitor_id
external_monitor_url
last_planned_at
last_synced_at
last_error
```

Upgrade para bancos existentes:

```bash
cd infra
docker compose exec -T mysql mysql -uroot -proot_password rabbitmq_monitor_portal < mysql/upgrade/005_v0_5_1_generated_monitors.sql
```
