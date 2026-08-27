SET @schema_name = DATABASE();

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN datadog_org_id BIGINT UNSIGNED NULL AFTER is_active',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'datadog_org_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN cluster_id BIGINT UNSIGNED NULL AFTER datadog_org_id',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'cluster_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN monitor_scope_type VARCHAR(40) NOT NULL DEFAULT \'grouped_queue\' AFTER cluster_id',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'monitor_scope_type');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN grouping_key VARCHAR(120) NULL AFTER monitor_scope_type',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'grouping_key');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN name VARCHAR(500) NULL AFTER grouping_key',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'name');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN query TEXT NULL AFTER name',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'query');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN message TEXT NULL AFTER query',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'message');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN tags_json JSON NULL AFTER message',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'tags_json');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN options_json JSON NULL AFTER tags_json',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'options_json');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN covered_queues_count INT NOT NULL DEFAULT 0 AFTER options_json',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'covered_queues_count');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN sample_queues_json JSON NULL AFTER covered_queues_count',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'sample_queues_json');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN desired_config_hash VARCHAR(80) NULL AFTER sample_queues_json',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'desired_config_hash');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN applied_config_hash VARCHAR(80) NULL AFTER desired_config_hash',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'applied_config_hash');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN sync_status VARCHAR(40) NOT NULL DEFAULT \'planned\' AFTER applied_config_hash',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'sync_status');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN external_monitor_id VARCHAR(255) NULL AFTER sync_status',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'external_monitor_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN external_monitor_url VARCHAR(500) NULL AFTER external_monitor_id',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'external_monitor_url');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN last_planned_at DATETIME NULL AFTER external_monitor_url',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'last_planned_at');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN last_synced_at DATETIME NULL AFTER last_planned_at',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'last_synced_at');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD COLUMN last_error TEXT NULL AFTER last_synced_at',
  'SELECT 1')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND COLUMN_NAME = 'last_error');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE generated_monitors
SET provider = COALESCE(provider, 'datadog'),
    monitor_scope_type = COALESCE(monitor_scope_type, 'grouped_queue'),
    sync_status = COALESCE(sync_status, status, 'planned'),
    external_monitor_id = COALESCE(external_monitor_id, external_id),
    external_monitor_url = COALESCE(external_monitor_url, external_url),
    applied_config_hash = COALESCE(applied_config_hash, NULL)
WHERE provider = 'datadog' OR provider IS NULL;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD INDEX ix_generated_monitors_provider_grouping (provider, grouping_key)',
  'SELECT 1')
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND INDEX_NAME = 'ix_generated_monitors_provider_grouping');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD INDEX ix_generated_monitors_org_status (datadog_org_id, sync_status)',
  'SELECT 1')
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND INDEX_NAME = 'ix_generated_monitors_org_status');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE generated_monitors ADD INDEX ix_generated_monitors_template_status (template_id, sync_status)',
  'SELECT 1')
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'generated_monitors' AND INDEX_NAME = 'ix_generated_monitors_template_status');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
