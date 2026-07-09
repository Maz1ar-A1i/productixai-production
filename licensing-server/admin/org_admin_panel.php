<?php
// admin/org_admin_panel.php
// Org Admin Dashboard — Create and manage Org Users within their limit

require_once __DIR__ . '/../db_config.php';

// ── Auth: Org Admin only ──
if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
    header('Location: login.php');
    exit;
}
if (($_SESSION['role'] ?? '') !== 'org_admin') {
    header('Location: index.php');
    exit;
}

$org_admin_id  = intval($_SESSION['org_admin_id'] ?? 0);
$org_admin_org = $_SESSION['org_admin_org'] ?? 'Your Organization';
$org_admin_user = $_SESSION['admin_user'] ?? '';

$db = get_db_connection();

try {
    // Fetch Org Admin info + current limit
    $oa_stmt = $db->prepare("SELECT id, organization_name, username, user_limit FROM org_admins WHERE id = ? LIMIT 1");
    $oa_stmt->execute([$org_admin_id]);
    $org_admin = $oa_stmt->fetch();

    if (!$org_admin) {
        session_destroy();
        header('Location: login.php');
        exit;
    }

    $user_limit = intval($org_admin['user_limit']);

    // Fetch all Org Users under this admin
    $users_stmt = $db->prepare("SELECT id, username, status, created_at FROM org_users WHERE org_admin_id = ? ORDER BY created_at DESC");
    $users_stmt->execute([$org_admin_id]);
    $org_users = $users_stmt->fetchAll();

    $users_count    = count($org_users);
    $limit_reached  = ($users_count >= $user_limit);
    $usage_pct      = ($user_limit > 0) ? min(100, round(($users_count / $user_limit) * 100)) : 0;
    $bar_color      = ($usage_pct >= 100) ? '#f43f5e' : (($usage_pct >= 80) ? '#f59e0b' : '#10b981');

} catch (Exception $e) {
    die("Database error: " . $e->getMessage());
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Productix | Org Admin Panel</title>
    <link rel="stylesheet" href="style.css">
    <script type="module" src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"></script>
    <script nomodule src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js"></script>
    <style>
        /* ── Org Panel Extras ── */
        .limit-card {
            background: var(--bg-glass);
            border: 1px solid var(--border-glass);
            backdrop-filter: blur(16px);
            border-radius: 20px;
            padding: 28px;
            margin-bottom: 32px;
        }

        .limit-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            flex-wrap: wrap;
        }

        .limit-numbers {
            font-size: 42px;
            font-weight: 700;
            letter-spacing: -1px;
        }

        .limit-label {
            font-size: 13px;
            color: var(--text-muted);
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
        }

        .limit-bar-track {
            width: 100%;
            height: 8px;
            background: rgba(255,255,255,0.07);
            border-radius: 100px;
            margin-top: 12px;
            overflow: hidden;
        }

        .limit-bar-fill {
            height: 100%;
            border-radius: 100px;
            transition: width 0.6s cubic-bezier(0.16,1,0.3,1);
        }

        .limit-warning {
            display: flex;
            align-items: center;
            gap: 10px;
            background: rgba(244,63,94,0.1);
            border: 1px solid rgba(244,63,94,0.25);
            border-radius: 12px;
            padding: 12px 16px;
            margin-top: 16px;
            font-size: 13px;
            color: #fda4af;
        }

        .limit-info {
            display: flex;
            align-items: center;
            gap: 10px;
            background: rgba(6,182,212,0.07);
            border: 1px solid rgba(6,182,212,0.2);
            border-radius: 12px;
            padding: 12px 16px;
            margin-top: 16px;
            font-size: 13px;
            color: var(--accent-cyan);
        }

        .org-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(139,92,246,0.15);
            border: 1px solid rgba(139,92,246,0.3);
            color: #a78bfa;
            padding: 4px 12px;
            border-radius: 100px;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
    </style>
