# RabbitMQ Monitor Portal v0.5.6.10

Atualização incremental sobre **v0.5.6.9**. Não altera LDAP, regras Entra ID / RBAC, reconciliação de webhooks ou nomes dos workloads EKS.

## 1. Webhooks e acionamento VICCI

- Removido o aviso explicativo redundante na tela Administração → Webhooks.
- Validação de e-mail VICCI agora verifica a string inteira no frontend e rejeita separadores (`;`, `,`), espaços indevidos e endereços inválidos no backend (`EmailStr` + validação antecipada).
- Tooltips de acionamentos agora usam `InfoRounded` azul, em vez do ícone de aviso.
- Texto da dica VICCI atualizado para **“Informe a DL/OL conforme está configurado no grupo VICCI.”**
- Não foi modificada a regra de Jornada/Serviço/Owner/Descrição de SRE OPS e CCBP.

## 2. Dimensões adicionais por cluster

Campos novos no cadastro de cluster:

- `datadog_use_cluster_dimension`: booleano, default `true`, preservando o comportamento da versão anterior.
- `datadog_extra_dimensions`: JSON array `[{"key":"environment","value":"production"}]`, default `[]`.

O campo **Valor do cluster no Datadog** continua gravado e exibido, mesmo com a dimensão de cluster desativada na consulta. O scope será construído na ordem: `cluster` (quando ativo), dimensões extras, `vhost`, `queue`.

Exemplo de query com o toggle de cluster desativado:

```text
max(last_15m):max:rabbitmq.queue.messages{environment:production,service:orders,vhost:/,queue:jobs} > 5000
```

- As dimensões extras exigem `key` e `value` únicos e não podem duplicar chaves `cluster`, `vhost` ou `queue` configuradas no cluster.
- Sem dimensão de cluster, é exigida pelo menos **uma dimensão extra** para minimizar o risco de atingir filas de outros clusters.
- São permitidas até 25 dimensões adicionais por cluster.
- A atualização do cluster conserva o processo existente de marcar suas filas para sincronização, permitindo reconciliar os monitores com o novo scope.
- O link de busca de monitores na referência pública passa a respeitar a seleção das dimensões.

## 3. MySQL — ATENÇÃO: migração obrigatória

Para **bancos já existentes** na v0.5.6.9, executar em **DEV, depois UAT e PROD**, com backup prévio:

```bash
mysql -h HOST_MYSQL -u USUARIO -p rabbitmq_monitor_portal \
  < infra/mysql/upgrade/015_v0_5_6_10_cluster_extra_dimensions.sql
```

A migração adiciona as duas colunas e inicializa todas as dimensões extras existentes como `[]`, mantendo a dimensão cluster ativa por padrão.

O script **não é idempotente**: execute uma vez por banco. É importante concluir a migração **antes** do deployment do novo backend. Nenhum dado da versão anterior deve ser apagado.

Para **instalações novas** (MySQL sem schema):

```text
infra/mysql/init/001_schema.sql
```

Esse é o SQL completo da v0.5.6.10, incluindo as **21 tabelas** da aplicação, colunas, índices, chaves estrangeiras e registros básicos de configuração. Não é necessário aplicar as migrações 002 a 015 em um banco criado por esse arquivo.

**Não executar o SQL completo 001 sobre um banco existente como substituto das migrações.** `CREATE TABLE IF NOT EXISTS` não adiciona colunas às tabelas existentes.

## 4. EKS — mudança no prepare-schema e HTTPS

Arquivos atualizados: `kubernetes.dev.yaml`, `kubernetes.uat.yaml` e `kubernetes.prod.yaml`.

- URLs públicas e CORS trocados de `http://__RBTMQ_PORTAL_INGRESS_HOST__` para `https://__RBTMQ_PORTAL_INGRESS_HOST__`.
- O `prepare-schema` **não contém mais SQL embutido**. É um initContainer simples que copia `/app/infra/mysql/init/001_schema.sql` da imagem **ImageName2 (backend)** para o volume compartilhado `/docker-entrypoint-initdb.d`.
- `Dockerfile_Backend` inclui o SQL completo na imagem; no Azure DevOps, **construir/publicar a imagem nova de backend antes de atualizar os manifests**.
- O MySQL executa arquivos em `/docker-entrypoint-initdb.d` **apenas quando o diretório de dados estiver vazio**. Não altera bancos existentes no restart.
- Mantido o `wait-mysql-schema` (API, workers, scheduler) como dependência de disponibilidade, mas não executa migrações; agora identifica rapidamente a ausência das colunas 013/015.

## 5. Checklist para deploy

1. Fazer backup do banco de cada ambiente.
2. Aplicar migração 015 aos bancos existentes (DEV, UAT, PROD). Confirmar:

   ```sql
   SHOW COLUMNS FROM rabbitmq_clusters WHERE Field IN
   ('datadog_use_cluster_dimension', 'datadog_extra_dimensions');
   ```

3. Construir e publicar **ImageName2** com o `Dockerfile_Backend` da v0.5.6.10. Publicar o frontend atualizado (**ImageName1**).
4. Aplicar o manifesto correspondente ao ambiente.
5. Verificar startup de MySQL/API/workers/scheduler e autenticação Entra ID.
6. Testar fila VICCI com `dl@empresa.com,` (deve rejeitar) e `dl@empresa.com` (deve aceitar).
7. Em Clusters, testar edição do scope com cluster desativado e uma dimensão `environment:production`; verificar no planejamento que o scope final inclui `vhost` e `queue`.
8. Validar a reconciliação do monitor no Datadog antes de propagar para outras organizações.

## 6. Verificações locais realizadas

- Sintaxe Python (`compileall`).
- Testes unitários para dimensões e e-mail (`PYTHONPATH=backend python -m unittest discover -s backend/tests -p 'test_v05610.py'`).
- Parsing TypeScript dos arquivos modificados.
- Parsing YAML de DEV, UAT e PROD.
- Comparação das tabelas ORM e DDL: 21/21.

**Não foi executado** o build integral React (dependências NPM não estão instaladas neste ambiente), um MySQL 8.4 real, um EKS real ou a reconciliação Datadog real. Homologar no DEV antes de UAT/PROD.
