-- Executar UMA vez em cada banco DEV/UAT/PROD ANTES do deploy (backup recomendado).
-- Compatível com MySQL 8.4. Não remove nem sobrescreve configuração existente.
ALTER TABLE rabbitmq_queues
 ADD COLUMN notify_sre_ops BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN notify_ccbp BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN notify_vicci BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN vicci_email VARCHAR(255) NULL;
ALTER TABLE monitor_templates
 ADD COLUMN datadog_actions_placeholder VARCHAR(120) NOT NULL DEFAULT '[[acionamentos]]';
CREATE TABLE IF NOT EXISTS datadog_webhook_templates (
 kind VARCHAR(16) NOT NULL PRIMARY KEY,
 name VARCHAR(120) NOT NULL,
 url VARCHAR(2048) NOT NULL DEFAULT '',
 payload TEXT NOT NULL,
 custom_headers TEXT NOT NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS datadog_webhook_org_states (
 org_id BIGINT UNSIGNED NOT NULL,
 kind VARCHAR(16) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'unknown',
 remote_name VARCHAR(120) NULL,
 last_error TEXT NULL,
 checked_at DATETIME NULL,
 PRIMARY KEY(org_id,kind),
 CONSTRAINT fk_webhook_org FOREIGN KEY(org_id) REFERENCES datadog_orgs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO datadog_webhook_templates(kind,name,url,payload,custom_headers)
VALUES ('sre_ops','SRE-OPS','','{}','{}'),('ccbp','CCBP','','{}','{}'),('vicci','VICCI','','{}','{}');
