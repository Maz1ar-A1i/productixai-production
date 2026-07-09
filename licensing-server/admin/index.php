<?php
// admin/index.php
// Super Admin Dashboard — Org Admin Management + License Key Registry

require_once __DIR__ . '/../db_config.php';

// ── Auth: Super Admin only ──
if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
    header('Location: login.php');
    exit;
}
if (($_SESSION['role'] ?? '') !== 'super_admin') {
    header('Location: org_admin_panel.php');
    exit;
}

$db = get_db_connection();

// Auto-create tables if not present (safe for live deployments)
$db->exec("CREATE TABLE IF NOT EXISTS `org_admins` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `organization_name` VARCHAR(255) NOT NULL,
    `username` VARCHAR(100) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `user_limit` INT NOT NULL DEFAULT 5,
    `requires_password_change` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$db->exec("CREATE TABLE IF NOT EXISTS `org_users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `org_admin_id` INT NOT NULL,
    `username` VARCHAR(100) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'active',
    `requires_password_change` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`org_admin_id`) REFERENCES `org_admins`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

try {
    // ── Org Admin stats ──
    $org_admins_stmt = $db->query("
        SELECT oa.*,
               COUNT(ou.id) AS users_created
        FROM org_admins oa
        LEFT JOIN org_users ou ON ou.org_admin_id = oa.id
        GROUP BY oa.id
        ORDER BY oa.created_at DESC
    ");
    $org_admins = $org_admins_stmt->fetchAll();

    // ── License key stats ──
    $master_kill_stmt  = $db->query("SELECT status FROM licenses WHERE role = 'global_admin' LIMIT 1");
    $global_key        = $master_kill_stmt->fetch();
    $master_kill_active = ($global_key && $global_key['status'] === 'revoked');

    $total_count   = $db->query("SELECT COUNT(*) FROM licenses WHERE role != 'global_admin'")->fetchColumn();
    $active_count  = $db->query("SELECT COUNT(*) FROM licenses WHERE role != 'global_admin' AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())")->fetchColumn();
    $revoked_count = $db->query("SELECT COUNT(*) FROM licenses WHERE role != 'global_admin' AND status = 'revoked'")->fetchColumn();
    $expired_count = $db->query("SELECT COUNT(*) FROM licenses WHERE role != 'global_admin' AND (status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= NOW() AND status != 'revoked'))")->fetchColumn();
    $bound_count   = $db->query("SELECT COUNT(*) FROM licenses WHERE role != 'global_admin' AND bound_machine_id IS NOT NULL")->fetchColumn();

    $licenses_stmt = $db->query("
        SELECT l.*, o.name AS organization_name
        FROM licenses l
        LEFT JOIN organizations o ON l.organization_id = o.id
        WHERE l.role != 'global_admin'
        ORDER BY l.id DESC
    ");
    $licenses = $licenses_stmt->fetchAll();

} catch (Exception $e) {
    die("Database error: " . $e->getMessage());
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Productix | Super Admin Dashboard</title>
    <link rel="stylesheet" href="style.css">
    <script type="module" src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"></script>
    <script nomodule src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js"></script>
    <style>
        /* ── Org Admin Table Extras ── */
        .badge-bound   { background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); }
        .badge-unbound { background: rgba(99,102,241,0.15); color: #818cf8; border: 1px solid rgba(99,102,241,0.3); }
        .machine-id-short { font-family: monospace; font-size: 12px; color: var(--text-muted); }
        .btn-icon.unbind { color: #f59e0b; }
        .btn-icon.unbind:hover { background: rgba(245,158,11,0.15); color: #fbbf24; }

        /* ── Progress bar ── */
        .limit-bar-wrap { width: 100%; background: rgba(255,255,255,0.07); border-radius: 100px; height: 6px; margin-top: 6px; }
        .limit-bar-fill { height: 100%; border-radius: 100px; transition: width 0.4s ease; }

        /* ── Section separator ── */
        .section-divider {
            display: flex; align-items: center; gap: 16px;
            margin: 48px 0 32px; color: var(--text-muted); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;
        }
        .section-divider::before, .section-divider::after {
            content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.08);
        }

        /* ── Org admin card in table ── */
        .org-name-cell { font-weight: 600; font-size: 15px; }
        .org-user-count { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
    </style>
</head>
<body>

    <div id="toastContainer" class="toast-container"></div>

    <div class="dashboard-container">

        <!-- Header -->
        <header class="nav-header">
            <div class="auth-logo" style="margin-bottom: 0;">
                <div class="logo-icon">PX</div>
                <div class="logo-text">Productix <span style="font-size: 14px; font-weight: 400; color: var(--accent-cyan);">Super Admin</span></div>
            </div>
            <div class="user-profile">
                <div class="user-info">
                    <div class="user-name"><?php echo htmlspecialchars($_SESSION['admin_user']); ?></div>
                    <div class="user-role">Super Administrator</div>
                </div>
                <a href="logout.php" class="btn-logout">Logout</a>
            </div>
        </header>

        <!-- ══════════════════════════════════════════════════════ -->
        <!--  SECTION 1 — ORG ADMIN MANAGEMENT                    -->
        <!-- ══════════════════════════════════════════════════════ -->
        <div class="section-divider">Org Admin Management</div>

        <div class="main-card" style="margin-bottom: 40px;">
            <div class="section-header">
                <div>
                    <h2 class="section-title">Organization Administrators</h2>
                    <p style="font-size: 14px; color: var(--text-muted); margin-top: 4px;">Create Org Admin accounts and control their user creation limits</p>
                </div>
                <button class="btn-primary" onclick="openModal('createOrgAdminModal')">
                    <ion-icon name="person-add-outline" style="font-size: 18px;"></ion-icon>
                    Create Org Admin
                </button>
            </div>

            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Organization</th>
                            <th>Username</th>
                            <th>Users Created</th>
                            <th>User Limit</th>
                            <th>Created</th>
                            <th style="text-align: right; padding-right: 24px;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="orgAdminTableBody">
                        <?php if (empty($org_admins)): ?>
                            <tr>
                                <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
                                    No Org Admin accounts yet. Click "Create Org Admin" to add one.
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($org_admins as $oa):
                                $pct = ($oa['user_limit'] > 0) ? min(100, round(($oa['users_created'] / $oa['user_limit']) * 100)) : 0;
                                $barColor = ($pct >= 100) ? '#f43f5e' : (($pct >= 80) ? '#f59e0b' : '#10b981');
                            ?>
                            <tr>
                                <td>
                                    <div class="org-name-cell"><?php echo htmlspecialchars($oa['organization_name']); ?></div>
                                </td>
                                <td style="font-family: monospace; color: var(--accent-cyan);">
                                    <?php echo htmlspecialchars($oa['username']); ?>
                                </td>
                                <td>
                                    <span style="font-weight: 600;"><?php echo $oa['users_created']; ?></span>
                                    <span style="color: var(--text-muted); font-size: 13px;"> / <?php echo $oa['user_limit']; ?></span>
                                    <div class="limit-bar-wrap">
                                        <div class="limit-bar-fill" style="width: <?php echo $pct; ?>%; background: <?php echo $barColor; ?>;"></div>
                                    </div>
                                </td>
                                <td>
                                    <span style="font-weight: 600; font-size: 16px;"><?php echo $oa['user_limit']; ?></span>
                                    <span style="color: var(--text-muted); font-size: 12px;"> max users</span>
                                </td>
                                <td style="font-size: 13px; color: var(--text-muted);">
                                    <?php echo date('Y-m-d', strtotime($oa['created_at'])); ?>
                                </td>
                                <td style="text-align: right; padding-right: 16px;">
                                    <div class="row-actions" style="justify-content: flex-end;">
                                        <button class="btn-icon edit" title="Edit User Limit"
                                                onclick="openEditLimitModal(<?php echo $oa['id']; ?>, '<?php echo htmlspecialchars($oa['organization_name']); ?>', <?php echo $oa['user_limit']; ?>)">
                                            <ion-icon name="options-outline"></ion-icon>
                                        </button>
                                        <button class="btn-icon delete" title="Delete Org Admin"
                                                onclick="deleteOrgAdmin(<?php echo $oa['id']; ?>, '<?php echo htmlspecialchars($oa['username']); ?>')">
                                            <ion-icon name="trash-outline"></ion-icon>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- ══════════════════════════════════════════════════════ -->
        <!--  SECTION 2 — GLOBAL KILL SWITCH                      -->
        <!-- ══════════════════════════════════════════════════════ -->
        <div class="section-divider">System Controls</div>

        <div class="main-card" style="margin-bottom: 32px; padding: 24px; border-left: 4px solid <?php echo $master_kill_active ? 'var(--status-revoked)' : 'var(--status-active)'; ?>;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="font-size: 36px; display: flex; align-items: center; color: <?php echo $master_kill_active ? 'var(--status-revoked)' : 'var(--status-active)'; ?>;">
                        <ion-icon name="<?php echo $master_kill_active ? 'shield-half-outline' : 'shield-checkmark-outline'; ?>"></ion-icon>
                    </div>
                    <div>
                        <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">Global Master Kill Switch</h3>
                        <p style="font-size: 14px; color: var(--text-muted);">
                            <?php if ($master_kill_active): ?>
                                <span style="color: #fda4af; font-weight: 500;">ACTIVE: All license keys are suspended.</span> Client applications will reject all operations.
                            <?php else: ?>
                                <span style="color: #a7f3d0; font-weight: 500;">STANDBY: Grid operations running normally.</span> License validations processing individually.
                            <?php endif; ?>
                        </p>
                    </div>
                </div>
                <button type="button" class="btn-primary <?php echo $master_kill_active ? '' : 'btn-danger-outline'; ?>"
                        style="<?php echo $master_kill_active ? 'background: linear-gradient(135deg, #10b981, #059669); box-shadow: 0 4px 15px rgba(16,185,129,0.3);' : ''; ?>"
                        onclick="toggleMasterKill()">
                    <ion-icon name="power-outline"></ion-icon>
                    <span><?php echo $master_kill_active ? 'Restore Grid Operations' : 'Trigger Global Suspension'; ?></span>
                </button>
            </div>
        </div>

        <!-- ══════════════════════════════════════════════════════ -->
        <!--  SECTION 3 — LICENSE KEY REGISTRY                    -->
        <!-- ══════════════════════════════════════════════════════ -->
        <div class="section-divider">Desktop License Keys</div>

        <!-- Stats Grid -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-header"><span>Active Licenses</span><ion-icon name="checkmark-circle-outline" style="color: var(--status-active); font-size: 20px;"></ion-icon></div>
                <div class="stat-value"><?php echo $active_count; ?></div>
                <div class="stat-indicator stat-active"></div>
            </div>
            <div class="stat-card">
                <div class="stat-header"><span>Machine-Bound</span><ion-icon name="lock-closed-outline" style="color: #f59e0b; font-size: 20px;"></ion-icon></div>
                <div class="stat-value"><?php echo $bound_count; ?></div>
                <div class="stat-indicator" style="background: #f59e0b;"></div>
            </div>
            <div class="stat-card">
                <div class="stat-header"><span>Expired</span><ion-icon name="time-outline" style="color: var(--status-expired); font-size: 20px;"></ion-icon></div>
                <div class="stat-value"><?php echo $expired_count; ?></div>
                <div class="stat-indicator stat-expired"></div>
            </div>
            <div class="stat-card">
                <div class="stat-header"><span>Revoked</span><ion-icon name="ban-outline" style="color: var(--status-revoked); font-size: 20px;"></ion-icon></div>
                <div class="stat-value"><?php echo $revoked_count; ?></div>
                <div class="stat-indicator stat-revoked"></div>
            </div>
            <div class="stat-card">
                <div class="stat-header"><span>Total Registered</span><ion-icon name="key-outline" style="color: var(--accent-cyan); font-size: 20px;"></ion-icon></div>
                <div class="stat-value"><?php echo $total_count; ?></div>
                <div class="stat-indicator stat-suspended" style="background-color: var(--accent-cyan);"></div>
            </div>
        </div>

        <!-- License Table -->
        <div class="main-card">
            <div class="section-header">
                <div>
                    <h2 class="section-title">License Keys Registry</h2>
                    <p style="font-size: 14px; color: var(--text-muted); margin-top: 4px;">Desktop app activation keys — manage bindings, expiry, and status</p>
                </div>
                <div style="display: flex; gap: 16px; align-items: center;">
                    <input type="text" id="licenseSearch" class="search-input" placeholder="Search organization or key..." onkeyup="filterLicenses()">
                    <button class="btn-primary" onclick="openModal('createModal')">
                        <ion-icon name="add-circle-outline" style="font-size: 18px;"></ion-icon>
                        Generate Key
                    </button>
                </div>
            </div>

            <!-- Machine-lock info -->
            <div style="margin-bottom: 20px; padding: 14px 20px; border: 1px solid rgba(245,158,11,0.2); border-radius: 12px; background: rgba(245,158,11,0.05); display: flex; align-items: flex-start; gap: 12px;">
                <ion-icon name="information-circle-outline" style="font-size: 20px; color: #f59e0b; flex-shrink: 0; margin-top: 1px;"></ion-icon>
                <p style="font-size: 13px; color: var(--text-muted); line-height: 1.6;">
                    Each key permanently binds to the <strong>first machine</strong> that uses it (<code>MACHINE_MISMATCH</code> blocks others).
                    To transfer: use <strong>Unbind</strong> or generate a new key.
                </p>
            </div>

            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Organization</th>
                            <th>License Key</th>
                            <th>Status</th>
                            <th>Machine Binding</th>
                            <th>Expires At</th>
                            <th style="text-align: right; padding-right: 24px;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="licenseTableBody">
                        <?php if (empty($licenses)): ?>
                            <tr>
                                <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
                                    No license keys registered. Click "Generate Key" to issue one.
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($licenses as $lic):
                                $isExpired = !empty($lic['expires_at']) && (strtotime($lic['expires_at']) < time());
                                $statusBadgeClass = 'badge-active';
                                $statusLabel = 'Active';
                                if ($lic['status'] === 'revoked') { $statusBadgeClass = 'badge-revoked'; $statusLabel = 'Revoked'; }
                                elseif ($lic['status'] === 'expired' || $isExpired) { $statusBadgeClass = 'badge-expired'; $statusLabel = 'Expired'; }
                                $isBound = !empty($lic['bound_machine_id']);
                                $machineShort = $isBound ? substr($lic['bound_machine_id'], 0, 8) . '...' : 'Unbound';
                                $machineBadgeClass = $isBound ? 'badge-bound' : 'badge-unbound';
                                $firstUsedLabel = !empty($lic['first_used_at']) ? date('Y-m-d H:i', strtotime($lic['first_used_at'])) : '—';
                            ?>
                            <tr data-org="<?php echo htmlspecialchars($lic['organization_name'] ?? ''); ?>" data-key="<?php echo htmlspecialchars($lic['license_key']); ?>">
                                <td style="font-weight: 500; font-size: 15px;"><?php echo htmlspecialchars($lic['organization_name'] ?? 'Unassigned'); ?></td>
                                <td>
                                    <span class="key-code" onclick="copyToClipboard('<?php echo htmlspecialchars($lic['license_key']); ?>')">
                                        <?php echo htmlspecialchars($lic['license_key']); ?>
                                        <ion-icon name="copy-outline" style="font-size: 12px; margin-left: 4px; vertical-align: middle;"></ion-icon>
                                    </span>
                                </td>
                                <td><span class="badge <?php echo $statusBadgeClass; ?>"><?php echo $statusLabel; ?></span></td>
                                <td>
                                    <span class="badge <?php echo $machineBadgeClass; ?>"
                                          title="<?php echo $isBound ? htmlspecialchars('Machine: '.$lic['bound_machine_id'].' | First: '.$firstUsedLabel) : 'No machine has claimed this key yet'; ?>"
                                          style="cursor: help; display: inline-flex; align-items: center; gap: 4px;">
                                        <ion-icon name="<?php echo $isBound ? 'lock-closed-outline' : 'lock-open-outline'; ?>" style="font-size: 11px;"></ion-icon>
                                        <?php echo $isBound ? $machineShort : 'Unbound'; ?>
                                    </span>
                                    <?php if ($isBound): ?>
                                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">First used: <?php echo $firstUsedLabel; ?></div>
                                    <?php endif; ?>
                                </td>
                                <td style="font-family: monospace; font-size: 13px; color: <?php echo $isExpired ? 'var(--status-revoked)' : 'var(--text-primary)'; ?>;">
                                    <?php echo $lic['expires_at'] ? date('Y-m-d H:i', strtotime($lic['expires_at'])) : 'Never'; ?>
                                </td>
                                <td style="text-align: right; padding-right: 16px;">
                                    <div class="row-actions" style="justify-content: flex-end;">
                                        <?php if ($lic['status'] === 'revoked'): ?>
                                            <button class="btn-icon reactivate" title="Reactivate" onclick="reactivateLicense(<?php echo $lic['id']; ?>)">
                                                <ion-icon name="checkmark-circle-outline"></ion-icon>
                                            </button>
                                        <?php else: ?>
                                            <button class="btn-icon revoke" title="Revoke" onclick="revokeLicense(<?php echo $lic['id']; ?>)">
                                                <ion-icon name="ban-outline"></ion-icon>
                                            </button>
                                        <?php endif; ?>
                                        <?php if ($isBound): ?>
                                            <button class="btn-icon unbind" title="Clear Machine Binding" onclick="unbindLicense(<?php echo $lic['id']; ?>, '<?php echo htmlspecialchars($lic['organization_name'] ?? ''); ?>')">
                                                <ion-icon name="unlink-outline"></ion-icon>
                                            </button>
                                        <?php endif; ?>
                                        <button class="btn-icon edit" title="Extend Duration" onclick="openExtendModal(<?php echo $lic['id']; ?>, '<?php echo htmlspecialchars($lic['organization_name'] ?? ''); ?>')">
                                            <ion-icon name="time-outline"></ion-icon>
                                        </button>
                                        <button class="btn-icon delete" title="Delete Permanently" onclick="deleteLicense(<?php echo $lic['id']; ?>)">
                                            <ion-icon name="trash-outline"></ion-icon>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!--  MODALS                                                    -->
    <!-- ═══════════════════════════════════════════════════════════ -->

    <!-- Create Org Admin Modal -->
    <div id="createOrgAdminModal" class="modal-overlay">
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title">Create Org Admin Account</h3>
                <button class="btn-close" onclick="closeModal('createOrgAdminModal')">&times;</button>
            </div>
            <form id="createOrgAdminForm" onsubmit="handleCreateOrgAdmin(event)">
                <div class="form-group">
                    <label class="form-label">Organization Name</label>
                    <input type="text" name="organization_name" class="form-input" placeholder="e.g. Acme Corporation" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Username</label>
                    <input type="text" name="username" class="form-input" placeholder="e.g. acme_admin" required autocomplete="off">
                </div>
                <div class="form-group">
                    <label class="form-label">Temporary Password</label>
                    <input type="password" name="password" class="form-input" placeholder="Set a temporary password" required autocomplete="new-password" minlength="8">
                </div>
                <div class="form-group">
                    <label class="form-label">User Creation Limit <span style="color: var(--text-muted); font-weight: 400;">(max Org Users they can create)</span></label>
                    <input type="number" name="user_limit" class="form-input" value="10" min="1" max="1000" required>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal('createOrgAdminModal')">Cancel</button>
                    <button type="submit" class="btn-primary">Create Account</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Edit User Limit Modal -->
    <div id="editLimitModal" class="modal-overlay">
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title">Update User Creation Limit</h3>
                <button class="btn-close" onclick="closeModal('editLimitModal')">&times;</button>
            </div>
            <form id="editLimitForm" onsubmit="handleUpdateLimit(event)">
                <input type="hidden" id="editLimitOrgAdminId" name="org_admin_id">
                <div class="form-group">
                    <label class="form-label">Organization</label>
                    <div id="editLimitOrgLabel" style="font-weight: 600; font-size: 16px; margin-top: 4px; color: var(--accent-cyan);"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">New User Limit</label>
                    <input type="number" id="editLimitValue" name="user_limit" class="form-input" min="1" max="1000" required>
                    <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">Only Super Admin can change this value.</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal('editLimitModal')">Cancel</button>
                    <button type="submit" class="btn-primary">Update Limit</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Generate License Modal -->
    <div id="createModal" class="modal-overlay">
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title">Generate Desktop License Key</h3>
                <button class="btn-close" onclick="closeModal('createModal')">&times;</button>
            </div>
            <form id="createLicenseForm" onsubmit="handleCreateLicense(event)">
                <div class="form-group">
                    <label class="form-label">Customer Organization Name</label>
                    <input type="text" id="organizationName" name="organization_name" class="form-input" placeholder="e.g. Acme Corp" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Duration Days <span style="color: var(--text-muted); font-weight: 400;">(0 = never expires)</span></label>
                    <input type="number" id="durationDays" name="duration_days" class="form-input" value="30" min="0" required>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal('createModal')">Cancel</button>
                    <button type="submit" class="btn-primary">Generate &amp; Issue</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Extend Duration Modal -->
    <div id="extendModal" class="modal-overlay">
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title">Extend License Key</h3>
                <button class="btn-close" onclick="closeModal('extendModal')">&times;</button>
            </div>
            <form id="extendLicenseForm" onsubmit="handleExtendLicense(event)">
                <input type="hidden" id="extendLicenseId" name="id">
                <div class="form-group">
                    <label class="form-label">Customer</label>
                    <div id="extendOrgLabel" style="font-weight: 600; font-size: 16px; margin-top: 4px; color: var(--accent-cyan);"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">Add Duration (Days)</label>
                    <input type="number" id="extendDays" name="days" class="form-input" value="30" min="1" required>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal('extendModal')">Cancel</button>
                    <button type="submit" class="btn-primary">Apply Extension</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        // ── Modal Helpers ──
        function openModal(id) { document.getElementById(id).classList.add('active'); }
        function closeModal(id) { document.getElementById(id).classList.remove('active'); }

        function openExtendModal(id, orgName) {
            document.getElementById('extendLicenseId').value = id;
            document.getElementById('extendOrgLabel').innerText = orgName;
            openModal('extendModal');
        }

        function openEditLimitModal(id, orgName, currentLimit) {
            document.getElementById('editLimitOrgAdminId').value = id;
            document.getElementById('editLimitOrgLabel').innerText = orgName;
            document.getElementById('editLimitValue').value = currentLimit;
            openModal('editLimitModal');
        }

        // ── Toast ──
        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            const iconName = type === 'success' ? 'checkmark-circle' : 'alert-circle';
            toast.innerHTML = `<ion-icon name="${iconName}" style="font-size: 20px; flex-shrink: 0;"></ion-icon><span>${message}</span>`;
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.animation = 'slideUp 0.3s ease reverse forwards';
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }

        // ── Search ──
        function filterLicenses() {
            const query = document.getElementById('licenseSearch').value.toLowerCase();
            document.querySelectorAll('#licenseTableBody tr').forEach(row => {
                const org = row.getAttribute('data-org') || '';
                const key = row.getAttribute('data-key') || '';
                row.style.display = (org.toLowerCase().includes(query) || key.toLowerCase().includes(query)) ? '' : 'none';
            });
        }

        // ── Clipboard ──
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text)
                .then(() => showToast('License key copied!', 'success'))
                .catch(() => showToast('Copy failed.', 'error'));
        }

        // ── AJAX: Create Org Admin ──
        function handleCreateOrgAdmin(e) {
            e.preventDefault();
            const formData = new FormData(document.getElementById('createOrgAdminForm'));
            fetch('actions.php?action=create_org_admin', { method: 'POST', body: formData })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        closeModal('createOrgAdminModal');
                        showToast(data.message, 'success');
                        setTimeout(() => location.reload(), 1200);
                    } else {
                        showToast(data.error || 'Failed to create Org Admin.', 'error');
                    }
                })
                .catch(() => showToast('Connection error.', 'error'));
        }

        // ── AJAX: Update Org Admin Limit ──
        function handleUpdateLimit(e) {
            e.preventDefault();
            const formData = new FormData(document.getElementById('editLimitForm'));
            fetch('actions.php?action=update_org_admin_limit', { method: 'POST', body: formData })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        closeModal('editLimitModal');
                        showToast(data.message, 'success');
                        setTimeout(() => location.reload(), 1200);
                    } else {
                        showToast(data.error || 'Failed to update limit.', 'error');
                    }
                })
                .catch(() => showToast('Connection error.', 'error'));
        }

        // ── AJAX: Delete Org Admin ──
        function deleteOrgAdmin(id, username) {
            if (confirm(`Delete Org Admin "${username}"?\n\nThis will also delete all their Org Users. This cannot be undone.`)) {
                const fd = new FormData();
                fd.append('org_admin_id', id);
                fetch('actions.php?action=delete_org_admin', { method: 'POST', body: fd })
                    .then(r => r.json())
                    .then(data => {
                        if (data.success) { showToast(data.message, 'success'); setTimeout(() => location.reload(), 1000); }
                        else { showToast(data.error || 'Delete failed.', 'error'); }
                    })
                    .catch(() => showToast('Connection error.', 'error'));
            }
        }

        // ── AJAX: Toggle master kill switch ──
        function toggleMasterKill() {
            if (confirm('WARNING: Toggle the Global Master Kill Switch?\n\nThis will immediately suspend or restore all client applications.')) {
                const fd = new FormData(); fd.append('toggle', 'true');
                fetch('actions.php?action=toggle_kill', { method: 'POST', body: fd })
                    .then(r => r.json())
                    .then(data => {
                        if (data.success) { showToast(data.message, 'success'); setTimeout(() => location.reload(), 1000); }
                        else { showToast(data.error || 'Failed.', 'error'); }
                    })
                    .catch(() => showToast('Connection error.', 'error'));
            }
        }

        // ── AJAX: Create license ──
        function handleCreateLicense(e) {
            e.preventDefault();
            const formData = new FormData(document.getElementById('createLicenseForm'));
            fetch('actions.php?action=create', { method: 'POST', body: formData })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        closeModal('createModal');
                        showToast(`Key generated: ${data.license.license_key}`, 'success');
                        setTimeout(() => location.reload(), 1500);
                    } else { showToast(data.error || 'Failed.', 'error'); }
                })
                .catch(() => showToast('Connection error.', 'error'));
        }

        // ── AJAX: Revoke license ──
        function revokeLicense(id) {
            if (confirm('Revoke this license? Client access will be blocked immediately.')) {
                const fd = new FormData(); fd.append('id', id);
                fetch('actions.php?action=revoke', { method: 'POST', body: fd })
                    .then(r => r.json())
                    .then(data => {
                        if (data.success) { showToast(data.message, 'success'); setTimeout(() => location.reload(), 1000); }
                        else { showToast(data.error || 'Failed.', 'error'); }
                    })
                    .catch(() => showToast('Connection error.', 'error'));
            }
        }

        // ── AJAX: Reactivate license ──
        function reactivateLicense(id) {
            const fd = new FormData(); fd.append('id', id);
            fetch('actions.php?action=reactivate', { method: 'POST', body: fd })
                .then(r => r.json())
                .then(data => {
                    if (data.success) { showToast(data.message, 'success'); setTimeout(() => location.reload(), 1000); }
                    else { showToast(data.error || 'Failed.', 'error'); }
                })
                .catch(() => showToast('Connection error.', 'error'));
        }

        // ── AJAX: Unbind license ──
        function unbindLicense(id, orgName) {
            if (confirm(`Clear machine binding for "${orgName}"?\n\nAny machine can claim this key on next use.`)) {
                const fd = new FormData(); fd.append('id', id);
                fetch('actions.php?action=unbind', { method: 'POST', body: fd })
                    .then(r => r.json())
                    .then(data => {
                        if (data.success) { showToast(data.message, 'success'); setTimeout(() => location.reload(), 1000); }
                        else { showToast(data.error || 'Failed.', 'error'); }
                    })
                    .catch(() => showToast('Connection error.', 'error'));
            }
        }

        // ── AJAX: Extend license ──
        function handleExtendLicense(e) {
            e.preventDefault();
            const formData = new FormData(document.getElementById('extendLicenseForm'));
            fetch('actions.php?action=extend', { method: 'POST', body: formData })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        closeModal('extendModal');
                        showToast(data.message, 'success');
                        setTimeout(() => location.reload(), 1000);
                    } else { showToast(data.error || 'Failed.', 'error'); }
                })
                .catch(() => showToast('Connection error.', 'error'));
        }

        // ── AJAX: Delete license ──
        function deleteLicense(id) {
            if (confirm('PERMANENTLY DELETE this license key? This cannot be undone.')) {
                const fd = new FormData(); fd.append('id', id);
                fetch('actions.php?action=delete', { method: 'POST', body: fd })
                    .then(r => r.json())
                    .then(data => {
                        if (data.success) { showToast(data.message, 'success'); setTimeout(() => location.reload(), 1000); }
                        else { showToast(data.error || 'Failed.', 'error'); }
                    })
                    .catch(() => showToast('Connection error.', 'error'));
            }
        }
    </script>
</body>
</html>
