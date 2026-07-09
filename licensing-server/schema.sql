-- schema.sql
-- Database structure for Productix Licensing System
-- Run this on: hubtecho_license (localhost)

-- ──────────────────────────────────────────────────────────
-- 1. Organizations (for license key grouping — desktop app)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `organizations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL UNIQUE,
  `subscription_plan` VARCHAR(50) DEFAULT 'free',
  `status` VARCHAR(50) DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 2. Licenses (desktop app activation keys — unchanged)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `licenses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `license_key` VARCHAR(255) NOT NULL UNIQUE,
  `organization_id` INT DEFAULT NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'org_admin',
  `status` VARCHAR(50) NOT NULL DEFAULT 'active',
  `expires_at` DATETIME DEFAULT NULL,
  `bound_machine_id` VARCHAR(255) DEFAULT NULL,
  `first_used_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default Global Admin master key (kill switch)
INSERT INTO `licenses` (`license_key`, `role`, `status`, `expires_at`)
VALUES ('PRODUCTIX-GLOBAL-MASTER-KEY', 'global_admin', 'active', NULL)
ON DUPLICATE KEY UPDATE `license_key` = `license_key`;

-- Safe migration for existing installs
ALTER TABLE `licenses`
  ADD COLUMN IF NOT EXISTS `bound_machine_id` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `first_used_at` DATETIME DEFAULT NULL;

-- ──────────────────────────────────────────────────────────
-- 3. Org Admins (created by Super Admin — web panel only)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `org_admins` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `organization_name` VARCHAR(255) NOT NULL,
  `username` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,      -- bcrypt via PHP password_hash()
  `user_limit` INT NOT NULL DEFAULT 5,        -- max Org Users this admin can create
  `requires_password_change` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 4. Org Users (created by Org Admin — data records)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `org_users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `org_admin_id` INT NOT NULL,
  `username` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'active',
  `requires_password_change` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`org_admin_id`) REFERENCES `org_admins`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
