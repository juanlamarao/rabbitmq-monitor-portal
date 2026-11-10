-- v0.5.6.10 - Executar uma vez por banco DEV/UAT/PROD ANTES do deploy.
-- Não altera configurações existentes; mantém filtro cluster habilitado por padrão.
-- Fazer backup antes de executar. Não executar no banco criado pelo SQL completo 001.
ALTER TABLE rabbitmq_clusters
  ADD COLUMN datadog_use_cluster_dimension BOOLEAN NOT NULL DEFAULT TRUE AFTER datadog_cluster_tag_value,
  ADD COLUMN datadog_extra_dimensions JSON NULL AFTER datadog_use_cluster_dimension;
UPDATE rabbitmq_clusters
  SET datadog_extra_dimensions = JSON_ARRAY()
  WHERE datadog_extra_dimensions IS NULL;
ALTER TABLE rabbitmq_clusters
  MODIFY COLUMN datadog_extra_dimensions JSON NOT NULL;
