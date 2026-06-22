CREATE DATABASE IF NOT EXISTS rabbitmq_monitor_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rabbitmq_monitor_portal;

CREATE TABLE IF NOT EXISTS sre_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sre_groups_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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

CREATE TABLE IF NOT EXISTS datadog_orgs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  api_url VARCHAR(255) NOT NULL DEFAULT 'https://api.datadoghq.com',
  org_url VARCHAR(255) NULL,
  api_key_encrypted TEXT NULL,
  app_key_encrypted TEXT NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_datadog_orgs_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabbitmq_clusters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  environment VARCHAR(20) NOT NULL,
  business_line TEXT NULL,
  protocol VARCHAR(10) NOT NULL DEFAULT 'https',
  dns VARCHAR(255) NOT NULL,
  api_port INT NOT NULL DEFAULT 15672,
  api_username VARCHAR(180) NOT NULL,
  api_password_encrypted TEXT NOT NULL,
  sre_group_id BIGINT UNSIGNED NULL,
  datadog_org_id BIGINT UNSIGNED NULL,
  monitor_cluster BOOLEAN NOT NULL DEFAULT TRUE,
  monitor_queues BOOLEAN NOT NULL DEFAULT TRUE,
  monitor_exchanges BOOLEAN NOT NULL DEFAULT FALSE,
  monitor_connections BOOLEAN NOT NULL DEFAULT FALSE,
  monitor_nodes BOOLEAN NOT NULL DEFAULT FALSE,
  monitor_shovels BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_discovery_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rabbitmq_clusters_name (name),
  KEY ix_clusters_sre_group_id (sre_group_id),
  KEY ix_clusters_datadog_org_id (datadog_org_id),
  CONSTRAINT fk_clusters_sre_group FOREIGN KEY (sre_group_id) REFERENCES sre_groups(id) ON DELETE SET NULL,
  CONSTRAINT fk_clusters_datadog_org FOREIGN KEY (datadog_org_id) REFERENCES datadog_orgs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cluster_temporary_queue_regexes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cluster_id BIGINT UNSIGNED NOT NULL,
  pattern VARCHAR(500) NOT NULL DEFAULT '^$',
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cluster_temp_regex_position (cluster_id, position),
  KEY ix_cluster_temp_regex_cluster_id (cluster_id),
  CONSTRAINT fk_temp_regex_cluster FOREIGN KEY (cluster_id) REFERENCES rabbitmq_clusters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabbitmq_queues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cluster_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  vhost VARCHAR(255) NOT NULL,
  type VARCHAR(80) NULL,
  durable BOOLEAN NULL,
  auto_delete BOOLEAN NULL,
  exclusive BOOLEAN NULL,
  state VARCHAR(80) NULL,
  api_raw JSON NULL,
  description TEXT NULL,
  criticality VARCHAR(40) NULL,
  owner_email VARCHAR(255) NULL,
  journey VARCHAR(255) NULL,
  service_name VARCHAR(255) NULL,
  monitoring_schedule VARCHAR(40) NOT NULL DEFAULT '24x7',
  monitoring_custom_window VARCHAR(255) NULL,
  dev_emails JSON NULL,
  is_dead_letter BOOLEAN NOT NULL DEFAULT FALSE,
  monitor_anomaly BOOLEAN NOT NULL DEFAULT TRUE,
  monitor_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_temporary BOOLEAN NOT NULL DEFAULT FALSE,
  is_removed BOOLEAN NOT NULL DEFAULT FALSE,
  removed_at DATETIME NULL,
  discovered_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_queue_cluster_vhost_name (cluster_id, vhost, name),
  KEY ix_queues_cluster_removed (cluster_id, is_removed),
  KEY ix_queues_name (name),
  KEY ix_queues_vhost (vhost),
  CONSTRAINT fk_queues_cluster FOREIGN KEY (cluster_id) REFERENCES rabbitmq_clusters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(120) NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NULL,
  component_type VARCHAR(40) NOT NULL DEFAULT 'queue',
  monitor_kind VARCHAR(80) NOT NULL,
  default_config JSON NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_monitor_templates_code (code),
  KEY ix_monitor_templates_component_active (component_type, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS queue_monitor_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  queue_id BIGINT UNSIGNED NOT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  overrides JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_queue_template (queue_id, template_id),
  KEY ix_queue_monitor_templates_enabled (enabled),
  KEY ix_queue_monitor_templates_template_id (template_id),
  CONSTRAINT fk_queue_templates_queue FOREIGN KEY (queue_id) REFERENCES rabbitmq_queues(id) ON DELETE CASCADE,
  CONSTRAINT fk_queue_templates_template FOREIGN KEY (template_id) REFERENCES monitor_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS generated_monitors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  queue_id BIGINT UNSIGNED NULL,
  template_id BIGINT UNSIGNED NULL,
  provider VARCHAR(40) NOT NULL,
  external_id VARCHAR(255) NULL,
  external_url VARCHAR(500) NULL,
  desired_config JSON NULL,
  last_applied_config JSON NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_generated_monitors_queue_id (queue_id),
  KEY ix_generated_monitors_template_id (template_id),
  KEY ix_generated_monitors_provider_status (provider, status),
  CONSTRAINT fk_generated_monitors_queue FOREIGN KEY (queue_id) REFERENCES rabbitmq_queues(id) ON DELETE SET NULL,
  CONSTRAINT fk_generated_monitors_template FOREIGN KEY (template_id) REFERENCES monitor_templates(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_type VARCHAR(80) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  cluster_id BIGINT UNSIGNED NULL,
  summary TEXT NULL,
  details JSON NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_job_history_cluster_id (cluster_id),
  KEY ix_job_history_status_created (status, created_at),
  CONSTRAINT fk_job_history_cluster FOREIGN KEY (cluster_id) REFERENCES rabbitmq_clusters(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  action VARCHAR(80) NOT NULL,
  actor VARCHAR(120) NOT NULL DEFAULT 'local-admin',
  summary TEXT NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_logs_entity (entity_type, entity_id),
  KEY ix_audit_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO sre_groups (name, description, is_active)
VALUES ('SRE Default', 'Grupo SRE inicial para ambiente local.', TRUE)
ON DUPLICATE KEY UPDATE description = VALUES(description), is_active = VALUES(is_active);

INSERT INTO datadog_orgs (name, api_url, org_url, description, is_active)
VALUES ('Datadog Default', 'https://api.datadoghq.com', NULL, 'Org Datadog inicial para vincular clusters.', TRUE)
ON DUPLICATE KEY UPDATE api_url = VALUES(api_url), org_url = VALUES(org_url), description = VALUES(description), is_active = VALUES(is_active);

INSERT INTO monitor_templates (code, name, description, component_type, monitor_kind, default_config, is_system, is_active)
VALUES
(
  'queue_messages_above_threshold',
  'Fila com quantidade de mensagens acima de threshold',
  'Alerta quando a quantidade de mensagens na fila ultrapassar o threshold configurado.',
  'queue',
  'threshold',
  JSON_OBJECT('threshold', 5000, 'window', '15m', 'business_days_only', false),
  TRUE,
  TRUE
),
(
  'queue_dlq_messages_above_threshold',
  'Fila DLQ com mensagens acima de threshold',
  'Alerta para filas DLQ quando houver mensagens acima do limite configurado.',
  'queue',
  'dlq_threshold',
  JSON_OBJECT('threshold', 0, 'window', '15m', 'business_days_only', false),
  TRUE,
  TRUE
),
(
  'queue_messages_low_consumers',
  'Fila com mensagens e baixo consumidores',
  'Alerta quando houver mensagens e consumidores abaixo do mínimo configurado.',
  'queue',
  'messages_low_consumers',
  JSON_OBJECT('messages_threshold', 1, 'consumers_threshold', 0, 'window', '15m', 'business_days_only', false),
  TRUE,
  TRUE
),
(
  'queue_growing_messages',
  'Fila com mensagens crescentes',
  'Alerta quando a quantidade de mensagens crescer durante a janela configurada.',
  'queue',
  'growing_messages',
  JSON_OBJECT('window', '15m', 'business_days_only', false),
  TRUE,
  TRUE
),
(
  'queue_without_messages',
  'Fila sem mensagens',
  'Alerta quando a fila permanecer sem mensagens durante a janela configurada.',
  'queue',
  'without_messages',
  JSON_OBJECT('window', '15m', 'business_days_only', false),
  TRUE,
  TRUE
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  component_type = VALUES(component_type),
  monitor_kind = VALUES(monitor_kind),
  default_config = VALUES(default_config),
  is_system = VALUES(is_system),
  is_active = VALUES(is_active);
