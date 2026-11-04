> **ATENÇÃO — Versão v0.5.5_minorFix:** as instruções do bloco «v0.5.5_minorFix — novo padrão de substituição» ao final deste documento substituem convenções anteriores de tokens e imagens. Use `ImageName1`, `ImageName2` e `__RBTMQ_PORTAL_*__`.

# Deploy Azure DevOps — RabbitMQ Monitor Portal v0.5.4

O pipeline corporativo faz (1) substituição de variáveis do Azure DevOps Library nos arquivos YAML, (2) build/push de **duas** imagens para o registry interno, e (3) `kubectl apply` de um **único** `kubernetes.<env>.yaml`.

## Artefatos para a pipeline

- `Dockerfile_Backend` — build context `.` (raiz do repositório). Dependências em `backend/requirements.txt`.
- `Dockerfile_frontend` — build context `.`. Dependências JS em `frontend/package.json` (nesta base não existe package-lock; usa npm install).
- `kubernetes.dev.yaml` — manifesto multi-documento completo (namespace, config, secret, SQL/LDAP bootstrap, deployments, services, StatefulSets, HPA, Ingress).
- `frontend/nginx.k8s.conf` — o Nginx atende o React e encaminha `/api/` internamente para `rabbitmq-monitor-api:8000/`, sem CORS externo.

**Duas imagens, quatro workloads de aplicação:** API, Worker e Scheduler usam a mesma imagem Backend e são separados pelos comandos Kubernetes; o Frontend tem imagem própria. **Não são quatro builds.**

## Build local equivalente à pipeline

```bash
docker build -f Dockerfile_Backend -t REGISTRY/rabbitmq-monitor-backend:v0.5.4 .
docker build -f Dockerfile_frontend -t REGISTRY/rabbitmq-monitor-frontend:v0.5.4 .
docker push REGISTRY/rabbitmq-monitor-backend:v0.5.4
docker push REGISTRY/rabbitmq-monitor-frontend:v0.5.4
```

## Variáveis obrigatórias no arquivo `kubernetes.dev.yaml`

A substituição de tokens já existe na pipeline da empresa. Ajuste os nomes para o mecanismo que sua pipeline usa; os tokens `__NOME__` são apenas o contrato deste pacote.

| Placeholder | Exemplo/uso |
|---|---|
| `__NAMESPACE__` | `rabbitmq-monitor-dev` |
| `__BACKEND_IMAGE__` | `registry.interno/rabbitmq-monitor-backend:0.5.4-build123` |
| `__FRONTEND_IMAGE__` | `registry.interno/rabbitmq-monitor-frontend:0.5.4-build123` |
| `__MYSQL_IMAGE__` | imagem MySQL `8.4` espelhada no registry aprovado |
| `__REDIS_IMAGE__` | Redis 7 espelhado no registry aprovado |
| `__LDAP_IMAGE__` | OpenLDAP 1.5 espelhado no registry aprovado |
| `__INGRESS_HOST__` | `rabbitmq-monitor-dev.exemplo.interno` |
| `__INGRESS_CLASS__` | classe do controlador ingress disponível (ex.: `nginx`) |
| `__TLS_SECRET_NAME__` | Secret TLS já provisionado no namespace |
| `__MYSQL_PASSWORD__` | Library secret, usuário `app` do MySQL |
| `__MYSQL_ROOT_PASSWORD__` | Library secret, root do MySQL |
| `__LDAP_ADMIN_PASSWORD__` | Library secret, mesmo valor usado pelo bind LDAP de desenvolvimento |
| `__CREDENTIAL_ENCRYPTION_KEY__` | Fernet key **estável** compartilhada API/Worker/Scheduler |

A aplicação usa por padrão MySQL banco `rabbitmq_monitor_portal`, Redis em `rabbitmq-monitor-redis:6379` e LDAP em `rabbitmq-monitor-ldap:389`. Para serviços corporativos externos, remova os StatefulSets locais e ajuste `MYSQL_HOST`, `REDIS_HOST` e `LDAP_HOST` no ConfigMap.

**Importante sobre Secrets:** o manifesto contém recursos `Secret` com **apenas placeholders no repositório**. A pipeline substitui a partir da Library; o YAML resolvido contém segredos e deve ser tratado como dado confidencial. Não publique como artifact, não faça `cat` nos logs e evite persistência fora do agente. Se houver aspas especiais nos valores, garanta escaping YAML (ou use substituição por base64 em `data:`/ExternalSecrets).

## Deploy pela etapa de template corporativa

Depois de build/push, o template aplica o YAML já preenchido, equivalente a:

```bash
kubectl apply -f kubernetes.dev.yaml
kubectl -n rabbitmq-monitor-dev get deployment,statefulset,service,hpa,ingress,pod,pvc
kubectl -n rabbitmq-monitor-dev rollout status deployment/rabbitmq-monitor-api
kubectl -n rabbitmq-monitor-dev rollout status deployment/rabbitmq-monitor-frontend
```

O Ingress encaminha a raiz `/` para o frontend. O Nginx do frontend faz proxy `/api/*` para o backend. A página `/public/queue-reference` continua pública (atenção a dados expostos).

## Dependências no Kubernetes e comportamento em Dev

