-- Monitor Portal v0.5.4 -> v0.5.6.6. SOMENTE para DB sem migrações 007-013.
-- Para atualizar a partir da v0.5.6.5 execute SOMENTE 013.
-- Faça backup e confirme INFORMATION_SCHEMA; não repetir após aplicação.
SET NAMES utf8mb4;


-- ═══════════ 007_v0_5_5_entra_auth.sql ═══════════
-- Apply manually to existing MySQL database. DO NOT DROP existing tables / PVC.
USE rabbitmq_monitor_portal;

CREATE TABLE IF NOT EXISTS portal_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  object_id VARCHAR(64) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_portal_users_entra_identity (tenant_id,object_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS entra_access_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  object_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_entra_access_groups_object_id (object_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS entra_group_clusters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_id BIGINT UNSIGNED NOT NULL,
  cluster_id BIGINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_entra_group_cluster (group_id,cluster_id),
  CONSTRAINT fk_access_group FOREIGN KEY (group_id) REFERENCES entra_access_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_access_cluster FOREIGN KEY (cluster_id) REFERENCES rabbitmq_clusters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



-- ═══════════ 008_v0_5_5_visual_v1.sql ═══════════
-- v0.5.6 visual v1 — additive, does not touch existing data/PVC.
-- Execute once on each existing database, starting with Dev.
USE rabbitmq_monitor_portal;

CREATE TABLE IF NOT EXISTS portal_ui_settings (
    id INT NOT NULL PRIMARY KEY,
    layout VARCHAR(24) NOT NULL DEFAULT 'corporate',
    theme VARCHAR(24) NOT NULL DEFAULT 'btg_light',
    login_particles BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by VARCHAR(120) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO portal_ui_settings (id, layout, theme, login_particles)
VALUES (1, 'corporate', 'btg_light', TRUE);



-- ═══════════ 009_v0_5_6_datadog_sync_queue.sql ═══════════
-- Fila duravel por Queue RabbitMQ; migração aditiva para MySQL existente.
CREATE TABLE IF NOT EXISTS datadog_sync_queue (
  queue_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  desired_revision INT NOT NULL DEFAULT 1,
  applied_revision INT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  reason VARCHAR(150) NOT NULL DEFAULT 'change',
  requested_by VARCHAR(255) NOT NULL DEFAULT 'system',
  last_error TEXT NULL,
  next_retry_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_synced_at DATETIME NULL,
  INDEX ix_dd_sync_state_retry (status, next_retry_at),
  CONSTRAINT fk_dd_sync_queue_id FOREIGN KEY (queue_id) REFERENCES rabbitmq_queues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



-- ═══════════ 010_v0_5_6_1_fix_mojibake_templates.sql ═══════════
-- v0.5.6.1: Corrige caracteres corrompidos em mensagens de templates existentes.
-- Executar com cliente conectado em utf8mb4; não apaga mensagens personalizadas.
-- Faça backup da tabela monitor_templates antes de aplicar.
SET NAMES utf8mb4;

CREATE TEMPORARY TABLE rmp_fixed_template_ids (id BIGINT PRIMARY KEY);
INSERT IGNORE INTO rmp_fixed_template_ids (id)
SELECT id FROM monitor_templates
WHERE datadog_message_template LIKE '%ðŸš¨%'
   OR datadog_message_template LIKE '%âœ…%';

UPDATE monitor_templates AS mt
JOIN rmp_fixed_template_ids AS ids ON ids.id = mt.id
SET mt.datadog_message_template = REPLACE(
      REPLACE(mt.datadog_message_template, 'ðŸš¨', '🚨'),
      'âœ…', '✅'
    );

-- Cada fila que usa um template corrigido recebe uma nova revisão na outbox.
-- O dispatcher reconcilia automaticamente o texto com o Datadog.
INSERT INTO datadog_sync_queue
  (queue_id, desired_revision, applied_revision, status, attempts, reason, requested_by)
SELECT DISTINCT qmt.queue_id, 1, 0, 'pending', 0, 'template_message_utf8_fixed', 'sql-migration-010'
FROM queue_monitor_templates qmt
JOIN rmp_fixed_template_ids ids ON ids.id = qmt.template_id
JOIN rabbitmq_queues q ON q.id = qmt.queue_id
JOIN rabbitmq_clusters c ON c.id = q.cluster_id
JOIN datadog_orgs d ON d.id = c.datadog_org_id AND d.is_active = 1
WHERE 1 = 1
ON DUPLICATE KEY UPDATE
  desired_revision = desired_revision + 1,
  status = IF(status = 'running', 'running', 'pending'),
  attempts = 0,
  reason = 'template_message_utf8_fixed',
  requested_by = 'sql-migration-010',
  last_error = NULL,
  next_retry_at = NULL;

SELECT COUNT(*) AS templates_corrigidos FROM rmp_fixed_template_ids;
DROP TEMPORARY TABLE rmp_fixed_template_ids;



-- ═══════════ 011_v0_5_6_2_datadog_reconciliation.sql ═══════════
-- Monitor Portal v0.5.6.2: tabelas aditivas. Executar uma vez no banco existente.
-- Não remove nem altera monitores, queues, templates ou dados persistidos.
CREATE TABLE IF NOT EXISTS datadog_reconcile_runs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  `trigger` VARCHAR(24) NOT NULL,
  requested_by VARCHAR(255) NOT NULL,
  stage VARCHAR(120) NOT NULL DEFAULT 'Aguardando worker',
  current_action TEXT NULL,
  total_orgs INT NOT NULL DEFAULT 0,
  processed_orgs INT NOT NULL DEFAULT 0,
  total_clusters INT NOT NULL DEFAULT 0,
  processed_clusters INT NOT NULL DEFAULT 0,
  total_queues INT NOT NULL DEFAULT 0,
  processed_queues INT NOT NULL DEFAULT 0,
  created INT NOT NULL DEFAULT 0,
  updated INT NOT NULL DEFAULT 0,
  recovered INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  untracked_remote INT NOT NULL DEFAULT 0,
  error_summary TEXT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  heartbeat_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_reconcile_run_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datadog_reconcile_clusters (
  run_id BIGINT NOT NULL,
  cluster_id BIGINT NOT NULL,
  cluster_name VARCHAR(255) NOT NULL,
  org_name VARCHAR(120) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  total_queues INT NOT NULL DEFAULT 0,
  processed_queues INT NOT NULL DEFAULT 0,
  current_queue VARCHAR(255) NULL,
  current_action VARCHAR(255) NULL,
  created INT NOT NULL DEFAULT 0,
  updated INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, cluster_id),
  CONSTRAINT fk_reconcile_clusters_run FOREIGN KEY (run_id) REFERENCES datadog_reconcile_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datadog_reconcile_control (
  id INT NOT NULL PRIMARY KEY,
  active_run_id BIGINT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO datadog_reconcile_control(id,active_run_id) VALUES (1,NULL)
  ON DUPLICATE KEY UPDATE id=VALUES(id);



-- ═══════════ 012_v0_5_6_2_portal_variables.sql ═══════════
-- Monitor Portal v0.5.6.2: converte somente variáveis legadas do Portal.
-- Preserva {{#is_alert}}, {{#is_recovery}}, {{value}} e outras variáveis nativas Datadog.
-- Idempotente. Backup recomendado antes de rodar.
UPDATE monitor_templates SET datadog_query_template = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(datadog_query_template, '{{rabbitmq_cluster.name}}', '[[rabbitmq_cluster.name]]'), '{{vhost.name}}', '[[vhost.name]]'), '{{queue.name}}', '[[queue.name]]'), '{{cluster_name}}', '[[cluster_name]]'), '{{vhost}}', '[[vhost]]'), '{{queue_name}}', '[[queue_name]]'), '{{public_reference_url}}', '[[public_reference_url]]'), '{{template_code}}', '[[template_code]]'), '{{template_name}}', '[[template_name]]'), '{{metric_messages}}', '[[metric_messages]]'), '{{metric_consumers}}', '[[metric_consumers]]'), '{{datadog_scope}}', '[[datadog_scope]]'), '{{threshold}}', '[[threshold]]'), '{{window}}', '[[window]]'), '{{service_name}}', '[[service_name]]'), '{{criticality}}', '[[criticality]]'), '{{journey}}', '[[journey]]'), '{{portal_public_base_url}}', '[[portal_public_base_url]]'), '{{rabbitmq_cluster_tag}}', '[[rabbitmq_cluster_tag]]') WHERE datadog_query_template IS NOT NULL;

