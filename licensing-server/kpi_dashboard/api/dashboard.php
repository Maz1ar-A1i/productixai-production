<?php
// kpi_dashboard/api/dashboard.php
// JSON API returning real-time Dashboard Summary

header('Content-Type: application/json');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/KPIEngine.php';

$user = check_kpi_auth();
$db = get_kpi_db();

try {
    $summary = KPIEngine::computeDashboardSummary($db, $user['organization_id']);
    echo json_encode($summary);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'SERVER_ERROR', 'message' => $e->getMessage()]);
}