</head>
<body>

    <div id="toastContainer" class="toast-container"></div>

    <div class="dashboard-container">

        <!-- Header -->
        <header class="nav-header">
            <div class="auth-logo" style="margin-bottom: 0;">
                <div class="logo-icon">PX</div>
                <div class="logo-text">
                    Productix
                    <span style="font-size: 14px; font-weight: 400; color: var(--accent-cyan);">Org Admin</span>
                </div>
            </div>
            <div class="user-profile">
                <div class="user-info">
                    <div class="user-name"><?php echo htmlspecialchars($org_admin_user); ?></div>
                    <div class="user-role">
                        <span class="org-badge">
                            <ion-icon name="business-outline" style="font-size: 11px;"></ion-icon>
                            <?php echo htmlspecialchars($org_admin['organization_name']); ?>
                        </span>
                    </div>
                </div>
                <a href="logout.php" class="btn-logout">Logout</a>
            </div>
        </header>

        <!-- ── User Limit Card ── -->
        <div class="limit-card">
            <div class="limit-row">
                <div style="flex: 1;">
                    <div class="limit-label">Users Created</div>
                    <div class="limit-numbers">
                        <span id="usersCount" style="color: <?php echo $bar_color; ?>;">
                            <?php echo $users_count; ?>
                        </span>
                        <span style="font-size: 24px; font-weight: 400; color: var(--text-muted);">
                            &nbsp;/&nbsp;<?php echo $user_limit; ?>
                        </span>
                    </div>
                    <div class="limit-bar-track">
                        <div class="limit-bar-fill" id="limitBar"
                             style="width: <?php echo $usage_pct; ?>%; background: <?php echo $bar_color; ?>;"></div>
                    </div>
                </div>

                <div style="text-align: right;">
                    <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">Remaining</div>
                    <div style="font-size: 32px; font-weight: 700; color: var(--text-primary);">
                        <?php echo max(0, $user_limit - $users_count); ?>
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted);">slots left</div>
                </div>
            </div>

            <?php if ($limit_reached): ?>
                <div class="limit-warning">
                    <ion-icon name="warning-outline" style="font-size: 18px; flex-shrink: 0;"></ion-icon>
                    <span>
                        User limit reached (<strong><?php echo $users_count; ?>/<?php echo $user_limit; ?></strong>).
                        Contact your Super Administrator to increase the limit.
                    </span>
                </div>
            <?php elseif ($usage_pct >= 80): ?>
                <div class="limit-info" style="background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.2); color: #fbbf24;">
                    <ion-icon name="alert-circle-outline" style="font-size: 18px; flex-shrink: 0;"></ion-icon>
                    <span>Approaching limit — <?php echo $user_limit - $users_count; ?> slot(s) remaining.</span>
                </div>
            <?php else: ?>
                <div class="limit-info">
                    <ion-icon name="information-circle-outline" style="font-size: 18px; flex-shrink: 0;"></ion-icon>
                    <span>You can create up to <strong><?php echo $user_limit; ?></strong> users. Limit set by Super Admin — contact them to increase.</span>
                </div>
            <?php endif; ?>
        </div>

        <!-- ── Users Table Card ── -->
        <div class="main-card">
            <div class="section-header">
                <div>
                    <h2 class="section-title">Organization Users</h2>
                    <p style="font-size: 14px; color: var(--text-muted); margin-top: 4px;">
                        Manage user accounts for <strong><?php echo htmlspecialchars($org_admin['organization_name']); ?></strong>
                    </p>
                </div>

                <button id="createUserBtn" class="btn-primary"
                        onclick="openModal('createUserModal')"
                        <?php echo $limit_reached ? 'disabled title="User limit reached. Contact Super Admin to increase." style=\'opacity:0.45; cursor:not-allowed;\'' : ''; ?>>
                    <ion-icon name="person-add-outline" style="font-size: 18px;"></ion-icon>
                    Create User
                </button>
            </div>

            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Username</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th style="text-align: right; padding-right: 24px;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="usersTableBody">
                        <?php if (empty($org_users)): ?>
                            <tr>
                                <td colspan="5" style="text-align: center; padding: 48px; color: var(--text-muted);">
                                    <ion-icon name="people-outline" style="font-size: 40px; display: block; margin: 0 auto 12px; opacity: 0.4;"></ion-icon>
                                    No users created yet. Click "Create User" to add your first user.
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php $i = 1; foreach ($org_users as $u): ?>
                            <tr id="user-row-<?php echo $u['id']; ?>">
                                <td style="color: var(--text-muted); font-size: 13px;"><?php echo $i++; ?></td>
                                <td>
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--accent-cyan)); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: white; flex-shrink: 0;">
                                            <?php echo strtoupper(substr($u['username'], 0, 1)); ?>
                                        </div>
                                        <span style="font-weight: 500; font-size: 15px;"><?php echo htmlspecialchars($u['username']); ?></span>
                                    </div>
                                </td>
                                <td>
                                    <span class="badge <?php echo $u['status'] === 'active' ? 'badge-active' : 'badge-revoked'; ?>">
                                        <?php echo ucfirst($u['status']); ?>
                                    </span>
                                </td>
                                <td style="font-size: 13px; color: var(--text-muted);">
                                    <?php echo date('Y-m-d H:i', strtotime($u['created_at'])); ?>
                                </td>
                                <td style="text-align: right; padding-right: 16px;">
                                    <div class="row-actions" style="justify-content: flex-end;">
                                        <button class="btn-icon delete" title="Delete User"
                                                onclick="deleteUser(<?php echo $u['id']; ?>, '<?php echo htmlspecialchars($u['username']); ?>')">
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

    <!-- Create User Modal -->
    <div id="createUserModal" class="modal-overlay">
        <div class="modal">
            <div class="modal-header">
                <h3 class="modal-title">Create New User</h3>
                <button class="btn-close" onclick="closeModal('createUserModal')">&times;</button>
            </div>
            <form id="createUserForm" onsubmit="handleCreateUser(event)" autocomplete="off">
                <div class="form-group">
                    <label class="form-label">Username</label>
                    <input type="text" name="username" class="form-input"
                           placeholder="e.g. john_doe" required autocomplete="off">
                </div>
                <div class="form-group">
                    <label class="form-label">Password</label>
                    <input type="password" name="password" class="form-input"
                           placeholder="Minimum 8 characters" required minlength="8" autocomplete="new-password">
                </div>
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 12px 14px; margin-bottom: 24px;">
                    <p style="font-size: 12px; color: var(--text-muted); line-height: 1.6;">
                        <ion-icon name="shield-checkmark-outline" style="vertical-align: middle; margin-right: 4px; color: var(--status-active);"></ion-icon>
                        Slots remaining: <strong id="slotsRemaining" style="color: var(--text-primary);"><?php echo max(0, $user_limit - $users_count); ?></strong>
                        of <?php echo $user_limit; ?> total.
                    </p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal('createUserModal')">Cancel</button>
                    <button type="submit" class="btn-primary">Create User</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        // ── State (synced from PHP) ──
        let usersCount = <?php echo $users_count; ?>;
        let userLimit  = <?php echo $user_limit; ?>;

        // ── Modal Helpers ──
        function openModal(id) { document.getElementById(id).classList.add('active'); }
        function closeModal(id) { document.getElementById(id).classList.remove('active'); }

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

        // ── Refresh UI limit state without page reload ──
        function refreshLimitUI(newCount, newLimit) {
            usersCount = newCount;
            userLimit  = newLimit;
            const pct  = Math.min(100, Math.round((newCount / newLimit) * 100));
            const color = pct >= 100 ? '#f43f5e' : (pct >= 80 ? '#f59e0b' : '#10b981');

            document.getElementById('usersCount').textContent = newCount;
            document.getElementById('usersCount').style.color = color;
            document.getElementById('limitBar').style.width = pct + '%';
            document.getElementById('limitBar').style.background = color;

            const slotsEl = document.getElementById('slotsRemaining');
            if (slotsEl) slotsEl.textContent = Math.max(0, newLimit - newCount);

            const btn = document.getElementById('createUserBtn');
            if (newCount >= newLimit) {
                btn.disabled = true;
                btn.style.opacity = '0.45';
                btn.style.cursor  = 'not-allowed';
                btn.title = 'User limit reached. Contact Super Admin to increase.';
            } else {
                btn.disabled = false;
                btn.style.opacity = '';
                btn.style.cursor  = '';
                btn.title = '';
            }
        }

        // ── AJAX: Create User ──
        function handleCreateUser(e) {
            e.preventDefault();

            if (usersCount >= userLimit) {
                showToast('User limit reached. Contact Super Admin.', 'error');
                closeModal('createUserModal');
                return;
            }

            const formData = new FormData(document.getElementById('createUserForm'));
            fetch('actions.php?action=create_org_user', { method: 'POST', body: formData })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        closeModal('createUserModal');
                        showToast(data.message, 'success');
                        // Refresh after short delay to show new user in table
                        setTimeout(() => location.reload(), 1000);
                    } else if (data.limit_reached) {
                        closeModal('createUserModal');
                        showToast(data.error, 'error');
                        refreshLimitUI(userLimit, userLimit); // lock the button
                    } else {
                        showToast(data.error || 'Failed to create user.', 'error');
                    }
                })
                .catch(() => showToast('Connection error.', 'error'));
        }

        // ── AJAX: Delete User ──
        function deleteUser(userId, username) {
            if (confirm(`Delete user "${username}"?\n\nThis action cannot be undone.`)) {
                const fd = new FormData();
                fd.append('user_id', userId);
                fetch('actions.php?action=delete_org_user', { method: 'POST', body: fd })
                    .then(r => r.json())
                    .then(data => {
                        if (data.success) {
                            showToast(data.message, 'success');
                            setTimeout(() => location.reload(), 800);
                        } else {
                            showToast(data.error || 'Delete failed.', 'error');
                        }
                    })
                    .catch(() => showToast('Connection error.', 'error'));
            }
        }
    </script>
</body>
</html>
