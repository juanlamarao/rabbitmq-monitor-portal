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

## Remoção lógica de queues

Queues que desaparecem no discovery são marcadas com:

- `is_removed = true`
- `removed_at = NOW()`

Elas não aparecem no frontend por padrão. Só aparecem quando o filtro `Mostrar removidas` estiver habilitado.

A remoção física após 60 dias será implementada via worker/scheduler em fase futura.

## Herança dinâmica de templates

A tabela `queue_monitor_templates` vincula uma queue a um template.

A configuração efetiva é calculada com:

```text
default_config do template atual + overrides locais da queue
```

Assim, quando o template padrão muda, as queues vinculadas passam a herdar o novo padrão automaticamente, exceto campos que futuramente tenham override local.
