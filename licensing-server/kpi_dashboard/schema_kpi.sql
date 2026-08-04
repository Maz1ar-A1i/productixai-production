-- SQL Schema Migration for PHP KPI & Dashboard Engine
-- Compatible with MySQL 5.7+ / 8.0+

CREATE TABLE IF NOT EXISTS `kpi_definitions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `organization_id` INT NOT NULL DEFAULT 1,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(100) NOT NULL DEFAULT 'general',
    `unit` VARCHAR(50) NOT NULL DEFAULT '%',
    `computation_type` VARCHAR(50) NOT NULL DEFAULT 'built_in', -- 'built_in' or 'formula'
    `built_in_key` VARCHAR(100) NULL,
    `formula_id` INT NULL,
    `target_value` DECIMAL(12,4) NULL,
    `warning_threshold` DECIMAL(12,4) NULL,
    `critical_threshold` DECIMAL(12,4) NULL,
    `higher_is_better` TINYINT(1) NOT NULL DEFAULT 1,
    `granularity` VARCHAR(50) NOT NULL DEFAULT 'monthly',
    `product_id` INT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `kpi_snapshots` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `kpi_id` INT NOT NULL,
    `value` DECIMAL(14,4) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'no_data', -- 'on_track', 'warning', 'critical', 'no_data'
    `trend` VARCHAR(50) NULL,                        -- 'up', 'down', 'stable'
    `change_pct` DECIMAL(8,2) NULL,
    `computed_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`kpi_id`) REFERENCES `kpi_definitions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `product_data_records` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `organization_id` INT NOT NULL DEFAULT 1,
    `product_id` INT NOT NULL DEFAULT 1,
    `record_date` DATE NOT NULL,
    `data` JSON NOT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
