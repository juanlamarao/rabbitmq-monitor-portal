-- v0.5.6.6 (MySQL 8.4). Executar UMA VEZ após 012. Sem DROP/TRUNCATE.
ALTER TABLE rabbitmq_clusters
  ADD COLUMN connection_type VARCHAR(32) NOT NULL DEFAULT 'management_api' AFTER business_line,
  ADD COLUMN metrics_endpoints TEXT NULL AFTER connection_type;

CREATE INDEX ix_queues_cluster_removed_vhost_name
  ON rabbitmq_queues (cluster_id, is_removed, vhost, name);
