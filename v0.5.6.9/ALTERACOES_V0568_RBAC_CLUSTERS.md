# v0.5.6.8 — separação de permissões de filas e clusters

- **Editor** (grupo associado a clusters no portal): pode alterar somente recursos de fila no(s) cluster(s) associado(s), incluindo metadados e aplicação de templates já permitida pela API `/components/queues/{id}`. Não pode editar configurações do cluster, criar clusters, testar conexão nem disparar discovery manual pelo endpoint de cluster.
- **Observability** (grupo configurado em `ENTRA_OBSERVABILITY_GROUP_ID`, ou App Role `ENTRA_OBSERVABILITY_APP_ROLE`): pode criar e editar configurações de qualquer cluster, executar teste de conexão e discovery, e visualizar as demais páginas. Não recebe automaticamente permissões Admin para grupos de acesso, jobs ou configurações globais, nem edição das filas de todos os clusters. Para editar filas, precisa também de vínculo Editor (ou Admin).
- **Admin**: permanece com todas as permissões.
- **Viewer**: somente leitura.

## Configuração

Informar o **Object ID GUID** do grupo corporativo Observability na variável `ENTRA_OBSERVABILITY_GROUP_ID` do backend. Há campos opcionais nos manifests DEV, UAT e PROD (vazios por padrão). `ENTRA_OBSERVABILITY_APP_ROLE=Portal.Observability` também é aceito caso o app role já exista e seja emitido pelo Entra ID; ele não é requisito.

O grupo Observability é incluído na consulta Microsoft Graph `checkMemberGroups` (não requer Group Claims). Após configurar ou modificar o Object ID, reiniciar o backend e refazer login; se necessário, esperar até o TTL de revalidação. Não colocar o Object ID de um grupo Editor nesse campo.

## Segurança

A restrição é aplicada no middleware do backend às requisições de escrita em `/clusters`, além da interface. Respostas não autorizadas: HTTP 403. O fluxo LDAP não foi modificado. Não há mudança de schema MySQL nem de tabela existente.

## Testes sugeridos

1. Editor associado ao cluster A: pode editar fila de A; não pode editar fila de B; `PUT /clusters/A` retorna HTTP 403; não vê botões de alteração no cadastro de clusters.
2. Observability: pode criar/alterar cluster, testar conexão e disparar discovery; não pode modificar configuração administrativa global; não pode editar filas sem vínculo Editor.
3. Admin: todas as ações anteriores funcionam.
4. Viewer: apenas leitura; escrita retorna 403.
5. Sem consulta Graph validada: Editor e Observability baseados em grupos não recebem privilégios.
