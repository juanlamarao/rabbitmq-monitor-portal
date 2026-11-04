# Monitor Portal v0.5.6.6 — Correções de layout, RBAC, métricas e paginação

## 1. Upgrade banco de dados existente (sem perda de dados)

- Antes de publicar imagens, faça **backup lógico e teste a restauração**.
- Para uma base **já em v0.5.6.5**, execute **uma única vez** `infra/mysql/upgrade/013_v0_5_6_6_cluster_metrics_and_queue_index.sql` no MySQL DEV.
- Para uma base corporativa em **v0.5.4 sem 007-012**, execute uma única vez `UPGRADE_V054_PARA_V0566.sql` após checar as tabelas. **NÃO aplique novamente 007-012 se já foram executados**.
- 013 adiciona `rabbitmq_clusters.connection_type`, `rabbitmq_clusters.metrics_endpoints` e índice `ix_queues_cluster_removed_vhost_name` em `rabbitmq_queues`.
- O script não contém `DROP`, `TRUNCATE` nem remoção de linhas. `ALTER TABLE` e `CREATE INDEX` podem causar bloqueios e carga de I/O; programe uma janela de manutenção se a tabela for grande.
- O MySQL é persistente; não execute `docker compose down -v`, nem delete StatefulSets/PVCs.

Consultas de pré-verificação:

```sql
SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rabbitmq_clusters'
  AND COLUMN_NAME IN ('connection_type', 'metrics_endpoints');
SHOW INDEX FROM rabbitmq_queues WHERE Key_name='ix_queues_cluster_removed_vhost_name';
SELECT COUNT(*) AS total_queues FROM rabbitmq_queues;
SELECT COUNT(*) AS total_clusters FROM rabbitmq_clusters;
```

## 2. Deploy local (após o SQL)

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml config --quiet
docker compose --env-file .env.local -f docker-compose.local.yml up -d --build --no-deps rabbitmq-monitor-api rabbitmq-monitor-worker rabbitmq-monitor-scheduler rabbitmq-monitor-sync-dispatcher rabbitmq-monitor-reconciler rabbitmq-monitor-frontend
docker compose --env-file .env.local -f docker-compose.local.yml ps
```

Não alterar `CREDENTIAL_ENCRYPTION_KEY`. No EKS, publicar `ImageName1` (frontend) e `ImageName2` (Backend/Worker/Scheduler/Dispatcher/Reconciler) após a migração, aplicar os manifestos já atualizados Dev/UAT/Prod. Nenhum workload foi renomeado.

## 3. Formulários e navegação responsiva

O componente `frontend/src/components/PortalGrid.tsx` substitui MUI Grid legado onde ainda era usado. Layout baseado em `CSS Grid` com colunas de 12 unidades e `gap`, sem margens negativas nem padding aplicado a cada item. Inclui formulários de clusters, queues, templates, jobs, grupos SRE, aparência e órgãos Datadog.

Na tela estreita (`<=750px`), o Drawer é temporário e abre pelo ícone na barra superior, sem reservar área lateral. Tabelas com conteúdo largo rolam **dentro do card**, não pelo corpo da página. Validar larguras de 360, 768, 1024 e desktop com menu expandido/recolhido.

## 4. Paginação (20 filas por página)

`GET /api/components/queues/page?cluster_id=ID&page=1&page_size=20` retorna `{items,total,page,page_size,total_pages}`. Os filtros e a contagem são executados no banco **antes** da hidratação ORM (somente até 20 filas/templates/ticket por vez). O frontend consulta um único cluster (primeiro em ordem alfabética se nenhum selecionado), pesquisa com debounce de 350 ms e atualiza a cada 30 segundos enquanto o diálogo está fechado.

O endpoint legado `/api/components/queues` permanece para compatibilidade, mas a página Queues não o utiliza mais. Para >100 mil filas, a navegação é leve, porém `LIKE '%texto%'`, contagens frequentes, discovery em massa, relatórios globais e reconciliação ainda demandam melhorias específicas (índices de pesquisa/FTS, cursor, processamento por batches, caching e benchmarks). **Não há benchmark real de 100k filas neste pacote.**

## 5. Entra ID — roles x grupos

A role `Portal.Read` autoriza leitura do Portal; `Portal.Admin` é administração. Para editar um cluster, o grupo Entra precisa aparecer na claim `groups` e o Object ID dele precisa estar vinculado ao cluster em Administração > Permissões de Acesso. A app role `Portal.Read` **não** concede edição. Não é necessária uma app role por cluster; novos clusters são criados pelo administrador, que atualiza o vínculo com grupos existentes. Atribuição de grupos a enterprise applications não inclui associações de grupos aninhados.

Verifique `/api/auth/me`: `entra_groups_count` indica a quantidade de grupos no ID Token e `groups_overage` indica que o token não contém todos os grupos. Se `groups_overage=true`, o Portal continua negando edição até haver configuração de claim ou obtenção autorizada de grupos. Após alterar a associação no Entra, logout/login para renovar token/sessão. O portal mantém RBAC no backend, não apenas botões ocultos.

## 6. Prometheus /metrics para RabbitMQ

Na edição/criação do cluster selecione **Prometheus /metrics (15692)** e informe o DNS e porta 15692. Endpoints adicionais podem ser configurados um por linha (por exemplo `http://rabbit-01:15692`, `http://rabbit-02:15692`) para coletar de todos os nós; usuário/senha são opcionais. O backend chama `/metrics/detailed?family=queue_coarse_metrics&family=queue_delivery_metrics` e identifica queues a partir dos labels `vhost` e `queue`.

