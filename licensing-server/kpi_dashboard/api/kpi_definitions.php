<?php
// kpi_dashboard/api/kpi_definitions.php
// JSON API for KPI Definitions (GET, POST, PUT, DELETE)

header('Content-Type: application/json');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/KPIEngine.php';

$user = check_kpi_auth();
$db = get_kpi_db();
$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $stmt = $db->prepare("
            SELECT k.*, 
                   s.value AS current_value, 
                   s.status AS current_status, 
                   s.trend AS current_trend, 
                   s.change_pct
            FROM kpi_definitions k
            LEFT JOIN (
                SELECT k1.*
                FROM kpi_snapshots k1
                INNER JOIN (
                    SELECT kpi_id, MAX(computed_at) AS max_date
                    FROM kpi_snapshots
                    GROUP BY kpi_id
                ) k2 ON k1.kpi_id = k2.kpi_id AND k1.computed_at = k2.max_date
            ) s ON k.id = s.kpi_id
            WHERE k.organization_id = ? AND k.is_active = 1
            ORDER BY k.created_at DESC
        ");
        $stmt->execute([$user['organization_id']]);
        $kpis = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode(['status' => 'success', 'data' => $kpis]);
        exit;
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

        $stmt = $db->prepare("
            INSERT INTO kpi_definitions 
            (organization_id, name, description, category, unit, computation_type, built_in_key, target_value, warning_threshold, critical_threshold, higher_is_better)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $user['organization_id'],
            $input['name'] ?? 'New KPI',
            $input['description'] ?? '',
            $input['category'] ?? 'Operational',
            $input['unit'] ?? '%',
            $input['computation_type'] ?? 'built_in',
            $input['built_in_key'] ?? null,
            $input['target_value'] ?? null,
            $input['warning_threshold'] ?? null,
            $input['critical_threshold'] ?? null,
            isset($input['higher_is_better']) ? (int)$input['higher_is_better'] : 1
        ]);

        $new_id = $db->lastInsertId();
        // Compute initial snapshot
        KPIEngine::computeAll($db, $user['organization_id']);

        echo json_encode(['status' => 'success', 'id' => $new_id, 'message' => 'KPI definition created']);
        exit;
    }

    if ($method === 'DELETE') {
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $db->prepare("UPDATE kpi_definitions SET is_active = 0 WHERE id = ? AND organization_id = ?");
            $stmt->execute([$id, $user['organization_id']]);
            echo json_encode(['status' => 'success', 'message' => 'KPI deleted']);
            exit;
        }
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'SERVER_ERROR', 'message' => $e->getMessage()]);
}
