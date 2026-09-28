SET @schema_name = DATABASE();

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rabbitmq_clusters ADD COLUMN datadog_integration_type VARCHAR(80) NOT NULL DEFAULT ''custom'' AFTER datadog_org_id',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'rabbitmq_clusters' AND COLUMN_NAME = 'datadog_integration_type');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rabbitmq_clusters ADD COLUMN datadog_cluster_tag_value VARCHAR(255) NULL AFTER datadog_integration_type',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'rabbitmq_clusters' AND COLUMN_NAME = 'datadog_cluster_tag_value');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rabbitmq_clusters ADD COLUMN datadog_cluster_tag_key VARCHAR(120) NOT NULL DEFAULT ''rabbitmq_cluster'' AFTER datadog_cluster_tag_value',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'rabbitmq_clusters' AND COLUMN_NAME = 'datadog_cluster_tag_key');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rabbitmq_clusters ADD COLUMN datadog_vhost_tag_key VARCHAR(120) NOT NULL DEFAULT ''vhost'' AFTER datadog_cluster_tag_key',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'rabbitmq_clusters' AND COLUMN_NAME = 'datadog_vhost_tag_key');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rabbitmq_clusters ADD COLUMN datadog_queue_tag_key VARCHAR(120) NOT NULL DEFAULT ''queue'' AFTER datadog_vhost_tag_key',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'rabbitmq_clusters' AND COLUMN_NAME = 'datadog_queue_tag_key');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rabbitmq_clusters ADD COLUMN datadog_node_tag_key VARCHAR(120) NULL AFTER datadog_queue_tag_key',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'rabbitmq_clusters' AND COLUMN_NAME = 'datadog_node_tag_key');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rabbitmq_clusters ADD COLUMN datadog_metric_messages VARCHAR(255) NOT NULL DEFAULT ''rabbitmq.queue.messages'' AFTER datadog_node_tag_key',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'rabbitmq_clusters' AND COLUMN_NAME = 'datadog_metric_messages');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE rabbitmq_clusters ADD COLUMN datadog_metric_consumers VARCHAR(255) NOT NULL DEFAULT ''rabbitmq.queue.consumers'' AFTER datadog_metric_messages',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'rabbitmq_clusters' AND COLUMN_NAME = 'datadog_metric_consumers');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE rabbitmq_clusters
SET datadog_cluster_tag_value = COALESCE(datadog_cluster_tag_value, name),
    datadog_cluster_tag_key = COALESCE(datadog_cluster_tag_key, 'rabbitmq_cluster'),
    datadog_vhost_tag_key = COALESCE(datadog_vhost_tag_key, 'vhost'),
    datadog_queue_tag_key = COALESCE(datadog_queue_tag_key, 'queue'),
    datadog_metric_messages = COALESCE(datadog_metric_messages, 'rabbitmq.queue.messages'),
    datadog_metric_consumers = COALESCE(datadog_metric_consumers, 'rabbitmq.queue.consumers');

-- Monitores planejados antigos agrupados podem ter escopo mais amplo do que o portal.
-- Mantemos como orphaned para evitar que sejam aplicados sem revisão após o upgrade.
UPDATE generated_monitors
SET sync_status = 'orphaned', status = 'orphaned'
WHERE provider = 'datadog' AND monitor_scope_type = 'grouped_queue' AND sync_status IN ('pending_create','pending_update','synced','error');

UPDATE monitor_templates
SET datadog_query_template = 'max(last_{{window}}):max:{{metric_messages}}{ {{datadog_scope}} } > {{threshold}}'
WHERE code IN ('queue_messages_above_threshold', 'queue_dlq_messages_above_threshold')
  AND (datadog_query_template LIKE '%rabbitmq_cluster:*%' OR datadog_query_template IS NULL);

UPDATE monitor_templates
SET datadog_query_template = 'max(last_{{window}}):max:{{metric_messages}}{ {{datadog_scope}} } < 1'
WHERE code = 'queue_without_messages'
  AND (datadog_query_template LIKE '%rabbitmq_cluster:*%' OR datadog_query_template IS NULL);

UPDATE monitor_templates
SET datadog_query_template = 'change(avg(last_{{window}}),last_{{window}}):max:{{metric_messages}}{ {{datadog_scope}} } > 0'
WHERE code = 'queue_growing_messages'
  AND (datadog_query_template LIKE '%rabbitmq_cluster:*%' OR datadog_query_template IS NULL);

UPDATE monitor_templates
SET datadog_message_template = '{{#is_alert}}\n🚨 RabbitMQ Queue em alerta\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n\nDetalhes da fila: {{public_reference_url}}\n{{/is_alert}}\n\n{{#is_recovery}}\n✅ RabbitMQ Queue recuperada\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n{{/is_recovery}}'
WHERE datadog_message_template IS NULL OR datadog_message_template LIKE '%portal_public_base_url%';