UPDATE monitor_templates SET datadog_message_template = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(datadog_message_template, '{{rabbitmq_cluster.name}}', '[[rabbitmq_cluster.name]]'), '{{vhost.name}}', '[[vhost.name]]'), '{{queue.name}}', '[[queue.name]]'), '{{cluster_name}}', '[[cluster_name]]'), '{{vhost}}', '[[vhost]]'), '{{queue_name}}', '[[queue_name]]'), '{{public_reference_url}}', '[[public_reference_url]]'), '{{template_code}}', '[[template_code]]'), '{{template_name}}', '[[template_name]]'), '{{metric_messages}}', '[[metric_messages]]'), '{{metric_consumers}}', '[[metric_consumers]]'), '{{datadog_scope}}', '[[datadog_scope]]'), '{{threshold}}', '[[threshold]]'), '{{window}}', '[[window]]'), '{{service_name}}', '[[service_name]]'), '{{criticality}}', '[[criticality]]'), '{{journey}}', '[[journey]]'), '{{portal_public_base_url}}', '[[portal_public_base_url]]'), '{{rabbitmq_cluster_tag}}', '[[rabbitmq_cluster_tag]]') WHERE datadog_message_template IS NOT NULL;

UPDATE monitor_templates SET datadog_tags_template = CAST(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(CAST(datadog_tags_template AS CHAR CHARACTER SET utf8mb4), '{{rabbitmq_cluster.name}}', '[[rabbitmq_cluster.name]]'), '{{vhost.name}}', '[[vhost.name]]'), '{{queue.name}}', '[[queue.name]]'), '{{cluster_name}}', '[[cluster_name]]'), '{{vhost}}', '[[vhost]]'), '{{queue_name}}', '[[queue_name]]'), '{{public_reference_url}}', '[[public_reference_url]]'), '{{template_code}}', '[[template_code]]'), '{{template_name}}', '[[template_name]]'), '{{metric_messages}}', '[[metric_messages]]'), '{{metric_consumers}}', '[[metric_consumers]]'), '{{datadog_scope}}', '[[datadog_scope]]'), '{{threshold}}', '[[threshold]]'), '{{window}}', '[[window]]'), '{{service_name}}', '[[service_name]]'), '{{criticality}}', '[[criticality]]'), '{{journey}}', '[[journey]]'), '{{portal_public_base_url}}', '[[portal_public_base_url]]'), '{{rabbitmq_cluster_tag}}', '[[rabbitmq_cluster_tag]]') AS JSON) WHERE datadog_tags_template IS NOT NULL;



-- ═══════════ 013_v0_5_6_6_cluster_metrics_and_queue_index.sql ═══════════
-- v0.5.6.6 (MySQL 8.4). Executar UMA VEZ após 012. Sem DROP/TRUNCATE.
ALTER TABLE rabbitmq_clusters
  ADD COLUMN connection_type VARCHAR(32) NOT NULL DEFAULT 'management_api' AFTER business_line,
  ADD COLUMN metrics_endpoints TEXT NULL AFTER connection_type;

CREATE INDEX ix_queues_cluster_removed_vhost_name
  ON rabbitmq_queues (cluster_id, is_removed, vhost, name);