- MySQL 8.4 e Redis usam StatefulSets/PVC. O arquivo SQL é disponibilizado pelo ConfigMap para `/docker-entrypoint-initdb.d` e **somente executa com volume MySQL vazio**. Para banco existente, faça migração/backup separadamente. O SQL traz nome do banco `rabbitmq_monitor_portal` e seed de templates.
- OpenLDAP de desenvolvimento usa StatefulSet/PVC e ConfigMap com 20 usuários fictícios. Para AD corporativo externo, remova seu StatefulSet/Service e ajuste bind/LDAPS (incluindo credenciais) no manifesto.
- Com `AUTO_DB_BOOTSTRAP=false`, o FastAPI **não faz `create_all`/seed a cada pod**, evitando escrita concorrente quando o HPA escalar. O SQL do MySQL inicializa a base nova; os initContainers de API/worker aguardam a tabela `monitor_templates` antes de iniciar. No Docker Compose o comportamento anterior segue ativo por padrão.
- HPA (CPU 70%) para frontend (1–2) e API (1–3). Requer Metrics Server disponível. Worker usa 1 réplica; pode escalar manualmente pela profundidade da fila RQ, mas HPA por CPU não representa bem o backlog. Scheduler fica **desligado** (`replicas: 0`), pois sua inicialização enfileira discovery e Datadog sync imediatamente. Para ligá-lo altere `replicas` no YAML e reexecute a pipeline, garantindo uma única instância.
- Recursos de storage precisam de uma StorageClass default ou `storageClassName` ajustada nos PVCs. Registry privado precisa ter permissão de pull no cluster (node IAM/service account ou `imagePullSecrets`).
- O Ingress exige um Secret TLS existente (`__TLS_SECRET_NAME__`), DNS resolvendo para o controlador e classe `__INGRESS_CLASS__` configurada.
- Segurança Dev: Redis sem autenticação e LDAP sem TLS **devem permanecer em rede interna controlada**. Produção requer Redis protegido, LDAPS, políticas de rede, backup e rotação de segredos.
- **Egress requerido**: API e Worker precisam acessar Datadog HTTPS e APIs RabbitMQ externas. O scheduler precisa Redis, MySQL e LDAP.

## Arquitetura de comunicação

```text
Cliente HTTPS -> Ingress -> frontend (Nginx/React)
                              /api/* -> api (FastAPI)
API -> MySQL (fonte da verdade) + Redis (RQ/cache)
Scheduler -> Redis (enqueue) + MySQL + LDAP
Worker -> Redis (RQ) + MySQL + APIs RabbitMQ/Datadog
```

## Checagens pós-deploy

```bash
kubectl -n rabbitmq-monitor-dev get pods,svc,pvc,hpa,ingress
kubectl -n rabbitmq-monitor-dev logs deployment/rabbitmq-monitor-api --tail=100
kubectl -n rabbitmq-monitor-dev logs deployment/rabbitmq-monitor-worker --tail=100
kubectl -n rabbitmq-monitor-dev port-forward service/rabbitmq-monitor-frontend 8080:80
# Acesse http://localhost:8080 e http://localhost:8080/api/health
```

**Limites desta entrega:** o YAML foi validado estruturalmente, mas não há execução real de `kubectl apply` nem build Docker aqui. Confirme requisitos de PSA/SCC, políticas de imagens, permissões PVC, HPA Metrics Server e DNS/Ingress com a equipe de plataforma antes de aplicar.


## v0.5.5_minorFix — novo padrão de substituição

- **Frontend:** `image: ImageName1` (sem aspas; o template corporativo faz o replace).
- **Backend API, Worker, Scheduler e CronJob AD:** `image: ImageName2` (sem aspas).
- **Library:** placeholders `__RBTMQ_PORTAL_<NOME>__` (por exemplo, `__RBTMQ_PORTAL_LDAP_PORT__`).
- **Valores inseridos via `env:`:** todas as variáveis interpoladas da Library estão entre aspas duplas, inclusive senhas e hashes. Substituições contendo aspas duplas ou barras invertidas devem ser escapadas corretamente em YAML.
- **Manifestos separados:** `kubernetes.dev.yaml` (`APP_ENV=development`), `kubernetes.uat.yaml` (`APP_ENV=uat`), `kubernetes.prod.yaml` (`APP_ENV=production`). São iguais fora dessa variável; selecione namespace, hostname e credenciais via Variable Group correspondente.
- **MySQL/Redis:** StatefulSets e PVCs preservados. Não reaplique o SQL de bootstrap em bancos existentes; para v0.5.5 use a migração `007` manualmente.
- **Apenas DEV agora:** use [`MIGRACAO_SQL_007_DEV.md`](MIGRACAO_SQL_007_DEV.md) antes de aplicar `kubernetes.dev.yaml`.

Confira [`ARQUIVOS_ALTERADOS.md`](ARQUIVOS_ALTERADOS.md) para copiar somente os arquivos relevantes entre os repositórios. As orientações antigas que ainda mostram `__FRONTEND_IMAGE__`, `__BACKEND_IMAGE__` ou tokens sem `RBTMQ_PORTAL_` foram substituídas por estas orientações para v0.5.5_minorFix.
