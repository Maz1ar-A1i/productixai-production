<?php
// kpi_dashboard/api/dashboard.php
// JSON API returning real-time Dashboard Summary and KPI list for Frontend

header('Content-Type: application/json');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/KPIEngine.php';

$user = check_kpi_auth();
$db = get_kpi_db();
$org_id = (int)$user['organization_id'];

try {
    // Auto-seed default KPIs if org has no active KPIs
    KPIEngine::ensureBuiltInKPIs($db, $org_id);

    $category = $_GET['category'] ?? null;
    
    $sql = "
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
    ";
    $params = [$org_id];

    if (!empty($category)) {
        $sql .= " AND k.category = ?";
        $params[] = $category;
    }

    $sql .= " ORDER BY k.created_at DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $raw_kpis = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $dashboard_items = [];
    $total = count($raw_kpis);
    $on_track = 0;
    $warning = 0;
    $critical = 0;
    $no_data = 0;

    foreach ($raw_kpis as $k) {
        $status = $k['current_status'] ?? 'no_data';
        if ($status === 'on_track') $on_track++;
        else if ($status === 'warning') $warning++;
        else if ($status === 'critical') $critical++;
        else $no_data++;

        // Fetch last 6 snapshots for sparkline
        $spark_stmt = $db->prepare("
            SELECT value, computed_at
            FROM kpi_snapshots
            WHERE kpi_id = ?
            ORDER BY computed_at DESC
            LIMIT 6
        ");
        $spark_stmt->execute([$k['id']]);
        $history = array_reverse($spark_stmt->fetchAll(PDO::FETCH_ASSOC));

        $sparkline = array_map(function($h) {
            return [
                'period' => $h['computed_at'],
                'value' => $h['value'] !== null ? (float)$h['value'] : null
            ];
        }, $history);

        $k['id'] = (int)$k['id'];
        $k['organization_id'] = (int)$k['organization_id'];
        $k['target_value'] = $k['target_value'] !== null ? (float)$k['target_value'] : null;
        $k['warning_threshold'] = $k['warning_threshold'] !== null ? (float)$k['warning_threshold'] : null;
        $k['critical_threshold'] = $k['critical_threshold'] !== null ? (float)$k['critical_threshold'] : null;
        $k['current_value'] = $k['current_value'] !== null ? (float)$k['current_value'] : null;
        $k['change_pct'] = $k['change_pct'] !== null ? (float)$k['change_pct'] : null;
        $k['higher_is_better'] = (bool)$k['higher_is_better'];
        $k['sparkline'] = $sparkline;

        $dashboard_items[] = $k;
    }

    $summary_metrics = KPIEngine::computeDashboardSummary($db, $org_id);

    $response = [
        'summary' => [
            'total' => $total,
            'on_track' => $on_track,
            'warning' => $warning,
            'critical' => $critical,
            'no_data' => $no_data,
            'metrics' => $summary_metrics['metrics'] ?? []
        ],
        'kpis' => $dashboard_items
    ];

    echo json_encode($response);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'SERVER_ERROR', 'message' => $e->getMessage()]);
}
