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
