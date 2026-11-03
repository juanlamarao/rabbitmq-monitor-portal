> **ATENÇÃO — Versão v0.5.5_minorFix:** o manifesto e os tokens de Library estão atualizados; siga o capítulo «Atualização v0.5.5_minorFix» ao final deste guia para deploy.

# RabbitMQ Monitor Portal v0.5.5 — Kubernetes EKS e Entra ID

## Configuração Entra

1. Criar App Registration Web / OIDC Confidential Client, single-tenant.
2. Reply URL: `https://HOST_PUBLICO/api/auth/entra/callback` (Type **Web**, nunca SPA).
3. Permissões delegadas: `openid`, `profile`, `email` (OIDC) e `User.Read` (Graph); declarar `User.Read` como solicitado.
4. Em Enterprise Application: **Assignment required = Yes**. Atribuir os usuários/grupos autorizados a entrar.
5. Token configuration: claim `groups` com **Object ID**, preferencialmente *Groups assigned to the application* para reduzir overage.
6. Criar App Role `Portal.Admin` (Allowed member types: Users/Groups), atribuir grupo de administradores; ou associar o Object ID do grupo admin no portal com o admin local.
7. Configurar as variáveis via Azure DevOps Library (`AZURE_DEVOPS_AUTH_VARIABLES.env.example`).
8. Em `Administração > Permissões de Acesso`, cadastrar o **Object ID** e os clusters editáveis. Todos os membros atribuídos ao app são viewers globais.

**App Roles e groups são lidos separadamente.** `roles` com `Portal.Admin` libera administração; `groups` mapeia edição dos clusters. O próprio grupo admin também pode ser associado no portal por Object ID.

Sem grupo de edição, usuário autenticado permanece somente Viewer. Em caso de group overage, a autenticação continua com permissão somente leitura (salvo App Role Admin explícita); permissões de edição baseadas em grupos são negadas até o Entra emitir grupos completos. Future fallback via Microsoft Graph requer configuração complementar.

## AD corporativo / Redis

- LDAP real via `LDAP_HOST`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD`, `LDAP_SEARCH_BASE`, `LDAP_USE_SSL` ou `LDAP_START_TLS`.
- Filtro LDAP: `(&(objectClass=user)(objectCategory=person))`.
- Atributos no cache: `sAMAccountName` (`account_name`), `mail` (`email`), `name` (`full_name`); compatibilidade com first/last name para UI.
- Exclui atributos obrigatórios vazios; usernames contendo `svc_` ou `-adm` (case-insensitive).
- `LDAP_REQUIRE_ORG_UNIT=true` exclui se `division` E `department` estão vazios; pode mudar para `false` na Library.
- Cache é atualizado **na primeira execução do scheduler** e a cada 86400s. Forçar pela tela Administração (admin).
- Consulta LDAP paginada (500 entradas por página); endpoints autocomplete consultam apenas Redis.
- OpenLDAP local foi excluído do manifesto EKS. O Compose local pode manter OpenLDAP para testes anteriores, mas não será usado no EKS.

## Admin local

Use um hash Argon2id (a senha em texto não deve entrar na Library):

```bash
python -c 'from argon2 import PasswordHasher; import getpass; print(PasswordHasher().hash(getpass.getpass("Senha forte: ")))' 
```

Cadastre em `LOCAL_ADMIN_PASSWORD_HASH` e habilite `LOCAL_ADMIN_ENABLED=true` para ativar a opção de emergência. Restrinja rota e monitore acessos; existe rate limit no Redis. **Não usamos uma senha default conhecida**.

## SQL para banco já em uso

Antes de subir o backend v0.5.5, execute somente o script aditivo:

```bash
kubectl -n rabbitmq-monitor-dev exec -i rabbitmq-monitor-mysql-0 -c mysql -- \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot rabbitmq_monitor_portal' \
  < infra/mysql/upgrade/007_v0_5_5_entra_auth.sql
