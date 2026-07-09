<?php
// api/login.php
// API endpoint for desktop app to authenticate user accounts created on the PHP licensing server

require_once __DIR__ . '/../db_config.php';

// Allow CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Login-Signature");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

// 1. Parse JSON POST Request Input
$input_raw = file_get_contents('php://input');
$input = json_decode($input_raw, true);

$username = isset($input['username']) ? trim($input['username']) : '';
$password = isset($input['password']) ? $input['password'] : '';

if (empty($username) || empty($password)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing username or password parameter']);
    exit;
}

$db = get_db_connection();

try {
    $user_found = false;
    $role = null;
    $organization_name = null;
    $password_hash = null;

    $requires_password_change = 0;

    // ── Check if the credentials match Super Admin ──
    if ($username === ADMIN_USER) {
        // Super Admin password check (defined in db_config.php)
        if ($password === ADMIN_PASS) {
            $user_found = true;
            $role = 'super_admin';
            $organization_name = 'System Administration';
            $requires_password_change = 0;
        }
    }

    // ── Check if the credentials match Org Admin ──
    if (!$user_found) {
        $stmt = $db->prepare("SELECT * FROM org_admins WHERE username = ? LIMIT 1");
        $stmt->execute([$username]);
        $org_admin = $stmt->fetch();

        if ($org_admin && password_verify($password, $org_admin['password_hash'])) {
            $user_found = true;
            $role = 'org_admin';
            $organization_name = $org_admin['organization_name'];
            $requires_password_change = isset($org_admin['requires_password_change']) ? (int)$org_admin['requires_password_change'] : 0;
        }
    }

    // ── Check if the credentials match Org User ──
    if (!$user_found) {
        $stmt = $db->prepare("
            SELECT ou.*, oa.organization_name, oa.user_limit 
            FROM org_users ou
            JOIN org_admins oa ON ou.org_admin_id = oa.id
            WHERE ou.username = ? AND ou.status = 'active'
            LIMIT 1
        ");
        $stmt->execute([$username]);
        $org_user = $stmt->fetch();

        if ($org_user && password_verify($password, $org_user['password_hash'])) {
            $user_found = true;
            $role = 'org_user';
            $organization_name = $org_user['organization_name'];
            $requires_password_change = isset($org_user['requires_password_change']) ? (int)$org_user['requires_password_change'] : 0;
        }
    }

    if (!$user_found) {
        http_response_code(401);
        echo json_encode(['valid' => false, 'error' => 'Invalid username or password']);
        exit;
    }

    $user_limit = 5;
    if ($role === 'super_admin') {
        $user_limit = 999999;
    } elseif ($role === 'org_admin' && isset($org_admin['user_limit'])) {
        $user_limit = intval($org_admin['user_limit']);
    } elseif ($role === 'org_user' && isset($org_user['user_limit'])) {
        $user_limit = intval($org_user['user_limit']);
    }

    // ── Get the subscription / license details for this organization if it exists ──
    $expires_at = null;
    $license_status = 'unlicensed';
    if ($role === 'super_admin') {
        $license_status = 'active';
    } elseif (!empty($organization_name)) {
        // Search licenses
        $stmt = $db->prepare("
            SELECT l.expires_at, l.status 
            FROM licenses l
            JOIN organizations o ON l.organization_id = o.id
            WHERE o.name = ?
            ORDER BY l.id DESC LIMIT 1
        ");
        $stmt->execute([$organization_name]);
        $lic = $stmt->fetch();
        if ($lic) {
            $license_status = $lic['status'];
            if (!empty($lic['expires_at'])) {
                $expires_at = str_replace(' ', 'T', $lic['expires_at']);
                if (strtotime($lic['expires_at']) < time() && $lic['status'] === 'active') {
                    $license_status = 'expired';
                }
            }
        }
    }

    // Build signed payload (Sorted keys alphabetically to match client validation):
    // 1. expiresAt  2. organizationName  3. requiresPasswordChange  4. role  5. userLimit  6. username  7. valid
    $expires_at_val = ($expires_at === null) ? 'null' : '"' . $expires_at . '"';
    $req_pass_change_val = ($requires_password_change ? 'true' : 'false');
    $serialized = '{"expiresAt": ' . $expires_at_val . 
                  ', "organizationName": "' . $organization_name . '"' .
                  ', "requiresPasswordChange": ' . $req_pass_change_val .
                  ', "role": "' . $role . '"' .
                  ', "userLimit": ' . $user_limit .
                  ', "username": "' . $username . '"' .
                  ', "valid": true}';

    $signature = hash_hmac('sha256', $serialized, LICENSE_SIGNING_KEY);

    header('X-Login-Signature: ' . $signature);
    header('Content-Type: application/json');

    echo json_encode([
        'valid' => true,
        'role' => $role,
        'username' => $username,
        'organizationName' => $organization_name,
        'expiresAt' => $expires_at,
        'requiresPasswordChange' => (bool)$requires_password_change,
        'userLimit' => $user_limit,
        'licenseStatus' => $license_status,
        'signature' => $signature
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'valid' => false,
        'error' => 'INTERNAL_SERVER_ERROR',
        'details' => $e->getMessage()
    ]);
}
