# Arquitetura

O RabbitMQ Monitor Portal usa o MySQL como fonte da verdade para clusters, filas descobertas, metadados operacionais, templates aplicados, credenciais criptografadas, jobs e audit log.

## Componentes

```text
Frontend React
  -> FastAPI
  -> MySQL
  -> Redis/RQ
  -> Worker Python
  -> RabbitMQ Management API
```

## Scheduler

O scheduler possui ciclos independentes para:

- atualização do cache LDAP/AD no Redis;
- enfileiramento de discovery de queues dos clusters ativos;
- enfileiramento de cleanup físico de queues removidas.

A partir da v0.2.0, o discovery recorrente segue este fluxo:

```text
Scheduler
  -> cria jobs discovery_queues no MySQL
  -> enfileira no Redis/RQ
  -> Worker processa cada job
  -> consulta /api/queues/ no RabbitMQ
  -> atualiza rabbitmq_queues
  -> grava resultado em job_history
  -> registra audit_logs
```

A partir da v0.2.1, o cleanup de queues removidas segue este fluxo:

```text
Scheduler ou ação manual
  -> cria job cleanup_removed_queues no MySQL
  -> enfileira no Redis/RQ
  -> Worker processa o job
  -> apaga fisicamente rabbitmq_queues removidas há mais de 60 dias
  -> grava resultado em job_history
  -> registra audit_logs
```

A tela operacional fica em:

```text
Administração > Jobs
```


## Edição em massa

A partir da v0.4.0, a tela **Edição em massa** usa o mesmo banco como fonte da verdade e executa alterações diretamente nas entidades locais:

```text
Filtros de queues
  -> Prévia de impacto
  -> Ação em massa
  -> MySQL
  -> Audit Log
```

As ações de template preservam a herança dinâmica. Aplicar um template cria o vínculo `queue_monitor_templates`; customizar em massa grava apenas `overrides`; limpar customização remove os overrides e volta a herdar `monitor_templates.default_config`.

## Templates

A partir da v0.3.0, a gestão de templates passa a ter CRUD operacional na interface.

O modelo continua com herança dinâmica:

```text
Queue + Template + Overrides locais -> Configuração efetiva
```

Alterar `monitor_templates.default_config` impacta automaticamente as queues que usam o template sem override local no campo alterado. Por isso, a tela de templates inclui uma prévia de impacto e uma visão de uso por queue.

## Diretório

O OpenLDAP local simula o AD para desenvolvimento. O scheduler atualiza o cache de pessoas no Redis, usado pelos autocompletes de owner, devs e grupos SRE.

## Imagem

A imagem principal de arquitetura deve ficar em:

```text
img/architecture.png
```

## Criptografia compartilhada

Credenciais RabbitMQ e Datadog são criptografadas com Fernet. A mesma `CREDENTIAL_ENCRYPTION_KEY` deve ser usada por `api`, `worker` e `scheduler`, porque a API salva a credencial e o worker precisa descriptografá-la durante jobs de discovery/sync.

## v0.5.0 — Arquitetura Datadog Planner

A integração Datadog começa com um planner/dry-run. O portal calcula o estado desejado, mas ainda não cria monitores reais.

Fluxo:

```text
Templates + Queues + Clusters + Datadog Orgs
  -> Datadog Planner
  -> Buckets agrupados por org/template/configuração efetiva
  -> Query/message/tags/options renderizados
  -> Tela Administração > Datadog Sync
```

Tags Datadog permitidas nesta etapa:

```text
rabbitmq_cluster
vhost
queue
```

Não serão adicionadas tags como owner, criticality, sre_group ou service para evitar aumento de cardinalidade. Esses metadados permanecem no portal e são acessados pela página pública de referência da queue.

Página pública:

```text
/public/queue-reference?rabbitmq_cluster=<cluster>&vhost=<vhost>&queue=<queue>
```

O message template Datadog deve apontar para essa URL usando variáveis do monitor agrupado.

## v0.5.1 — Persistência do estado desejado Datadog

A partir da v0.5.1, o Datadog Planner deixa de ser apenas um dry-run temporário e passa a salvar o estado desejado no banco.

Fluxo:

```text
Templates + Queues + Clusters + Datadog Orgs
  -> Datadog Planner
  -> Buckets agrupados por org/template/configuração efetiva
  -> Hash do estado desejado
  -> generated_monitors
  -> Tela Administração > Datadog Sync
```

Status usados nesta etapa:

```text
pending_create
pending_update
synced
orphaned
error
disabled
```

Nenhuma chamada de criação/alteração é feita na API Datadog nesta versão. A execução real fica para a v0.5.2.