```

O bootstrap do MySQL em volumes vazios também inclui as três novas tabelas. **Não executar `down -v`, não apagar PVC nem Redis**.

## Build e deploy Azure DevOps

Os Dockerfiles permanecem **Dockerfile_Backend** e **Dockerfile_frontend**. A imagem Backend (API/Worker/Scheduler) deve ser reconstruída devido às dependências PyJWT/Argon2.

O YAML único continua `kubernetes.dev.yaml`, usando env direto com placeholders da Library (sem ConfigMaps, Secrets ou recursos TLS). O EKS termina TLS externamente. HTTPS no endereço público é obrigatório para o callback do Entra.

O manifesto retira OpenLDAP, mas `kubectl apply` **não remove workloads antigos** automaticamente. Para encerrar o OpenLDAP de Dev, execute após verificar que não precisa dele:

```bash
kubectl -n rabbitmq-monitor-dev delete statefulset rabbitmq-monitor-ldap --ignore-not-found
kubectl -n rabbitmq-monitor-dev delete service rabbitmq-monitor-ldap --ignore-not-found
```

Isso não deve apagar os PVCs LDAP; não é necessário apagá-los. O deployment do scheduler mantém a contagem de réplicas anterior. Para cache diário, habilite uma única instância do scheduler quando tiver validado os jobs automáticos e o Datadog.

## Segurança e auditoria

- Login Entra pelo backend (Auth Code + PKCE, `state`/`nonce`), cookies HttpOnly/Secure e sessões Redis com CSRF.
- Middleware aplica RBAC server-side; apenas Admin pode gerenciar catálogo, Datadog, Jobs, grupos e relatórios.
- Viewer acessa Dashboard, Clusters, Queues e Audit Logs; Editor também altera os clusters designados.
- Logs de alterações manuais usam e-mail do usuário autenticado; jobs gravam `requested_by` no histórico.
- A rota pública `/public/queue-reference` permanece aberta, inclusive sem login. **Revisar exposição dos e-mails de responsáveis** antes de liberar o Ingress publicamente.
- Variáveis de senha dentro de YAML gerado são visíveis para administradores Kubernetes. O ambiente Dev segue esse padrão por decisão prévia; em produção, use Secret/External Secrets.

## Smoke tests

- Sem cookie, `GET /api/clusters` responde 401; `GET /api/public/queue-reference` não exige sessão.
- Viewer: lista clusters/queues/audit; `POST /api/templates` retorna 403.
- Editor: atualização de queue pertencente a cluster autorizado passa, outra retorna 403.
- Admin: `GET /api/access/groups`, cadastra associação grupo-cluster.
- Testar logout, expiração Redis e login local de emergência.
- `GET /api/auth/me` retorna perfil e clusters editáveis; **não** deve ser cacheado por proxy.

## Atualização automática de diretório

A API faz **warm-up** do cache Redis na primeira inicialização, sem bloquear o readiness. O `CronJob rabbitmq-monitor-directory-refresh` executa uma sincronização diária às **03:00 no fuso America/Sao_Paulo**, independentemente do Deployment Scheduler estar com `replicas: 0`. Se um scheduler também estiver ativo, o lock Redis evita refresh simultâneo. Para executar antes do horário, use o botão de administração.

**LDAP TLS:** O cliente valida o certificado do servidor quando usa LDAPS ou StartTLS. Caso o AD utilize uma autoridade certificadora privada, instale a cadeia CA corporativa confiável na imagem Backend antes de liberar o bind. Não desative a validação de certificados.


## Atualização v0.5.5_minorFix

A partir desta revisão, os manifestos são `kubernetes.dev.yaml`, `kubernetes.uat.yaml` e `kubernetes.prod.yaml`. A Library deve substituir `__RBTMQ_PORTAL_*__` e o template de imagens deve substituir `ImageName1` (frontend) e `ImageName2` (backend) sem aspas. Para a execução segura da migração 007 no Dev existente, siga [`MIGRACAO_SQL_007_DEV.md`](MIGRACAO_SQL_007_DEV.md). **Não execute migração nem deploy UAT/PROD ainda.**