**Limitação:** Prometheus não é substituto integral da Management API. Não contém tipo, durabilidade, `auto_delete`, `exclusive` nem garante inventário de todas as filas quando faltam séries ou nós. No modo metrics o discovery **não declara filas removidas**. A Management API continua sendo a opção de inventário completo quando permissões permitem. Monitores Datadog continuam API-based e são independentes do perfil de discovery.

## 7. Filas temporárias

Em Management API, são temporárias as filas `exclusive=true`, `auto_delete=true`, que comecem com `amq.gen-` ou `amq.rabbitmq.reply-to`, ou que atendam às regexes definidas no cluster. No modo Prometheus valem prefixos e regexes, pois `exclusive` e `auto_delete` não estão disponíveis. Backend impede edição manual, aplicação/alteração de templates e edição em massa. Planner/reconciler ignoram filas temporárias, dispatcher bloqueia alterações existentes em andamento.

**Sem exclusão remota automática:** se uma fila que já possuía monitor tornar-se temporária, revise o monitor anterior manualmente no Datadog. Não se apagam monitores por inferência de métricas incompletas.

## 8. Fotos de usuário Entra

No callback OAuth2 a API consulta `/v1.0/me/photos/48x48/$value` usando o token Graph delegado já recebido com `User.Read`. A miniatura é guardada apenas na sessão Redis como data URI limitada a 150 KB. O token Microsoft não é salvo nem enviado ao navegador. Se o Graph retornar 403/404/timeout, o avatar circular continua mostrando as iniciais. Logue novamente após atualizar permissões/consentimento.

## 9. Validação

- Python: compilação sintática de backend.
- Frontend: 36 arquivos TS/TSX analisados sintaticamente com TypeScript.
- ORM / SQL: teste de paginação com SQLite simulado: 53 filas em 20/20/13, serialização Pydantic.
- Prometheus: teste de parsing de séries `rabbitmq_detailed_queue_*`.
- Kubernetes: Dev, UAT e Prod carregados com PyYAML.
- **Não executados:** build frontend completo (`node_modules` ausente), imagens Docker, autenticação ao Entra corporativo, coleta Prometheus real e testes EKS.
