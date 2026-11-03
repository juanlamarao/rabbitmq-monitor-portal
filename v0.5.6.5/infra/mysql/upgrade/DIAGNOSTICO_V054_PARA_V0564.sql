-- SOMENTE LEITURA. Executar primeiro no banco corporativo.
-- Se faltar alguma tabela da v0.5.4, NÃO execute o bundle sem comparar o schema real.
SET NAMES utf8mb4;
SELECT DATABASE() AS banco_atual, VERSION() AS mysql_versao;
SELECT TABLE_NAME, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'rabbitmq_clusters','rabbitmq_queues','monitor_templates','queue_monitor_templates',
    'generated_monitors','datadog_orgs','portal_users','entra_access_groups',
    'entra_group_clusters','portal_ui_settings','datadog_sync_queue',
    'datadog_reconcile_runs','datadog_reconcile_clusters','datadog_reconcile_control'
  ) ORDER BY TABLE_NAME;
-- Colunas que precisamos para confirmar que a base já contém os ajustes v0.5.4:
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND (
 (TABLE_NAME = 'rabbitmq_clusters' AND COLUMN_NAME IN ('datadog_org_id','datadog_cluster_tag_value','datadog_queue_tag_key'))
 OR (TABLE_NAME = 'generated_monitors' AND COLUMN_NAME IN ('external_monitor_id','sync_status','monitor_scope_type'))
 OR (TABLE_NAME = 'monitor_templates' AND COLUMN_NAME IN ('datadog_message_template','datadog_tags_template'))
) ORDER BY TABLE_NAME,COLUMN_NAME;
SELECT 'Clusters' AS entidade, COUNT(*) AS quantidade FROM rabbitmq_clusters
UNION ALL SELECT 'Queues', COUNT(*) FROM rabbitmq_queues
UNION ALL SELECT 'Templates', COUNT(*) FROM monitor_templates
UNION ALL SELECT 'Bindings', COUNT(*) FROM queue_monitor_templates
UNION ALL SELECT 'Generated monitors', COUNT(*) FROM generated_monitors;
