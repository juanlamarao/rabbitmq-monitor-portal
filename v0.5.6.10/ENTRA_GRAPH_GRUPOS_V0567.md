# v0.5.6.7 — Consulta de grupos por Microsoft Graph

A versão passa a consultar `POST /v1.0/me/checkMemberGroups` durante o login e a revalidar a associação quando o cache expira (300s) ou uma associação do portal muda. Grupos são consultados em lotes de até 20 Object IDs. A consulta aceita `User.Read` delegado para o próprio usuário, inclusive grupos aninhados. Não necessita Group Claims nem Optional Claims.

## Segurança
- Não há alteração no LDAP desta versão.
- Microsoft access/refresh tokens nunca são enviados ao browser. O refresh token fica criptografado na sessão do Redis (chave Fernet de `CREDENTIAL_ENCRYPTION_KEY`, quando configurada; senão derivada do client secret do Entra).
- A aplicação solicita `offline_access` para atualizar as permissões durante a sessão. Se o tenant impedir refresh tokens, o portal mantém leitura e bloqueia privilégios baseados em grupos após a expiração da verificação até novo login.
- Qualquer erro Graph na validação impede privilégios elevados; administradores locais de emergência permanecem independentes.
- Alterações administrativas nas associações invalidam as verificações via revisão no Redis.
- `ENTRA_GROUPS_SOURCE=token` permite compatibilidade temporária com o método antigo; o padrão é `graph`.
- Para restringir `App Role Portal.Admin` de modo estrito ao Graph, o backend também bloqueia admin se a verificação Graph falhar.

## Configuração
````env
ENTRA_GROUPS_SOURCE=graph
ENTRA_GRAPH_SCOPES=User.Read
ENTRA_GROUPS_CACHE_TTL=300
````

Requer `User.Read` delegado com consentimento válido no App Registration. O portal só consulta os Object IDs previamente cadastrados em Administração > Permissões de Acesso. O acesso de leitura continua definido pelo acesso permitido à Enterprise Application.

## Testes
1. Autentique uma conta autorizada sem grupos: leitura, sem edição.
2. Associe seu Object ID de grupo a um cluster e confirme Edit apenas nele.
3. Teste um grupo Admin: acesso global.
4. Remova/desative associação: privilégios devem ser retirados na próxima requisição após revisão.
5. Induza falha 401/403/timeout do Graph: após expiração da verificação não deve haver Edit/Admin.
6. Teste mais de 20 grupos e grupos aninhados.
7. Valide diagnóstico em Administração > Permissões de Acesso.

Observação: chamadas Graph não podem ser validadas end-to-end sem credenciais reais do tenant.
