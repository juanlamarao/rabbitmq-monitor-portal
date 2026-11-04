# RabbitMQ Monitor Portal — Migração SQL 007 no MySQL DEV existente

**Aplicar somente em DEV agora.** Não executar nos bancos UAT/PROD. A migração `007_v0_5_5_entra_auth.sql` NÃO cria um banco novo, NÃO substitui tabelas existentes e NÃO apaga os PVCs.

Requisitos: `kubectl` configurado com acesso ao cluster EKS, pod MySQL existente no namespace correto e arquivo SQL disponível no computador de execução (checkout do projeto). Confirme o contexto do cluster antes de iniciar.

## 1. Definir namespace e confirmar o alvo

```bash
NS=rabbitmq-monitor-dev
kubectl config current-context
kubectl -n "$NS" get pod rabbitmq-monitor-mysql-0
kubectl -n "$NS" get pvc
```

Caso o namespace real não seja `rabbitmq-monitor-dev`, ajuste `NS`. Em caso de vários contextos AWS, confirme que o contexto é realmente o **cluster DEV**.

## 2. Conferir o banco e as tabelas existentes (somente leitura)

```bash
kubectl -n "$NS" exec rabbitmq-monitor-mysql-0 -c mysql -- \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -e "SHOW DATABASES; SHOW TABLES FROM rabbitmq_monitor_portal;"'
```

A senha é lida de `MYSQL_ROOT_PASSWORD` já presente no container MySQL. Não é necessário expor a senha no terminal.

## 3. Backup de segurança (recomendado)

```bash
kubectl -n "$NS" exec rabbitmq-monitor-mysql-0 -c mysql -- \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers rabbitmq_monitor_portal' \
  > "rabbitmq_monitor_portal_dev_backup_$(date +%Y%m%d_%H%M%S).sql"
```

O arquivo de backup será salvo na máquina que executa o `kubectl`. Proteja-o e não o comite no Git.

## 4. Executar SQL 007 por kubectl exec no MySQL existente

Execute a partir da raiz do projeto (diretório que contém `infra/mysql/upgrade/`):

```bash
kubectl -n "$NS" exec -i rabbitmq-monitor-mysql-0 -c mysql -- \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot rabbitmq_monitor_portal' \
  < infra/mysql/upgrade/007_v0_5_5_entra_auth.sql
```

**Como funciona:** o conteúdo do arquivo SQL local é enviado por STDIN ao cliente `mysql` dentro do pod. Isso NÃO copia o arquivo para o pod e não modifica o StatefulSet nem os PVCs.

## 5. Confirmar a migração

```bash
kubectl -n "$NS" exec rabbitmq-monitor-mysql-0 -c mysql -- \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot rabbitmq_monitor_portal -e "SHOW TABLES;"'
```

Confira se aparecem `portal_users`, `entra_access_groups` e `entra_group_clusters`. A migração utiliza `CREATE TABLE IF NOT EXISTS`; caso encontre erro no DDL, interrompa e avalie a mensagem antes de tentar novamente.

## 6. Aplicar o deployment DEV

Somente após confirmar as três tabelas, faça o build/push das imagens v0.5.5 e o apply do `kubernetes.dev.yaml` com substituição dos tokens Azure DevOps. **Não apague o StatefulSet MySQL, Redis ou seus PVCs.**

Os manifestos `kubernetes.uat.yaml` e `kubernetes.prod.yaml` foram gerados para uso futuro, mas **não são parte desta implantação**.
