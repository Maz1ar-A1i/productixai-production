<?php
// db_config.php
// Configuration settings for database and security parameters.
// All secret values MUST be set as server environment variables.
// Do NOT hardcode credentials here — this file is tracked by git.

// 1. Database Connection Credentials
// Set these in your server environment (cPanel, .env, Apache SetEnv, etc.)
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_USER', getenv('DB_USER') ?: '');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_NAME', getenv('DB_NAME') ?: '');

// 2. Security Configuration
// Shared HMAC signing key - MUST match the LICENSE_SIGNING_KEY in your Python client app
define('LICENSE_SIGNING_KEY', getenv('LICENSE_SIGNING_KEY') ?: '');

// Admin panel credentials for dashboard access
define('ADMIN_USER', getenv('ADMIN_USER') ?: 'admin');
define('ADMIN_PASS', getenv('ADMIN_PASS') ?: '');

// 3. Establish PDO Database Connection
function get_db_connection() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4";
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);

            // Auto-migrate database tables for password change tracking
            try {
                // Check if org_admins has requires_password_change
                $stmt = $pdo->query("SHOW COLUMNS FROM `org_admins` LIKE 'requires_password_change'");
                if (!$stmt->fetch()) {
                    $pdo->exec("ALTER TABLE `org_admins` ADD COLUMN `requires_password_change` TINYINT(1) NOT NULL DEFAULT 1");
                }
                
                // Check if org_users has requires_password_change
                $stmt = $pdo->query("SHOW COLUMNS FROM `org_users` LIKE 'requires_password_change'");
                if (!$stmt->fetch()) {
                    $pdo->exec("ALTER TABLE `org_users` ADD COLUMN `requires_password_change` TINYINT(1) NOT NULL DEFAULT 1");
                }
            } catch (Exception $e) {
                // Fail gracefully so connection is not blocked
                error_log("Licensing DB Auto-migration failed: " . $e->getMessage());
            }
        } catch (PDOException $e) {
            // Send clear error response
            header('Content-Type: application/json');
            http_response_code(500);
            echo json_encode([
                'valid' => false,
                'reason' => 'DATABASE_CONNECTION_ERROR',
                'details' => $e->getMessage()
            ]);
            exit;
        }
    }
    return $pdo;
}

// 4. Session Utility (if not already started)
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
