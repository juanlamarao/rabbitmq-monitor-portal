# Arquitetura

Projeto: RabbitMQ Monitor Portal

Stack inicial:

- Frontend: React + TypeScript + Vite + MUI
- Backend: Python + FastAPI
- Worker: Python + RQ
- Banco principal: MySQL 8.4
- Fila/cache/lock: Redis
- Ambiente local: Docker Compose
- RabbitMQ demo: container RabbitMQ com Management Plugin

## Fluxo principal da Fase 1

```text
Browser
  -> Frontend React
  -> Backend FastAPI
  -> MySQL
```

Para discovery manual:

```text
Frontend
  -> POST /clusters/{id}/discover-queues
  -> FastAPI
  -> RabbitMQ Management API
  -> MySQL
  -> audit_logs
```

## Fonte da verdade

O MySQL é a fonte da verdade das configurações de clusters, queues, templates e metadados manuais.

Ferramentas externas como Datadog, Zabbix e Dynatrace serão tratadas como destino de sync nas fases futuras.

## Worker e Redis

O Redis é usado pela fila RQ.

Nesta Fase 1, o discovery manual está exposto pela API para acelerar validação do MVP. A estrutura de worker já está pronta para receber jobs assíncronos na Fase 2.

Não é necessário criar tabelas, índices ou collections no Redis. As chaves são criadas dinamicamente pelo RQ, por exemplo:

```text
rq:queue:default
rq:job:<job_id>
rq:worker:<worker_id>
```

## Credenciais

As credenciais RabbitMQ são armazenadas criptografadas no banco.

Configuração recomendada fora do ambiente local:

```bash
CREDENTIAL_ENCRYPTION_KEY=<fernet_key>
```

Gerar chave:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Se a variável não for definida, a aplicação gera uma chave derivada apenas para desenvolvimento local.
