SET @schema_name = DATABASE();

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE monitor_templates ADD COLUMN datadog_monitor_type VARCHAR(80) NULL DEFAULT \'query alert\' AFTER default_config',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'monitor_templates' AND COLUMN_NAME = 'datadog_monitor_type');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE monitor_templates ADD COLUMN datadog_query_template TEXT NULL AFTER datadog_monitor_type',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'monitor_templates' AND COLUMN_NAME = 'datadog_query_template');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE monitor_templates ADD COLUMN datadog_message_template TEXT NULL AFTER datadog_query_template',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'monitor_templates' AND COLUMN_NAME = 'datadog_message_template');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE monitor_templates ADD COLUMN datadog_tags_template JSON NULL AFTER datadog_message_template',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'monitor_templates' AND COLUMN_NAME = 'datadog_tags_template');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE monitor_templates ADD COLUMN datadog_options JSON NULL AFTER datadog_tags_template',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'monitor_templates' AND COLUMN_NAME = 'datadog_options');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @message_template = '{{#is_alert}}\n🚨 RabbitMQ Queue em alerta\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n\nDetalhes da fila: {{portal_public_base_url}}/public/queue-reference?rabbitmq_cluster={{rabbitmq_cluster.name}}&vhost={{vhost.name}}&queue={{queue.name}}\n{{/is_alert}}\n\n{{#is_recovery}}\n✅ RabbitMQ Queue recuperada\n\nCluster: {{rabbitmq_cluster.name}}\nVhost: {{vhost.name}}\nQueue: {{queue.name}}\n{{/is_recovery}}';
SET @tags_template = JSON_ARRAY('managed_by:rabbitmq-monitor-portal', 'component:queue', 'provider:datadog', 'template:{{template_code}}');
SET @options_template = JSON_OBJECT('include_tags', true, 'notify_no_data', false, 'require_full_window', false);

UPDATE monitor_templates
SET datadog_monitor_type = COALESCE(datadog_monitor_type, 'query alert'),
    datadog_query_template = COALESCE(datadog_query_template, 'max(last_{{window}}):max:rabbitmq.queue.messages{rabbitmq_cluster:*} by {rabbitmq_cluster,vhost,queue} > {{threshold}}'),
    datadog_message_template = COALESCE(datadog_message_template, @message_template),
    datadog_tags_template = COALESCE(datadog_tags_template, @tags_template),
    datadog_options = COALESCE(datadog_options, @options_template)
WHERE code IN ('queue_messages_above_threshold', 'queue_dlq_messages_above_threshold');

UPDATE monitor_templates
SET datadog_monitor_type = COALESCE(datadog_monitor_type, 'query alert'),
    datadog_message_template = COALESCE(datadog_message_template, @message_template),
    datadog_tags_template = COALESCE(datadog_tags_template, @tags_template),
    datadog_options = COALESCE(datadog_options, @options_template)
WHERE code = 'queue_messages_low_consumers';

UPDATE monitor_templates
SET datadog_monitor_type = COALESCE(datadog_monitor_type, 'query alert'),
    datadog_query_template = COALESCE(datadog_query_template, 'change(avg(last_{{window}}),last_{{window}}):max:rabbitmq.queue.messages{rabbitmq_cluster:*} by {rabbitmq_cluster,vhost,queue} > 0'),
    datadog_message_template = COALESCE(datadog_message_template, @message_template),
    datadog_tags_template = COALESCE(datadog_tags_template, @tags_template),
    datadog_options = COALESCE(datadog_options, @options_template)
WHERE code = 'queue_growing_messages';

UPDATE monitor_templates
SET datadog_monitor_type = COALESCE(datadog_monitor_type, 'query alert'),
    datadog_query_template = COALESCE(datadog_query_template, 'max(last_{{window}}):max:rabbitmq.queue.messages{rabbitmq_cluster:*} by {rabbitmq_cluster,vhost,queue} < 1'),
    datadog_message_template = COALESCE(datadog_message_template, @message_template),
    datadog_tags_template = COALESCE(datadog_tags_template, @tags_template),
    datadog_options = COALESCE(datadog_options, @options_template)
WHERE code = 'queue_without_messages';
