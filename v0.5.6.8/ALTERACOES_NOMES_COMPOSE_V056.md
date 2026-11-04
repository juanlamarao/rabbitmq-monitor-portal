# v0.5.6 — Padronização dos nomes dos serviços locais

## Motivação

O Nginx do frontend resolve `rabbitmq-monitor-api:8000`. Na v0.5.6 anterior, o Compose nomeava o serviço como `api` e dependia de um alias. Agora os serviços da aplicação usam diretamente os mesmos nomes lógicos dos workloads EKS.

## Arquivos alterados

- `docker-compose.local.yml` — renomeados **somente os serviços de aplicação** e as referências `depends_on`; removido o alias de rede temporário; preservado `name: monitor-portal-local`, serviços de infraestrutura, portas, envs, imagens, volumes, comandos e healthchecks.
- `INSTALAR_LOCAL_V056.md` — comandos de log atualizados, orientação de migração sem apagar volumes e nomes de serviços padronizados.
- `DEPLOY_EKS_V056.md` — referência ao nome lógico do dispatcher local.
- `README.md` — destaque para o Compose local atual em contraste com o Compose histórico em `infra/`.

**Não houve alterações** em `kubernetes.dev.yaml`, `kubernetes.uat.yaml`, `kubernetes.prod.yaml`, `Dockerfile_Backend`, `Dockerfile_frontend`, `frontend/nginx.k8s.conf`, Python, React, SQL ou `.env.local`.

## Aplicar sobre instalação anterior (PowerShell)

Na raiz do projeto, usando seu `.env.local` já existente:

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml config --quiet
docker compose --env-file .env.local -f docker-compose.local.yml config --services
docker compose --env-file .env.local -f docker-compose.local.yml up -d --build --remove-orphans
docker compose --env-file .env.local -f docker-compose.local.yml ps
```

O Compose substituirá containers antigos `api`, `frontend`, `worker`, `scheduler` e `sync-dispatcher` por serviços novos, **sem apagar os volumes nomeados** do projeto `monitor-portal-local`. `--remove-orphans` remove os serviços antigos do mesmo projeto; não use caso possua outros serviços personalizados que queira manter.

Valide:

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml logs --tail=30 rabbitmq-monitor-frontend rabbitmq-monitor-api
```

Acesse `http://localhost:3000/api/health` e o portal em `http://localhost:3000`.

**Não execute `docker compose down -v`.** Preserve `.env.local`, em especial `CREDENTIAL_ENCRYPTION_KEY`.
