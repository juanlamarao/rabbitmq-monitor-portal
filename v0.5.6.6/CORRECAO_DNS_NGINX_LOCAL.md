# Monitor Portal v0.5.6 — correção DNS do frontend local

## Problema

No EKS o frontend aponta para o Service `rabbitmq-monitor-api`. No Docker Compose local o nome de serviço é `api`; sem alias o Nginx interrompe a inicialização com `host not found in upstream`.

## Ajuste aplicado

No `docker-compose.local.yml`, serviço `api`, foi adicionado:

```yaml
networks:
  default:
    aliases:
      - rabbitmq-monitor-api
```

O arquivo `frontend/nginx.k8s.conf` e os Dockerfiles são os mesmos para os dois ambientes. Nenhum serviço ou container foi renomeado.

## Aplicar localmente (PowerShell, na raiz do repositório)

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml config --quiet
docker compose --env-file .env.local -f docker-compose.local.yml up -d --no-deps --force-recreate api
docker compose --env-file .env.local -f docker-compose.local.yml up -d --no-deps --force-recreate frontend
docker compose --env-file .env.local -f docker-compose.local.yml logs --tail=60 frontend
```

Obs: reiniciar a API pode interromper chamadas em curso; os volumes MySQL, Redis, RabbitMQ e LDAP não são apagados. Não usar `down -v`.

### Testar

Abrir `http://localhost:3000/api/health`. A resposta deve vir do FastAPI.

## Arquivos alterados

- `docker-compose.local.yml`: alias `rabbitmq-monitor-api` para o serviço `api`.
- `CORRECAO_DNS_NGINX_LOCAL.md`: este guia.

Não é preciso mudar `kubernetes.dev.yaml`, `kubernetes.uat.yaml` ou `kubernetes.prod.yaml`.
