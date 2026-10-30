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
