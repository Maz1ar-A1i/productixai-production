<?php
// CORS headers for local/cross-origin API calls
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-License-Key, X-Organization-ID, X-API-Key");

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../db_config.php';

function get_kpi_db() {
    $db = get_db_connection();
    
    // Auto-create tables if missing
    try {
        $schema_file = __DIR__ . '/schema_kpi.sql';
        if (file_exists($schema_file)) {
            $sql = file_get_contents($schema_file);
            $db->exec($sql);
        }
    } catch (Exception $e) {
        error_log("KPI Table auto-migration notice: " . $e->getMessage());
    }
    
    return $db;
}

function check_kpi_auth() {
    // 1. Support API headers & params for headlessly connected apps
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $org_id = $_GET['org_id'] ?? $_POST['org_id'] ?? $headers['X-Organization-ID'] ?? $headers['x-organization-id'] ?? null;
    $license_key = $headers['X-License-Key'] ?? $headers['x-license-key'] ?? $_GET['license_key'] ?? null;
    
    if ($org_id || $license_key) {
        return [
            'user_id' => 1,
            'username' => 'api_client',
            'role' => 'api_client',
            'organization_id' => (int)($org_id ?? 1)
        ];
    }

    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    
    // Check if user is logged in via admin session or org user session
    if (isset($_SESSION['admin_logged_in']) || isset($_SESSION['org_user_logged_in'])) {
        return [
            'user_id' => $_SESSION['user_id'] ?? 1,
            'username' => $_SESSION['admin_user'] ?? $_SESSION['username'] ?? 'User',
            'role' => $_SESSION['role'] ?? 'org_admin',
            'organization_id' => $_SESSION['org_id'] ?? 1
        ];
    }

    // Default fallback for API calls: return organization 1 if requested via /api/
    if (strpos($_SERVER['REQUEST_URI'] ?? '', '/api/') !== false) {
        return [
            'user_id' => 1,
            'username' => 'api_default',
            'role' => 'api_client',
            'organization_id' => 1
        ];
    }
    
    header('Location: ../admin/login.php');
    exit;
}

