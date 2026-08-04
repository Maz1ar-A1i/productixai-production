<?php
// kpi_dashboard/config.php
// Configuration and Database connection loader for PHP KPI & Dashboard module

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
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    
    // Check if user is logged in via admin session or org user session
    if (!isset($_SESSION['admin_logged_in']) && !isset($_SESSION['org_user_logged_in'])) {
        // For API calls, return 401 JSON if requested via API
        if (strpos($_SERVER['REQUEST_URI'] ?? '', '/api/') !== false) {
            header('Content-Type: application/json');
            http_response_code(401);
            echo json_encode(['error' => 'UNAUTHORIZED', 'message' => 'Authentication required']);
            exit;
        }
        
        header('Location: ../admin/login.php');
        exit;
    }
    
    return [
        'user_id' => $_SESSION['user_id'] ?? 1,
        'username' => $_SESSION['admin_user'] ?? $_SESSION['username'] ?? 'User',
        'role' => $_SESSION['role'] ?? 'org_admin',
        'organization_id' => $_SESSION['org_id'] ?? 1
    ];
}
