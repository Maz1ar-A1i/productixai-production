<?php
// kpi_dashboard/admin/index.php
// Main PHP Dashboard View

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/KPIEngine.php';

$user = check_kpi_auth();
$db = get_kpi_db();

// Compute latest dashboard summary
$summary = KPIEngine::computeDashboardSummary($db, $user['organization_id']);
$metrics = $summary['metrics'];

// Fetch KPI definitions with current values
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
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KPI & Dashboard Analytics (PHP)</title>
    <link rel="stylesheet" href="style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>

    <aside class="sidebar">
        <div class="brand">
            ⚡ ProductixAI PHP
        </div>
        <ul class="nav-menu">
            <li class="nav-item">
                <a href="index.php" class="nav-link active">📊 Dashboard</a>
            </li>
            <li class="nav-item">
                <a href="kpi_manager.php" class="nav-link">🎯 KPI Manager</a>
            </li>
            <li class="nav-item">
                <a href="../../admin/index.php" class="nav-link">🔑 Licensing Server</a>
            </li>
            <li class="nav-item" style="margin-top: auto;">
                <a href="../../admin/logout.php" class="nav-link">🚪 Logout</a>
            </li>
        </ul>
    </aside>

    <main class="main-content">
        <div class="header">
            <div>
                <h1><?= htmlspecialchars($summary['title']) ?></h1>
                <p><?= htmlspecialchars($summary['subtitle']) ?></p>
            </div>
            <button onclick="triggerCompute()" class="btn">⚡ Compute KPIs Now</button>
        </div>

        <div class="grid-metrics">
            <div class="metric-card">
                <div class="title">Total Active Products</div>
                <div class="value"><?= $metrics['total_products'] ?></div>
                <div class="subtitle">Across all org units</div>
            </div>
            <div class="metric-card">
                <div class="title">Active Data Hub Towers</div>
                <div class="value"><?= $metrics['running_batches'] ?></div>
                <div class="subtitle">Operational nodes</div>
            </div>
            <div class="metric-card">
                <div class="title">Total Output Units</div>
                <div class="value"><?= $metrics['total_output_units'] ?></div>
                <div class="subtitle">Units produced</div>
            </div>
            <div class="metric-card">
                <div class="title">Avg Cost / Unit</div>
                <div class="value"><?= $metrics['avg_cost_per_unit'] ?></div>
                <div class="subtitle">Expense ratio</div>
            </div>
            <div class="metric-card">
                <div class="title">Productivity Ratio</div>
                <div class="value"><?= $metrics['productivity_ratio'] ?></div>
                <div class="subtitle">Efficiency score</div>
            </div>
        </div>

        <div class="chart-container">
            <h3 style="margin-top:0;">Performance & Efficiency Trends</h3>
            <canvas id="kpiChart" height="100"></canvas>
        </div>

        <div class="chart-container">
            <h3 style="margin-top:0;">Active KPI Health Monitor</h3>
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
                        <th style="padding: 12px;">KPI Name</th>
                        <th>Category</th>
                        <th>Target</th>
                        <th>Current Value</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($kpis)): ?>
                        <tr><td colspan="5" style="padding: 16px; text-align: center; color: var(--text-muted);">No KPIs defined yet. Go to <a href="kpi_manager.php" style="color: var(--primary-color);">KPI Manager</a> to create one.</td></tr>
                    <?php else: ?>
                        <?php foreach ($kpis as $k): ?>
                            <tr style="border-bottom: 1px solid var(--border-color);">
                                <td style="padding: 14px; font-weight: 600;"><?= htmlspecialchars($k['name']) ?></td>
                                <td><?= htmlspecialchars($k['category']) ?></td>
                                <td><?= $k['target_value'] !== null ? htmlspecialchars($k['target_value']) . $k['unit'] : 'N/A' ?></td>
                                <td style="font-weight: 700; color: #fff;">
                                    <?= $k['current_value'] !== null ? number_format($k['current_value'], 2) . $k['unit'] : 'No data' ?>
                                </td>
                                <td>
                                    <span class="badge badge-<?= htmlspecialchars($k['current_status'] ?? 'no_data') ?>">
                                        <?= htmlspecialchars(str_replace('_', ' ', $k['current_status'] ?? 'no_data')) ?>
                                    </span>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </main>

    <script>
        const ctx = document.getElementById('kpiChart').getContext('2d');
        const kpiChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Productivity Ratio (%)',
                    data: [102, 108, 115, 110, 118, 124, 128],
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Cost per Unit ($)',
                    data: [6.2, 5.8, 5.5, 5.7, 5.1, 4.9, 4.8],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { labels: { color: '#94a3b8' } }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
                    y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
                }
            }
        });

        async function triggerCompute() {
            try {
                const res = await fetch('../api/kpi_compute.php', { method: 'POST' });
                const json = await res.json();
                alert(json.message || 'KPIs computed successfully!');
                window.location.reload();
            } catch (err) {
                alert('Error computing KPIs: ' + err);
            }
        }
    </script>
</body>
</html>
