# Monitor Portal v0.5.6 — ambiente local para Windows/Docker Desktop

**Escopo:** desenvolvimento local, com os mesmos componentes da arquitetura EKS. Os manifestos `kubernetes.dev.yaml`, `kubernetes.uat.yaml` e `kubernetes.prod.yaml` incluem o `sync-dispatcher` com a imagem `ImageName2`. Consulte `DEPLOY_EKS_V056.md`.

## 1. Pré-requisitos

- Docker Desktop com Docker Compose v2 e engine Linux/WSL2.
- Python 3.10+ no Windows, para criar uma senha hash Argon2 e chave Fernet.
- Acesso à internet para baixar as imagens e, opcionalmente, enviar métricas ao Datadog trial.
- Livre no Windows: 3000, 8000, 3307, 6380, 5672, 15672, 15692, 1389 e 1636.
- **Não use senha ou API Key do ambiente corporativo em desenvolvimento.**

## 2. Preparar as configurações

Abra PowerShell na raiz do projeto, onde está `docker-compose.local.yml`:

```powershell
py -m pip install argon2-cffi cryptography
py scripts/setup-local-env.py
```

O script pede uma senha de administrador local (mínimo 12 caracteres) e grava `.env.local` com `LOCAL_ADMIN_PASSWORD_HASH` (Argon2id) e uma `CREDENTIAL_ENCRYPTION_KEY` estável. Preserve este arquivo para não perder a capacidade de descriptografar as credenciais armazenadas.

Edite `.env.local` para substituir as senhas DEV de MySQL, RabbitMQ e LDAP. Não versione `.env.local`.

## 3. Iniciar a plataforma

**Padrão de nomes:** os serviços da aplicação no Compose agora se chamam `rabbitmq-monitor-api`, `rabbitmq-monitor-frontend`, `rabbitmq-monitor-worker`, `rabbitmq-monitor-scheduler` e `rabbitmq-monitor-sync-dispatcher`, como os workloads do EKS. O projeto continua `monitor-portal-local` e os volumes não mudaram. Os serviços de infraestrutura continuam `mysql`, `redis`, `ldap` e `rabbitmq`.

**Se você já subiu a v0.5.6 com os nomes antigos (`api`, `worker`, `frontend`...),** use o `--remove-orphans` do comando abaixo. Ele remove apenas os containers de aplicação antigos do mesmo projeto Compose; não remova volumes e **não execute `down -v`**. Verifique `docker compose ... config --services` antes de iniciar. Se mantém outros serviços personalizados no mesmo projeto Compose, confira os órfãos antes de usar essa opção.


```powershell
docker compose --env-file .env.local -f docker-compose.local.yml config --quiet
docker compose --env-file .env.local -f docker-compose.local.yml config --services
docker compose --env-file .env.local -f docker-compose.local.yml up -d --build --remove-orphans
docker compose --env-file .env.local -f docker-compose.local.yml ps
```

O primeiro start inicializa bancos persistentes em volumes Docker. O `rabbitmq-init` cria filas de demonstração e encerra com **Exited (0)**: é esperado.

| Serviço | URL / conexão local | Credenciais |
|---|---|---|
| Monitor Portal | http://localhost:3000 | Link **Entrar com usuário local**; senha do script |
| Swagger API | http://localhost:3000/api/docs | Sessão do portal |
| API health | http://localhost:3000/api/health | Não requer login |
| RabbitMQ Management | http://localhost:15672 | `RABBITMQ_USERNAME` / `RABBITMQ_PASSWORD` |
| RabbitMQ Prometheus | http://localhost:15692/metrics | Sem autenticação, **localhost somente** |
| MySQL DBeaver | `127.0.0.1:3307` | `MYSQL_USER` / `MYSQL_PASSWORD`; DB `rabbitmq_monitor_portal` |
| RedisInsight | `127.0.0.1:6380` | Sem senha; localhost somente |
| OpenLDAP | `127.0.0.1:1389` e LDAPS `127.0.0.1:1636` | `cn=admin,dc=example,dc=local` e `LDAP_ADMIN_PASSWORD` |

A integração local LDAP usa usuários de `infra/ldap/bootstrap/50-people.ldif`. Como o OpenLDAP usa `uid` e `cn` em vez dos atributos exclusivos do AD, ativamos `LDAP_DEMO_MODE=true` **somente no Compose local**. A API continua retornando `account_name`, `full_name`, `email` para a busca de pessoas. O login do portal é pelo administrador local; não há Entra neste ambiente.

## 4. Cadastrar RabbitMQ no portal

1. Entre pelo administrador local.
2. Em **Administração > Datadog Orgs**, edite/cadastre sua organização de trial com `api_url` e `org_url` da região Datadog. Para o site US1, `https://api.datadoghq.com` e `https://app.datadoghq.com`. Para EU, use os URLs da sua organização.
3. Em **Clusters > Novo**, configure:
   - Nome: `local-rabbitmq` (tag usada pelo Agent)
   - Ambiente: `development` (ou opção equivalente oferecida na tela)
   - Protocolo: `http`
   - DNS/Host: **`rabbitmq`** (hostname Docker, não `localhost`)
   - Porta API: **`15672`**
   - Usuário e senha: `RABBITMQ_USERNAME` / `RABBITMQ_PASSWORD`
   - Datadog Org: sua org trial
   - Integração Datadog: OpenMetrics/Prometheus (se houver opção de tipo), usando as tags abaixo
   - Tag cluster: `rabbitmq_cluster`, valor `local-rabbitmq`
   - Tag vhost: `vhost`; Tag queue: `queue`
   - Métrica de mensagens: `rabbitmq.queue.messages`; consumidores: `rabbitmq.queue.consumers`
