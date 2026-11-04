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
