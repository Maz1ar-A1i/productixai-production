<?php
// admin/actions.php
// AJAX Actions handler — Super Admin + Org Admin operations
// All role checks are enforced server-side; frontend state is UX only.

require_once __DIR__ . '/../db_config.php';

// ── Session Auth Check ──
if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Unauthorized. Please log in.']);
    exit;
}

header('Content-Type: application/json');

$action = isset($_GET['action']) ? trim($_GET['action']) : '';
$role   = $_SESSION['role'] ?? 'super_admin'; // 'super_admin' or 'org_admin'

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed. Use POST.']);
    exit;
}

// ── Helpers ──
function require_super_admin(string $role): void {
    if ($role !== 'super_admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden. Super Admin access required.']);
        exit;
    }
}

function require_org_admin(string $role): void {
    if ($role !== 'org_admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden. Org Admin access required.']);
        exit;
    }
}

function generate_license_key(): string {
    $bytes = random_bytes(8);
    $hex   = strtoupper(bin2hex($bytes));
    return 'PX-' . substr($hex, 0, 4) . '-' . substr($hex, 4, 4) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4);
}

$db = get_db_connection();

try {
    switch ($action) {

        // ══════════════════════════════════════════════════════
        //  SUPER ADMIN — Org Admin Management
        // ══════════════════════════════════════════════════════

        case 'create_org_admin':
            require_super_admin($role);

            $org_name   = trim($_POST['organization_name'] ?? '');
            $username   = trim($_POST['username'] ?? '');
            $password   = $_POST['password'] ?? '';
            $user_limit = max(1, intval($_POST['user_limit'] ?? 10));

            if (empty($org_name) || empty($username) || empty($password)) {
                http_response_code(400);
                echo json_encode(['error' => 'Organization name, username, and password are all required.']);
                exit;
            }

            if (strlen($password) < 8) {
                http_response_code(400);
                echo json_encode(['error' => 'Password must be at least 8 characters.']);
                exit;
            }

            // Check username uniqueness
            $check = $db->prepare("SELECT id FROM org_admins WHERE username = ? LIMIT 1");
            $check->execute([$username]);
            if ($check->fetch()) {
                http_response_code(409);
                echo json_encode(['error' => "Username \"{$username}\" is already taken."]); 
                exit;
            }

            $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
            $stmt = $db->prepare("INSERT INTO org_admins (organization_name, username, password_hash, user_limit) VALUES (?, ?, ?, ?)");
            $stmt->execute([$org_name, $username, $hash, $user_limit]);

            echo json_encode([
                'success' => true,
                'message' => "Org Admin \"{$username}\" created for {$org_name} (limit: {$user_limit} users)."
            ]);
            break;

        case 'update_org_admin_limit':
            require_super_admin($role);

            $org_admin_id = intval($_POST['org_admin_id'] ?? 0);
            $user_limit   = max(1, intval($_POST['user_limit'] ?? 0));

            if ($org_admin_id <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid Org Admin ID.']);
                exit;
            }

            $stmt = $db->prepare("SELECT id, organization_name FROM org_admins WHERE id = ? LIMIT 1");
            $stmt->execute([$org_admin_id]);
            $oa = $stmt->fetch();

            if (!$oa) {
                http_response_code(404);
                echo json_encode(['error' => 'Org Admin not found.']);
                exit;
            }

            $db->prepare("UPDATE org_admins SET user_limit = ? WHERE id = ?")->execute([$user_limit, $org_admin_id]);

            echo json_encode([
                'success' => true,
                'message' => "User limit for \"{$oa['organization_name']}\" updated to {$user_limit}."
            ]);
            break;

        case 'delete_org_admin':
            require_super_admin($role);

            $org_admin_id = intval($_POST['org_admin_id'] ?? 0);

            if ($org_admin_id <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid Org Admin ID.']);
                exit;
            }

            $stmt = $db->prepare("SELECT username FROM org_admins WHERE id = ? LIMIT 1");
            $stmt->execute([$org_admin_id]);
            $oa = $stmt->fetch();

            if (!$oa) {
                http_response_code(404);
                echo json_encode(['error' => 'Org Admin not found.']);
                exit;
            }

            // CASCADE deletes their org_users automatically (FK constraint)
            $db->prepare("DELETE FROM org_admins WHERE id = ?")->execute([$org_admin_id]);

            echo json_encode([
                'success' => true,
                'message' => "Org Admin \"{$oa['username']}\" and all their users have been deleted."
            ]);
            break;

        // ══════════════════════════════════════════════════════
        //  ORG ADMIN — User Management
        // ══════════════════════════════════════════════════════

        case 'create_org_user':
            require_org_admin($role);

            $org_admin_id = intval($_SESSION['org_admin_id'] ?? 0);
            $username     = trim($_POST['username'] ?? '');
            $password     = $_POST['password'] ?? '';

            if (empty($username) || empty($password)) {
                http_response_code(400);
                echo json_encode(['error' => 'Username and password are required.']);
                exit;
            }

            if (strlen($password) < 8) {
                http_response_code(400);
                echo json_encode(['error' => 'Password must be at least 8 characters.']);
                exit;
            }

            // ── SERVER-SIDE limit check (tamper-proof) ──
            $limit_stmt = $db->prepare("SELECT user_limit FROM org_admins WHERE id = ? LIMIT 1");
            $limit_stmt->execute([$org_admin_id]);
            $oa = $limit_stmt->fetch();

            if (!$oa) {
                http_response_code(403);
                echo json_encode(['error' => 'Org Admin account not found.']);
                exit;
            }

            $count_stmt = $db->prepare("SELECT COUNT(*) FROM org_users WHERE org_admin_id = ?");
            $count_stmt->execute([$org_admin_id]);
            $current_count = intval($count_stmt->fetchColumn());

            if ($current_count >= $oa['user_limit']) {
                http_response_code(403);
                echo json_encode([
                    'error'   => "User creation limit reached ({$current_count}/{$oa['user_limit']}). Contact Super Admin to increase your limit.",
                    'limit_reached' => true
                ]);
                exit;
            }

            // Check username uniqueness
            $check = $db->prepare("SELECT id FROM org_users WHERE username = ? LIMIT 1");
            $check->execute([$username]);
            if ($check->fetch()) {
                http_response_code(409);
                echo json_encode(['error' => "Username \"{$username}\" is already taken."]);
                exit;
            }

            $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
            $stmt = $db->prepare("INSERT INTO org_users (org_admin_id, username, password_hash) VALUES (?, ?, ?)");
            $stmt->execute([$org_admin_id, $username, $hash]);

            $new_count = $current_count + 1;
            echo json_encode([
                'success'     => true,
                'message'     => "User \"{$username}\" created successfully.",
                'users_count' => $new_count,
                'user_limit'  => $oa['user_limit'],
                'limit_reached' => ($new_count >= $oa['user_limit'])
            ]);
            break;

        case 'delete_org_user':
            require_org_admin($role);

            $org_admin_id = intval($_SESSION['org_admin_id'] ?? 0);
            $user_id      = intval($_POST['user_id'] ?? 0);

            if ($user_id <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid user ID.']);
                exit;
            }

            // Ensure this user belongs to the requesting Org Admin
            $stmt = $db->prepare("SELECT username FROM org_users WHERE id = ? AND org_admin_id = ? LIMIT 1");
            $stmt->execute([$user_id, $org_admin_id]);
            $user = $stmt->fetch();

            if (!$user) {
                http_response_code(404);
                echo json_encode(['error' => 'User not found or access denied.']);
                exit;
            }

            $db->prepare("DELETE FROM org_users WHERE id = ?")->execute([$user_id]);

            echo json_encode([
                'success' => true,
                'message' => "User \"{$user['username']}\" deleted successfully."
            ]);
            break;

        // ══════════════════════════════════════════════════════
        //  SUPER ADMIN — License Key Management (unchanged)
        // ══════════════════════════════════════════════════════

        case 'create':
            require_super_admin($role);

            $org_name      = trim($_POST['organization_name'] ?? '');
            $duration_days = intval($_POST['duration_days'] ?? 30);

            if (empty($org_name)) {
                http_response_code(400);
                echo json_encode(['error' => 'Organization name is required.']);
                exit;
            }

            $db->beginTransaction();

            $stmt = $db->prepare("SELECT id FROM organizations WHERE name = ? LIMIT 1");
            $stmt->execute([$org_name]);
            $org = $stmt->fetch();

            if ($org) {
                $org_id = $org['id'];
            } else {
                $stmt = $db->prepare("INSERT INTO organizations (name, subscription_plan, status) VALUES (?, 'pro', 'active')");
                $stmt->execute([$org_name]);
                $org_id = $db->lastInsertId();
            }

            $license_key = generate_license_key();
            $expires_at  = ($duration_days > 0) ? date('Y-m-d H:i:s', strtotime("+{$duration_days} days")) : null;

            $stmt = $db->prepare("INSERT INTO licenses (license_key, organization_id, role, status, expires_at, bound_machine_id, first_used_at) VALUES (?, ?, 'org_admin', 'active', ?, NULL, NULL)");
            $stmt->execute([$license_key, $org_id, $expires_at]);
            $db->commit();

            echo json_encode([
                'success' => true,
                'message' => 'License key generated successfully.',
                'license' => ['license_key' => $license_key, 'organization_name' => $org_name, 'expires_at' => $expires_at ?? 'Never']
            ]);
            break;

        case 'revoke':
            require_super_admin($role);
            $license_id = intval($_POST['id'] ?? 0);
            $stmt = $db->prepare("SELECT role FROM licenses WHERE id = ?");
            $stmt->execute([$license_id]);
            $lic = $stmt->fetch();
            if (!$lic) { http_response_code(404); echo json_encode(['error' => 'License not found.']); exit; }
            if ($lic['role'] === 'global_admin') { http_response_code(400); echo json_encode(['error' => 'Global master key cannot be revoked via individual controls.']); exit; }
            $db->prepare("UPDATE licenses SET status = 'revoked' WHERE id = ?")->execute([$license_id]);
            echo json_encode(['success' => true, 'message' => 'License revoked successfully.']);
            break;

        case 'reactivate':
            require_super_admin($role);
            $license_id = intval($_POST['id'] ?? 0);
            $stmt = $db->prepare("SELECT * FROM licenses WHERE id = ?");
            $stmt->execute([$license_id]);
            $lic = $stmt->fetch();
            if (!$lic) { http_response_code(404); echo json_encode(['error' => 'License not found.']); exit; }
            $status = (!empty($lic['expires_at']) && strtotime($lic['expires_at']) < time()) ? 'expired' : 'active';
            $db->prepare("UPDATE licenses SET status = ? WHERE id = ?")->execute([$status, $license_id]);
            $msg = ($status === 'expired') ? 'License reactivated but remains naturally EXPIRED.' : 'License reactivated and is now ACTIVE.';
            echo json_encode(['success' => true, 'message' => $msg, 'status' => $status]);
            break;

        case 'extend':
            require_super_admin($role);
            $license_id = intval($_POST['id'] ?? 0);
            $days       = intval($_POST['days'] ?? 0);
            $stmt = $db->prepare("SELECT * FROM licenses WHERE id = ?");
            $stmt->execute([$license_id]);
            $lic = $stmt->fetch();
            if (!$lic) { http_response_code(404); echo json_encode(['error' => 'License not found.']); exit; }
            if ($lic['role'] === 'global_admin') { http_response_code(400); echo json_encode(['error' => 'Global master key cannot be extended.']); exit; }
            $base_time  = ($lic['expires_at'] && strtotime($lic['expires_at']) > time()) ? strtotime($lic['expires_at']) : time();
            $new_expiry = date('Y-m-d H:i:s', strtotime("+{$days} days", $base_time));
            $db->prepare("UPDATE licenses SET expires_at = ?, status = 'active' WHERE id = ?")->execute([$new_expiry, $license_id]);
            echo json_encode(['success' => true, 'message' => "License extended by {$days} days.", 'new_expiry' => $new_expiry]);
            break;

        case 'delete':
            require_super_admin($role);
            $license_id = intval($_POST['id'] ?? 0);
            $stmt = $db->prepare("SELECT role FROM licenses WHERE id = ?");
            $stmt->execute([$license_id]);
            $lic = $stmt->fetch();
            if (!$lic) { http_response_code(404); echo json_encode(['error' => 'License not found.']); exit; }
            if ($lic['role'] === 'global_admin') { http_response_code(400); echo json_encode(['error' => 'Global master key cannot be deleted.']); exit; }
            $db->prepare("DELETE FROM licenses WHERE id = ?")->execute([$license_id]);
            echo json_encode(['success' => true, 'message' => 'License deleted from registry.']);
            break;

        case 'unbind':
            require_super_admin($role);
            $license_id = intval($_POST['id'] ?? 0);
            $stmt = $db->prepare("SELECT role FROM licenses WHERE id = ?");
            $stmt->execute([$license_id]);
            $lic = $stmt->fetch();
            if (!$lic) { http_response_code(404); echo json_encode(['error' => 'License not found.']); exit; }
            if ($lic['role'] === 'global_admin') { http_response_code(400); echo json_encode(['error' => 'Global master key cannot be unbound.']); exit; }
            $db->prepare("UPDATE licenses SET bound_machine_id = NULL, first_used_at = NULL WHERE id = ?")->execute([$license_id]);
            echo json_encode(['success' => true, 'message' => 'Machine binding cleared. This key can now be claimed by any machine.']);
            break;

        case 'toggle_kill':
            require_super_admin($role);
            $stmt = $db->prepare("SELECT status FROM licenses WHERE role = 'global_admin' LIMIT 1");
            $stmt->execute();
            $global = $stmt->fetch();
            if (!$global) { http_response_code(404); echo json_encode(['error' => 'Global master key not found.']); exit; }
            $new_status = ($global['status'] === 'active') ? 'revoked' : 'active';
            $db->prepare("UPDATE licenses SET status = ? WHERE role = 'global_admin'")->execute([$new_status]);
            $msg = ($new_status === 'revoked')
                ? 'Kill Switch ACTIVATED — all grid clients suspended.'
                : 'Kill Switch DEACTIVATED — normal operations restored.';
            echo json_encode(['success' => true, 'message' => $msg, 'new_status' => $new_status]);
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid action requested.']);
            break;
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
