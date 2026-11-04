# Hotfix v0.5.6.1 — Queue com tela branca

## Erro
`ReferenceError: Cannot access 'we' before initialization` ao abrir uma queue com template aplicado.

## Causa
Em `frontend/src/pages/QueuesPage.tsx`, `pendingTemplates` executava `draftChange()` antes da inicialização de `metadataChanged` (Temporal Dead Zone de `const`).

## Correção
Mover `metadataChanged` e `readOnly` para antes da função `draftChange`.

## Aplicar no Docker Compose local
Substitua `frontend/src/pages/QueuesPage.tsx` pelo arquivo do patch.
No PowerShell, na raiz do repositório:

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml up -d --build --no-deps rabbitmq-monitor-frontend
```

Depois force atualização do navegador com Ctrl+Shift+R. Não apague filas, dados, volumes, monitores nem rode discovery.

## EKS
Quando for publicar, basta rebuild e rollout da imagem Frontend (`ImageName1`). Backend, Dockerfile e manifestos não mudam.

## Revisão necessária
O status é independente do erro React. Investigue no MySQL a coluna `last_error` em `datadog_sync_queue` juntando `rabbitmq_queues` por `queue_id`. Não apague a queue para tentar limpar um status de sync.
