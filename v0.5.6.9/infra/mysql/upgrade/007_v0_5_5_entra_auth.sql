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
