# Monitor Portal — Visual v1.1 (ajustes UX da v0.5.5)

Base: `monitor-portal-v0.5.5-visual-v1-completo.zip`. Correções de navegação, cabeçalho e login solicitadas após o deploy no EKS Dev.

## Arquivos modificados (somente frontend)

| Caminho | Alteração |
|---|---|
| `frontend/src/components/AppLayout.tsx` | Administração passa a navegar para `/admin` ao clicar; submenu contém `Visão geral`; sidebar não exibe símbolo R nem avatar no rodapé; hamburger e ícones usam a mesma grade/alinhamento; perfil sai do rodapé e vira botão com avatar, nome e função na barra superior; menu de perfil inclui nome centralizado, chip azul de função e `Sign Out`. |
| `frontend/src/pages/LoginPage.tsx` | Logo BTG centralizada, sem letra R e sem fallback textual BTG; título `RabbitMQ Monitor Portal`; nova descrição; link discreto `Entrar com usuário local`; mantém botão SSO sempre visível e partículas. |
| `frontend/src/components/BrandIdentity.tsx` | Logo passa a aceitar `hideTextFallback` para não mostrar texto provisório BTG no login. Preserva demais exports por compatibilidade. |
| `frontend/src/services/auth.ts` | Inclui campo opcional `avatar_url`, preparado para futura foto de perfil proveniente de integração autenticada. |
| `frontend/public/branding/README.md` | Instrução atualizada para colocar a logo BTG oficial em `frontend/public/branding/btg-logo.svg`. |

## Arquivos não modificados

- Backend FastAPI, Workers, Scheduler, LDAP, Datadog, permissões e banco de dados.
- Dockerfiles e `requirements.txt`.
- `kubernetes.dev.yaml`, `kubernetes.uat.yaml`, `kubernetes.prod.yaml`.
- Migrações SQL 007 e 008, StatefulSets e PVCs.
- `frontend/public/favicon.svg` (ícone R mantido no navegador).

## Como atualizar no EKS Dev

1. Aplicar os arquivos modificados ao repositório de código.
2. Adicionar a logo BTG oficial em `frontend/public/branding/btg-logo.svg` quando estiver disponível.
3. Executar o build/push da imagem `ImageName1` pelo Azure DevOps (o Dockerfile_frontend não muda).
4. Executar o deploy usual da imagem Frontend atualizada, com nova tag para evitar cache da imagem.
5. Atualizar o navegador (Ctrl+F5 se necessário) e conferir as telas.

A imagem Backend `ImageName2` não precisa de rebuild. Nenhum SQL ou alteração de YAML é necessário.

## Testes sugeridos

- Clicar em **Administração** e confirmar navegação para a tela geral com **Cache LDAP/AD**.
- Abrir e fechar o menu lateral; o ícone hambúrguer deve permanecer alinhado com a coluna dos demais ícones.
- Passar o mouse sobre os botões com o menu fechado: a sidebar não deve expandir sem clique.
- Conferir nome e função `Viewer`, `Editor` ou `Admin` no cabeçalho.
- Clicar no perfil e conferir o cartão com a função e `Sign Out`.
- Fazer logout e confirmar o botão **Entrar com SSO** e o link **Entrar com usuário local**.
- Depois de adicionar a logo, confirmar sua presença no login.

## Limites da validação

- Sintaxe/transpilação TypeScript verificada em 31 arquivos TS/TSX; fluxo e textos auditados estaticamente.
- Build completo `npm run build` não executado porque as dependências MUI/React npm não estão instaladas nesta sessão.
- Não testado no EKS real nem com o Entra ID (ainda pendente no ambiente).
