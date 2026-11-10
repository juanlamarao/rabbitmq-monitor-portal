# RabbitMQ Monitor Portal v0.5.6.9 — Acionamentos por fila e Webhooks Datadog

Base: v0.5.6.8. Não altera o ajuste LDAP nem o RBAC Entra/Graph.

## Preparação (obrigatória em DEV/UAT/PROD)

1. Fazer backup do banco.
2. Executar **uma vez** `infra/mysql/upgrade/014_v0_5_6_9_webhook_actions.sql` no MySQL de CADA ambiente **antes de atualizar os containers**. O init SQL foi atualizado somente para bancos novos. A atualização de código não executa migração sobre bancos existentes.
3. Subir a mesma stack, mesmos Dockerfiles (`Dockerfile_frontend`, `Dockerfile_Backend`) e manifests EKS existentes.
4. Administração → Webhooks: preencher **Name, URL, Payload e Custom headers** dos três templates. Todos começam com URLs vazias porque não foram fornecidos endpoints reais. Com URL vazia não é possível criar uma integração remota funcional.
5. Confirmar na Datadog API/Application Key o conjunto de permissões: `integrations_read` (GET), `create_webhooks` (POST), `manage_integrations` (PUT). O acesso pré-existente aos monitores também é necessário para atualizar notificações.
6. Clicar **Sincronizar** e observar o progresso; a partir daí as configurações são conferidas diariamente a cada 86400 segundos pelo scheduler (variável `WEBHOOK_RECONCILE_INTERVAL_SECONDS`).
7. Habilitar acionamentos nas filas. SRE OPS/CCBP exigem Jornada, Serviço, Owner e Descrição; VICCI exige e-mail válido. Verificar o status da fila Datadog, a mensagem gerada e as duas tags quando VICCI estiver habilitado.

## Comportamento

- Três templates globais em `datadog_webhook_templates`: SRE OPS, CCBP, VICCI. Uma mesma configuração se aplica a todas as orgs; MySQL é a fonte da verdade.
- Novo cadastro/edição de org dispara uma reconciliação assíncrona. Um ciclo já em andamento coalesce solicitações adicionais e inicia outro ciclo ao terminar.
- A validação é somente leitura (3 GETs por org). A sincronização compara e cria (POST) ou repara diferenças (PUT), verificando a resposta com novo GET. 404 é **missing**; erros de autenticação/rede não são interpretados como ausências.
- O painel possui os indicadores Total, OK, Parcial, Não OK; ícones por integração clicáveis com diagnóstico e validação/sincronização da org; tabela com URLs de org.
- Se mudar **Name**, os monitores de filas que usam o acionamento são enfileirados para atualizar as menções `@webhook-NAME`. Se mudar apenas URL/Payload/Headers, monitores não são modificados. Ao configurar uma URL pela primeira vez (ou removê-la), os monitores afetados também são atualizados.
- O nome anterior do webhook **não é excluído automaticamente**: outras aplicações/monitores externos podem estar utilizando-o. O novo nome é criado em todas as orgs e os monitores gerenciados são atualizados; a remoção do nome antigo exige verificação manual de dependências.
- O marcador padrão `[[acionamentos]]` é configurável por template (`datadog_actions_placeholder`) e pode ser movido para qualquer posição da mensagem. Ex.: dentro de `{{#is_alert}}` para não acionar na recuperação. Templates legados sem marcador têm fallback somente para o bloco de alertas.
- Fila com VICCI gera `vicci_notify_user:<parte anterior ao @>` e `vicci_notify_domain:<parte posterior ao @>`. Sem VICCI não gera essas tags.
- As configurações globais de webhook são visíveis apenas ao Admin. Editor continua limitado às filas dos clusters autorizados; edição de cluster continua somente Admin/Observability.
- O portal criptografa novos Payloads e Custom headers no MySQL usando a `CREDENTIAL_ENCRYPTION_KEY` já existente, e **não** os copia para logs de auditoria. Os defaults SQL `{}` legados seguem legíveis. A URL é armazenada em claro: evite segredos em query strings e restrinja acesso ao banco, backups e interface.

## Limites e precauções

- A existência real de um **grupo VICCI no serviço destinatário** não pode ser validada sem informações da API desse sistema. O portal valida o e-mail e a configuração do webhook Datadog, mas o funcionamento end-to-end do acionamento VICCI precisa ser testado com o sistema VICCI.
- Configuração de URLs vazias fica `unconfigured`; não são adicionadas menções a webhooks sem URL para evitar notificações sem destinatário. Complete os três templates antes de utilizar os toggles.
- O dashboard considera também organizações inativas nos indicadores (a sincronização automática opera apenas sobre organizações ativas).
- O job compartilha o worker RQ existente, sem criar serviços novos. Evite múltiplas validações concorrentes: solicitações são agrupadas enquanto um ciclo está em andamento.
- O status remoto `OK` valida igualdade da configuração, mas **não garante entrega real das notificações**: confirme com um monitor de teste no Datadog e o sistema receptor.

## Novas rotas Admin

- `GET /admin/webhooks/templates`
- `PUT /admin/webhooks/templates/{sre_ops|ccbp|vicci}`
- `GET /admin/webhooks/dashboard`
- `POST /admin/webhooks/validate`
- `POST /admin/webhooks/reconcile`
- `POST /admin/webhooks/orgs/{org_id}/validate`
- `POST /admin/webhooks/orgs/{org_id}/reconcile`
- `GET /admin/webhooks/runs/latest`
- `GET /admin/webhooks/runs/{run_id}`

## Banco de dados

Colunas novas `rabbitmq_queues`: `notify_sre_ops`, `notify_ccbp`, `notify_vicci`, `vicci_email`.

Coluna nova `monitor_templates`: `datadog_actions_placeholder`.

Tabelas novas: `datadog_webhook_templates`, `datadog_webhook_org_states`.

Não há `DROP`, nem alteração de dados legados. Fila existente começa com os três acionamentos desligados.
