# Monitor Portal v0.5.6.4 — Layout, Reports, upgrade sem perda de dados

## Mudanças nesta release
- Corrigido `boxSizing: border-box` na área principal; remove excesso de largura quando o menu está expandido.
- **Apenas nos blocos afetados**, os Grids de Dashboard, Administração, página pública e filtros da edição em massa foram substituídos por CSS grid responsivo com gap de 16px e sem margens negativas. Os grids das demais telas não foram alterados.
- Reports: 7 categorias administrativas, prévia de 100 registros, filtro por cluster quando aplicável, CSV completo com streaming e PDF paisagem limitado a 1.000 registros, com aviso de truncamento. Endpoint protegido pela autorização de administrador existente.
- O Backend inclui `reportlab==4.2.5`; precisa rebuild da imagem `ImageName2` em EKS.
- **Nenhuma tabela/coluna nova na v0.5.6.4.** Mudanças de BD corporativo vêm das versões v0.5.5 a v0.5.6.2.

## Migração de MySQL corporativo **existente** de v0.5.4 para v0.5.6.4

**Pré-requisitos**
1. Confirmar que o banco está realmente na v0.5.4 e que os patches anteriores (especialmente `006_v0_5_4_dedicated_datadog.sql`) foram aplicados. Não rode novamente 006 automaticamente: ele atualiza monitores agrupados e templates.
2. Executar `DIAGNOSTICO_V054_PARA_V0564.sql` antes; comparar quantidades e colunas.
3. Fazer backup completo MySQL (estrutura, dados, triggers, routines e eventos), validar tamanho/restore em banco de teste. Manter volumes/PVC intactos; **não** fazer `down -v`.
4. Agendar janela de manutenção e parar API e serviços escritores (`worker`, `scheduler`, `sync-dispatcher`, `reconciler`) **sem parar o MySQL**. Faça deploy da nova API somente depois da migração.
5. Utilizar conexão MySQL com TLS/túnel privado, por exemplo `kubectl port-forward ... 3307:3306` no localhost; não publicar 3306 para a internet.

**Upgrade:** usando cliente MySQL com `--default-character-set=utf8mb4`, banco `rabbitmq_monitor_portal`:

```bash
mysql --host=127.0.0.1 --port=3307 --user=SEU_USUARIO --password --default-character-set=utf8mb4 rabbitmq_monitor_portal < infra/mysql/upgrade/DIAGNOSTICO_V054_PARA_V0564.sql
mysql --host=127.0.0.1 --port=3307 --user=SEU_USUARIO --password --default-character-set=utf8mb4 rabbitmq_monitor_portal < infra/mysql/upgrade/UPGRADE_V054_PARA_V0564.sql
```

O bundle `UPGRADE_V054_PARA_V0564.sql` junta, em ordem, os scripts originais 007, 008, 009, 010, 011, 012. **Execute uma vez por banco/ambiente**, começando pelo Dev. As alterações SQL são aditivas, com duas correções intencionais nos conteúdos dos templates existentes (`010`: emoji; `012`: variáveis do Portal). Não altera nem apaga os dados de queues/monitores; 010 só enfileira revisão dos bindings de templates corrigidos. **Não execute 006 sem avaliar o schema real**. DDL em MySQL não é transacional; restore de backup é o rollback.

Se algum patch já tiver sido parcialmente aplicado, não rode o bundle cegamente. `CREATE TABLE IF NOT EXISTS` não valida o conteúdo das tabelas existentes: confira schema/colunas antes.

**Opcional: backup de verificação dos dados antes/depois**:

```sql
SELECT COUNT(*) AS clusters FROM rabbitmq_clusters;
SELECT COUNT(*) AS filas FROM rabbitmq_queues;
SELECT COUNT(*) AS templates FROM monitor_templates;
SELECT COUNT(*) AS monitores FROM generated_monitors;
SELECT COUNT(*) AS bindings FROM queue_monitor_templates;
```

**Verificar após a migração**:

```sql
SHOW TABLES LIKE 'portal_users';
SHOW TABLES LIKE 'portal_ui_settings';
SHOW TABLES LIKE 'datadog_sync_queue';
SHOW TABLES LIKE 'datadog_reconcile_runs';
SHOW TABLES LIKE 'datadog_reconcile_clusters';
SHOW TABLES LIKE 'datadog_reconcile_control';
SELECT COUNT(*) FROM rabbitmq_queues;
SELECT COUNT(*) FROM generated_monitors;
```

**Reiniciar imagens atualizadas**: frontend com `ImageName1`; API, worker, scheduler, dispatcher e reconciler com a mesma `ImageName2` nos manifestos EKS existentes. Não renomear recursos. Manter as variáveis, volumes e credenciais corporativas. 

## Desktop

Patch sobre v0.5.6.3, sem necessidade de migrações adicionais em banco local já atualizado até SQL 012:

```powershell
docker compose --env-file .env.local -f docker-compose.local.yml up -d --build --no-deps rabbitmq-monitor-api rabbitmq-monitor-frontend
```

## Considerações
- PDF mostra até 1.000 linhas; CSV contém o conjunto completo; prévia exibe 100.
- Relatórios são snapshots do MySQL; a geração não consulta a API Datadog em tempo real.
- Para validação de layout real em navegadores/EKS, comparar Dashboard, Administração (menu aberto/fechado), página pública e edição em massa em largura desktop e mobile.
