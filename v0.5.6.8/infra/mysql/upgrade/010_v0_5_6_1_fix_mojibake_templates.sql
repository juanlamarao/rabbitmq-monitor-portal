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