4. Salve após o teste obrigatório de conexão e execute **Discover Queues** em Clusters.
5. Em **Queues**, aplique primeiro o template `queue_messages_above_threshold` em uma fila de teste, por exemplo `demo.orders.created`.

> O evento de aplicar o template já gera a intenção de sincronização no MySQL. **Não é necessário clicar em Sync**. O dispatcher usa a API da Datadog para criar/atualizar monitores.

Se alguma fila não tiver `datadog_org_id` via cluster, o enqueue não acontece. Vincule a org ao cluster e salve-o.

## 5. Conectar o RabbitMQ ao Datadog trial

**Duas autenticações distintas**:

- `DD_API_KEY` da org para o **Datadog Agent**, que publica métricas RabbitMQ.
- `API Key + Application Key` cadastradas na **Datadog Org do Portal**, que permitem ao FastAPI criar e atualizar monitores.

1. Coloque sua **API Key** do trial no campo `DD_API_KEY` em `.env.local`. Configure `DD_SITE` de acordo com a região (ex. `datadoghq.com`, `datadoghq.eu`).
2. Suba o Agent *somente depois* de preencher a chave:

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml --profile datadog up -d datadog-agent
docker compose --env-file .env.local -f docker-compose.local.yml logs --tail=100 datadog-agent
docker compose --env-file .env.local -f docker-compose.local.yml exec datadog-agent agent status
```

3. Procure o check **rabbitmq** em `agent status`. A integração utiliza o plugin **Prometheus** na porta `15692` e `unaggregated_endpoint` para métricas por fila. Espere alguns minutos e procure a métrica `rabbitmq.queue.messages` no Datadog Metrics Explorer, filtrando `rabbitmq_cluster:local-rabbitmq` e `queue:demo.orders.created`.
4. **Confirme as tags efetivas no Datadog**; conforme a versão do Agent e o endpoint, podem aparecer tags adicionais ou diferentes. Ajuste o mapeamento de tags por cluster no Portal antes de aplicar templates em larga escala.
5. Confira **Administração > Fila Datadog** (status e motivo do erro por fila). Para testes evite templates ainda não configurados com uma query Datadog válida.

Referência oficial: https://docs.datadoghq.com/integrations/rabbitmq/

## 6. Acompanhar a sincronização automática (v0.5.6)

- Uma mudança de template, overrides, metadados ou configuração de cluster registra uma revisão na tabela `datadog_sync_queue` dentro da mesma transação MySQL.
- `rabbitmq-monitor-sync-dispatcher` busca as pendências a cada 3 segundos e planeja **somente aquela queue**, criando/atualizando monitores dedicados no Datadog.
- Várias alterações seguidas na mesma queue são **coalescidas** na revisão mais nova.
- O painel **Administração > Fila Datadog** mostra estados e erro; **Queues** tem a coluna de estado com refresh de 5 segundos.
- `synced` = última revisão aplicada sem erro; `pending`, `running`, `retry` = trabalho em andamento; `error` e `blocked` exigem revisão.
- `not_configured` = nenhuma solicitação registrada; **não significa necessariamente que Datadog está igual**.
- Remoção/desativação de template que deixou monitor existente órfão entra em `blocked`; **a v0.5.6 não apaga monitores no Datadog automaticamente**.
- Falhas são tentadas com backoff até 8 vezes; novas alterações permitem retentar novamente.
- Auditoria continua registrando alterações e execuções automáticas. O Redis não é a fonte da verdade dessa fila; continua sendo usado para sessões, cache LDAP e jobs discovery.

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml logs -f rabbitmq-monitor-sync-dispatcher
docker compose --env-file .env.local -f docker-compose.local.yml logs -f rabbitmq-monitor-worker
```

Para consultar a fila direto no MySQL:

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml exec mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u "$MYSQL_USER" "$MYSQL_DATABASE" -e "SELECT queue_id,status,desired_revision,applied_revision,attempts,LEFT(last_error,180) AS error FROM datadog_sync_queue ORDER BY updated_at DESC LIMIT 30;"'
```

## 7. Parar, reiniciar e conservar os dados

```powershell
# Parar sem perder dados
docker compose --env-file .env.local -f docker-compose.local.yml down
# Reiniciar
docker compose --env-file .env.local -f docker-compose.local.yml up -d
```

**Não use `down -v`**: apagará os volumes locais de MySQL, Redis, RabbitMQ e LDAP. Não modifique `CREDENTIAL_ENCRYPTION_KEY` depois de cadastrar orgs e clusters.

## 8. Ambiente já existente / migração 009

Se você já tem um MySQL local com tabelas v0.5.5, faça backup e execute a migração aditiva:

```powershell
Get-Content -Raw infra/mysql/upgrade/009_v0_5_6_datadog_sync_queue.sql | docker compose --env-file .env.local -f docker-compose.local.yml exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -u root "$MYSQL_DATABASE"'
```

Em uma instalação totalmente nova, o arquivo `infra/mysql/init/001_schema.sql` já contém a tabela 009, e nenhuma migração manual é necessária.

## 9. Limitações desta primeira entrega

- O dispatcher publica no Datadog real, **sem dry-run automático**: use uma org de trial e somente filas/templates selecionados.
- Retentativas são **at least once**; se a criação remota ocorrer e o processo morrer antes de persistir o ID, há risco de duplicação. A etapa seguinte deve fazer reconciliação por tag/ID antes de novas criações.
- Ainda não há exclusão automática de monitores órfãos (intencionalmente).
- Não fizemos uma execução real dos containers neste ambiente de geração: é necessário validar o build da imagem, login, bootstrap LDAP e o check do Agent no Docker Desktop.
