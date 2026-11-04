USE rabbitmq_monitor_portal;

CREATE TABLE IF NOT EXISTS sre_group_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sre_group_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sre_group_member_email (sre_group_id, email),
  KEY ix_sre_group_members_sre_group_id (sre_group_id),
  CONSTRAINT fk_sre_group_members_group FOREIGN KEY (sre_group_id) REFERENCES sre_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'datadog_orgs' AND COLUMN_NAME = 'api_key_encrypted');
SET @sql := IF(@col = 0, 'ALTER TABLE datadog_orgs ADD COLUMN api_key_encrypted TEXT NULL AFTER org_url', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'datadog_orgs' AND COLUMN_NAME = 'app_key_encrypted');
SET @sql := IF(@col = 0, 'ALTER TABLE datadog_orgs ADD COLUMN app_key_encrypted TEXT NULL AFTER api_key_encrypted', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
