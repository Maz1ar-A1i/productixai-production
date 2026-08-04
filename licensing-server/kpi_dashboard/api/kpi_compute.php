<?php
// kpi_dashboard/api/kpi_compute.php
// JSON API to compute all active KPIs and create snapshot records

header('Content-Type: application/json');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/KPIEngine.php';

$user = check_kpi_auth();
$db = get_kpi_db();

try {
    $results = KPIEngine::computeAll($db, $user['organization_id']);
    echo json_encode([
        'status' => 'success',
        'message' => 'KPI snapshot calculation completed',
        'timestamp' => date('Y-m-d H:i:s'),
        'results' => $results
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'COMPUTE_ERROR', 'message' => $e->getMessage()]);
}
