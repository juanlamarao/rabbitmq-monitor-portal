# Correção de conexão MySQL no Kubernetes (DEV)

Este patch altera exclusivamente `backend/app/core/config.py` e
`backend/app/core/wait_for_db.py`.

## Causa provável

A URL MySQL era montada via f-string, então senhas com caracteres como `@`,
`/`, `#` e `%` podiam fazer o SQLAlchemy interpretar o host/usuário incorretamente.
A URL agora é montada por `sqlalchemy.engine.URL.create`, preservando a senha.

## Diagnóstico adicional

O initContainer agora registra o endereço lógico (sem senha), a classe da
falha e, quando disponível, o código de erro MySQL em todas as tentativas.

Códigos comuns: `1045` (credenciais), `1049` (banco inexistente),
`1146` (tabela inexistente), `2003` (falha de conexão TCP).

## Aplicação

Reconstrua e publique **a imagem Backend** usando `Dockerfile_Backend`.
Seu template corporativo precisa substituir a referência `__BACKEND_IMAGE__`
por uma **nova tag** (não reaproveitar a antiga). Rode a pipeline de deploy.

Não precisa modificar o `kubernetes.dev.yaml`, recriar banco nem apagar PVCs.

## Validação

```bash
kubectl -n rabbitmq-monitor-dev get pods
kubectl -n rabbitmq-monitor-dev logs deployment/rabbitmq-monitor-api -c wait-mysql-schema --tail=40
kubectl -n rabbitmq-monitor-dev logs deployment/rabbitmq-monitor-worker -c wait-mysql-schema --tail=40
```

Esperado: `Schema MySQL disponível.` e os contêineres principais iniciam.
