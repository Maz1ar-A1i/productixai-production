<?php
// kpi_dashboard/admin/kpi_manager.php
// KPI Management View for Admins

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/KPIEngine.php';

$user = check_kpi_auth();
$db = get_kpi_db();

$templates = KPIEngine::getBuiltInKPIs();

// Fetch existing active KPIs
$stmt = $db->prepare("SELECT * FROM kpi_definitions WHERE organization_id = ? AND is_active = 1 ORDER BY created_at DESC");
$stmt->execute([$user['organization_id']]);
$kpis = $stmt->fetchAll(PDO::FETCH_ASSOC);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KPI Manager (PHP)</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

    <aside class="sidebar">
        <div class="brand">
            ⚡ ProductixAI PHP
        </div>
        <ul class="nav-menu">
            <li class="nav-item">
                <a href="index.php" class="nav-link">📊 Dashboard</a>
            </li>
            <li class="nav-item">
                <a href="kpi_manager.php" class="nav-link active">🎯 KPI Manager</a>
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
                <h1>KPI Manager</h1>
                <p>Activate built-in KPI templates or define custom metric thresholds</p>
            </div>
        </div>

        <div class="chart-container">
            <h3 style="margin-top: 0;">Add Built-in KPI Template</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                <?php foreach ($templates as $key => $t): ?>
                    <div style="background: #0f172a; padding: 16px; border-radius: 8px; border: 1px solid var(--border-color);">
                        <h4 style="margin: 0 0 8px 0; color: #fff;"><?= htmlspecialchars($t['label']) ?></h4>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;"><?= htmlspecialchars($t['description']) ?></p>
                        <button onclick="addBuiltInKPI('<?= $key ?>', '<?= htmlspecialchars($t['label']) ?>', '<?= $t['unit'] ?>', '<?= $t['category'] ?>', <?= $t['default_target'] ?>, <?= $t['default_warning'] ?>, <?= $t['default_critical'] ?>)" class="btn" style="width: 100%; justify-content: center;">+ Activate Template</button>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="chart-container">
            <h3 style="margin-top: 0;">Active KPI Definitions</h3>
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
                        <th style="padding: 12px;">KPI Name</th>
                        <th>Category</th>
                        <th>Type</th>
                        <th>Target</th>
                        <th>Warning</th>
                        <th>Critical</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($kpis)): ?>
                        <tr><td colspan="7" style="padding: 16px; text-align: center; color: var(--text-muted);">No KPIs active yet. Choose a template above.</td></tr>
                    <?php else: ?>
                        <?php foreach ($kpis as $k): ?>
                            <tr style="border-bottom: 1px solid var(--border-color);">
                                <td style="padding: 14px; font-weight: 600;"><?= htmlspecialchars($k['name']) ?></td>
                                <td><?= htmlspecialchars($k['category']) ?></td>
                                <td><span class="badge" style="background: rgba(79, 70, 229, 0.2); color: #818cf8;"><?= htmlspecialchars($k['computation_type']) ?></span></td>
                                <td><?= $k['target_value'] !== null ? htmlspecialchars($k['target_value']) . $k['unit'] : '-' ?></td>
                                <td><?= $k['warning_threshold'] !== null ? htmlspecialchars($k['warning_threshold']) . $k['unit'] : '-' ?></td>
                                <td><?= $k['critical_threshold'] !== null ? htmlspecialchars($k['critical_threshold']) . $k['unit'] : '-' ?></td>
                                <td>
                                    <button onclick="deleteKPI(<?= $k['id'] ?>)" style="background: none; border: none; color: var(--danger); cursor: pointer; font-weight: 600;">Delete</button>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </main>

    <script>
        async function addBuiltInKPI(key, name, unit, category, target, warning, critical) {
            try {
                const res = await fetch('../api/kpi_definitions.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        computation_type: 'built_in',
                        built_in_key: key,
                        unit: unit,
                        category: category,
                        target_value: target,
                        warning_threshold: warning,
                        critical_threshold: critical
                    })
                });
                const json = await res.json();
                if (json.status === 'success') {
                    alert('KPI activated!');
                    window.location.reload();
                } else {
                    alert('Error: ' + json.message);
                }
            } catch (err) {
                alert('Error adding KPI: ' + err);
            }
        }

        async function deleteKPI(id) {
            if (!confirm('Are you sure you want to delete this KPI?')) return;
            try {
                const res = await fetch('../api/kpi_definitions.php?id=' + id, { method: 'DELETE' });
                const json = await res.json();
                if (json.status === 'success') {
                    window.location.reload();
                }
            } catch (err) {
                alert('Error deleting KPI: ' + err);
            }
        }
    </script>
</body>
</html>
