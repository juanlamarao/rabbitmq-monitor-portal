# Monitor Portal · Visual v1 — Implantação no EKS Dev

## O que foi implementado

- Interface **BTG Light** (branco e azul), sidebar Corporate e Workspace por cards.
- Nome visível **Monitor Portal**; rodapé discreto **Observability Platform**.
- SSO **sempre visível** no login, mesmo antes de configurar o Enterprise App; link `admin` discreto para o login local.
- Fundo do login com partículas suaves, respeitando `prefers-reduced-motion`.
- Logo BTG opcional no login e cabeçalho: `frontend/public/branding/btg-logo.svg` (adicionar arquivo OFICIAL, fornecido pela empresa).
- Favicon `R` branco no quadrado azul-marinho: `frontend/public/favicon.svg`.
- **Administração > Aparência**: Corporate/Workspace e partículas, configuração única global gravada no MySQL.
- **Dashboard** com contagem agregada real: clusters, queues não removidas, monitores `synced`, monitores que precisam de revisão (`error`, `not_found`, `out_of_sync`, `orphaned`), clusters recentes e 5 eventos de auditoria.
- No Dashboard, o indicador de cluster ativo é **status cadastral**, não teste ao vivo de conectividade.

## Segurança e compatibilidade

- Mantidos login, SSO, permissões de cluster e auditoria existentes.
- Apenas usuários Admin podem atualizar `/ui/settings` (middleware + CSRF). O `GET /ui/settings` é público para carregar o estilo na tela de login, mas não contém segredos.
- Alteração de aparência registrada em `audit_logs` com o ator autenticado.
- Sem ConfigMaps, Secrets ou HTTPS dentro do YAML; HTTPS externo ao EKS permanece como antes.
- Build pipeline: `Dockerfile_frontend` -> `ImageName1`, `Dockerfile_Backend` -> `ImageName2`, build context `.`.
- Dev preserva os NLBs internos de MySQL e Redis existentes; UAT/Prod não criam novos LB de dados por segurança.
- `LDAP_TLS_VERIFY` é mantido nos manifestos com placeholder `__RBTMQ_PORTAL_LDAP_TLS_VERIFY__`: valor `false` **somente em Dev, de forma temporária**; `true` em UAT/Prod.
- A versão usa como base a `0.5.5_minorFix` disponibilizada nesta conversa e inclui o `client.py` corrigido na última etapa; outras modificações não compartilhadas do repositório corporativo precisam ser mescladas via diff.

## 1. Aplicar migração aditiva SQL 008 ANTES das novas imagens

Não apague PVCs. A migração não exclui dados, clusters, queues nem monitores.

```bash
NS=rabbitmq-monitor-dev
kubectl -n "$NS" exec rabbitmq-monitor-mysql-0 -c mysql -- \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction rabbitmq_monitor_portal' \
  > mysql-backup-before-visual-v1.sql

kubectl -n "$NS" exec -i rabbitmq-monitor-mysql-0 -c mysql -- \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot rabbitmq_monitor_portal' \
  < infra/mysql/upgrade/008_v0_5_5_visual_v1.sql

kubectl -n "$NS" exec rabbitmq-monitor-mysql-0 -c mysql -- \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot rabbitmq_monitor_portal -e "SELECT * FROM portal_ui_settings;"'
```

Atenção: o SQL embutido no StatefulSet MySQL só é executado na criação do banco com **PVC vazio**. O manifesto do StatefulSet foi intencionalmente preservado para não reiniciar o banco por uma mudança exclusivamente visual. Mesmo em um **novo ambiente EKS**, execute SQL 008 após o banco ficar disponível e antes de liberar a nova API.

## 2. Adicionar logo BTG (opcional)

Obtenha o SVG oficial autorizado e salve exatamente como:

```
frontend/public/branding/btg-logo.svg
```

O nome do arquivo é estático e carregado tanto na tela de login quanto no cabeçalho. Se não estiver presente, aparece a identificação tipográfica `BTG` em azul (ou branco conforme o contexto). A logo entra no **build** do frontend, pois `Dockerfile_frontend` copia `frontend/public` para o Vite. É necessário rebuild da imagem Frontend para adicionar/trocar o arquivo.

## 3. Rebuild e deploy pela pipeline

Execute os builds de `ImageName1` e `ImageName2` usando os Dockerfiles na raiz. Mantenha substituição de placeholders `__RBTMQ_PORTAL_*__`. Reaplique `kubernetes.dev.yaml` pelo template corporativo. Recomendado publicar tags novas para as imagens.

## 4. Smoke tests em Dev

- `GET https://<host>/api/health` retorna `200`.
- `GET https://<host>/api/openapi.json` informa `0.5.5-visual-v1`.
- `GET https://<host>/api/ui/settings` retorna `{"layout":"corporate","theme":"btg_light","login_particles":true,...}`.
- Sem login, portal exibe o botão SSO e link `admin` discreto.
- Admin local abre Administração > Aparência e muda Workspace; Dashboard permanece acessível pelo menu.
- Viewer não consegue editar aparência (`403` com sessão válida).
- Alterar aparência aparece em Audit Logs com o usuário da operação.
- `GET /api/dashboard/overview` autenticado retorna contagens agregadas.
- `GET /api/auth/me` antes de login retorna `401`.
- Reiniciar frontend/API não deve resetar o layout (configuração persiste no MySQL).

## Limitações de validação neste pacote

Sintaxe Python, parsing TS/TSX e YAML foram conferidos. O build real `npm run build`, os endpoints com banco real, a aplicação do SQL 008 e o deploy EKS **não foram executados nesta sessão**. As dependências npm não estavam disponíveis no ambiente local de validação.
