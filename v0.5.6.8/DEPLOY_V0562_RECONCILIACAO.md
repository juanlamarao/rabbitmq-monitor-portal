# Monitor Portal v0.5.6.2 — Variáveis, página pública e reconciliador Datadog

Esta versão evolui a v0.5.6.1-hotfix, preservando nomes de serviços local/EKS, o login, o MySQL, o Redis e a fila automática Datadog.

## 1. Alterações

- `[[...]]` para variáveis do **Portal**; as condicionais `{{#is_alert}}`, `{{/is_alert}}`, `{{#is_recovery}}` e outras expressões **Datadog** ficam intactas.
- Autocompletar de variáveis ao digitar `[[` nas áreas de Query, Message e Tags JSON do editor de templates.
- Serviço, criticidade e jornada configuráveis por template. Exemplo de tags: `"service:[[tag.service_name]]"`, `"criticality:[[tag.criticality]]"`, `"journey:[[tag.journey]]"`; campos vazios não geram tags. Para texto das mensagens usar `[[service_name]]`, `[[criticality]]`, `[[journey]]`.
- `portal_binding_id:<id>` e `portal_instance:<environment>` e `managed_by:rabbitmq-monitor-portal` são tags técnicas obrigatórias. Não há mais injeção automática de outras tags nem de rodapé de contexto; o template controla conteúdo/tags da mensagem.
- Página pública: sem logo BTG; nome da fila em destaque e cluster abaixo, no cabeçalho; removidos textos redundantes do card.
- Reconciliador diário/manualmente acionável com histórico, progresso por cluster/queue, identificação das ações, IDs remotos recuperados e monitores sem vínculo.

## 2. Como rodar localmente (Windows + Docker Desktop)

Na raiz do projeto:

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml config --quiet
```

**Banco existente:** faça backup. Se necessário, aplique a migração de estrutura antes de subir a nova API:

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml cp infra/mysql/upgrade/011_v0_5_6_2_datadog_reconciliation.sql mysql:/tmp/011.sql
docker compose --env-file .env.local -f docker-compose.local.yml exec mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot rabbitmq_monitor_portal < /tmp/011.sql'
```

Converta os placeholders legados armazenados no banco (preserva as variáveis Datadog):

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml cp infra/mysql/upgrade/012_v0_5_6_2_portal_variables.sql mysql:/tmp/012.sql
docker compose --env-file .env.local -f docker-compose.local.yml exec mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot rabbitmq_monitor_portal < /tmp/012.sql'
```

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml up -d --build
```

Os volumes anteriores não devem ser apagados. A instalação **nova** já inclui as tabelas no schema inicial e o bootstrap cria a linha de controle da reconciliação.

Reconciliador:

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml logs -f rabbitmq-monitor-reconciler
```

Abra **Administração > Reconciliação Datadog**. A primeira execução automática acontece após o worker iniciar; depois, no mínimo um intervalo de 24h (86400 segundos) entre solicitações automáticas. O Admin pode iniciar outra execução manualmente quando não há uma ativa.

## 3. Deploy no EKS — quando voltar à empresa

1. Fazer backup do banco de Dev.
2. Executar SQL **011** e **012** uma vez no banco existente; UAT/Prod somente quando decidirem implantar lá.
3. Publicar as imagens via `Dockerfile_Backend` e `Dockerfile_frontend`, usando `ImageName2` e `ImageName1` no YAML.
4. Aplicar o respectivo `kubernetes.<env>.yaml`. O novo Deployment `rabbitmq-monitor-reconciler` usa somente **ImageName2**, tem 1 réplica, não requer novo Service nem HPA.
5. Validar `/api/datadog-reconcile/latest`, a página Admin e os logs do reconciliador.

Nenhum nome de workload anterior, PVC, Secret, ConfigMap ou configuração TLS foi alterado. Os valores sensíveis permanecem entre aspas duplas no manifesto do novo Deployment. Não criamos variáveis obrigatórias novas da Library; o worker usa `DATADOG_RECONCILE_INTERVAL_SECONDS=86400` e `DATADOG_RECONCILE_POLL_SECONDS=10` por padrão.

## 4. Segurança e limites

- A reconciliação só gerencia monitores da org atual com a tag `managed_by:rabbitmq-monitor-portal`, ignorando monitores explicitamente pertencentes a outro `portal_instance`.
- Monitores sem correspondência local são contados como **remotos sem vínculo**, nunca excluídos automaticamente.
- Se perder o ID do monitor local, tenta recuperar com `portal_binding_id` e, para legados, correspondência única de nome+query; se a associação for ambígua, registra erro em vez de adotar qualquer monitor.
- Se a busca na org falhar ou retornar resultados incompletos, não presume que os monitores estão ausentes e **não cria monitores** naquela organização.
- Filas com mudanças pendentes, erro ou revisão bloqueada na outbox são deixadas para o dispatcher ou tratamento manual; a reconciliação não apaga nem contorna proteções da fila.
- O endpoint que inicia a execução é restrito a Admin pelo middleware; há proteção CSRF e lock transacional no MySQL, de modo que chamadas concorrentes retornam HTTP 409.
- **Escala:** a primeira implementação compara detalhes de cada monitor individualmente. Testar impacto de rate limiting e tempo de execução antes de utilizá-la em ambientes com 200 mil monitores. O worker faz retries com backoff apenas em chamadas idempotentes GET/PUT.
- **Limite operacional conhecido:** a fila automática e o reconciliador são processos separados; cenários de alterações simultâneas durante uma chamada externa longa exigem teste de concorrência e idempotência. Não ativar em produção sem validar no Trial/Dev e fazer observação dos logs.
- O bloqueio é recuperável quando o worker verifica um heartbeat com mais de 40 minutos; não execute múltiplas réplicas desse worker sem uma revisão da estratégia de lease.

## 5. Testes propostos

1. Editar `queue_messages_above_threshold`, acrescentar `service:[[tag.service_name]]`, `criticality:[[tag.criticality]]`, `journey:[[tag.journey]]` no JSON de tags.
2. Digitar `[[` e escolher `[[public_reference_url]]` para o corpo do alerta; confirmar que `{{#is_alert}}` continua literal até chegar ao Datadog.
3. Confirmar página pública sem BTG e com fila/cluster no topo.
4. No Datadog Trial, alterar manualmente a mensagem de um monitor já gerenciado. Executar **Reconciliação Datadog**; conferir que a mensagem volta ao padrão e que `updated` cresce.
5. Remover um monitor de teste diretamente no Trial. Executar reconciliação e confirmar novo ID gravado em `generated_monitors`.
6. Tentar iniciar uma segunda reconciliação enquanto a primeira está rodando: deve responder HTTP 409.
7. Confirmar que um monitor sem vínculo, embora marcado `managed_by`, aparece na contagem de remotos sem vínculo e não é removido.

Não foram executados builds Docker nem chamadas ao Datadog Trial neste ambiente de geração. Testes locais de sintaxe, estrutura dos manifestos e substituição de placeholders foram realizados.
