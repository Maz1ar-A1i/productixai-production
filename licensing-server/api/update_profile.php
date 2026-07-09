<?php
// api/update_profile.php
// Secure endpoint to update user profile credentials and clear requires_password_change flag.
// Authenticated using an HMAC signature generated with the shared LICENSE_SIGNING_KEY.

require_once __DIR__ . '/../db_config.php';

// Allow CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Update-Signature");
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

$input_raw = file_get_contents('php://input');
$input = json_decode($input_raw, true);

$username     = isset($input['username']) ? trim($input['username']) : '';
$new_username = isset($input['new_username']) ? trim($input['new_username']) : '';
$new_password = isset($input['new_password']) ? $input['new_password'] : '';
$timestamp    = isset($input['timestamp']) ? intval($input['timestamp']) : 0;
$signature    = $_SERVER['HTTP_X_UPDATE_SIGNATURE'] ?? $input['signature'] ?? '';

if (empty($username)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing username parameter']);
    exit;
}

// 1. Verify timestamp to prevent replay attacks (allow 15 min drift for clock sync issues)
if (abs(time() - $timestamp) > 900) {
    http_response_code(400);
    echo json_encode(['error' => 'Request expired / clock out of sync (> 15 min drift)']);
    exit;
}

// 2. Re-serialize in alphabetical order to match Python json.dumps(..., sort_keys=True)
$data = [
    'new_password' => $new_password,
    'new_username' => $new_username,
    'timestamp' => (int)$timestamp,
    'username' => $username
];
ksort($data);
$serialized = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

$expected_sig = hash_hmac('sha256', $serialized, LICENSE_SIGNING_KEY);

if (!hash_equals($expected_sig, $signature)) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid cryptographic signature']);
    exit;
}

$db = get_db_connection();

try {
    // Determine if the user is an org_admin or org_user
    $is_admin = false;
    $is_user  = false;
    $user_id  = null;
    
    // Check in org_admins
    $stmt = $db->prepare("SELECT id FROM org_admins WHERE username = ? LIMIT 1");
    $stmt->execute([$username]);
    $admin_row = $stmt->fetch();
    if ($admin_row) {
        $is_admin = true;
        $user_id = $admin_row['id'];
    } else {
        // Check in org_users
        $stmt = $db->prepare("SELECT id FROM org_users WHERE username = ? LIMIT 1");
        $stmt->execute([$username]);
        $user_row = $stmt->fetch();
        if ($user_row) {
            $is_user = true;
            $user_id = $user_row['id'];
        }
    }

    if (!$is_admin && !$is_user) {
        http_response_code(404);
        echo json_encode(['error' => 'User not found']);
        exit;
    }

    $db->beginTransaction();

    // If new_username is different, check for conflict and update
    if (!empty($new_username) && $new_username !== $username) {
        if ($is_admin) {
            $check = $db->prepare("SELECT id FROM org_admins WHERE username = ? LIMIT 1");
            $check->execute([$new_username]);
            if ($check->fetch()) {
                http_response_code(409);
                echo json_encode(['error' => 'Email/Username already registered']);
                $db->rollBack();
                exit;
            }
            $stmt = $db->prepare("UPDATE org_admins SET username = ? WHERE id = ?");
            $stmt->execute([$new_username, $user_id]);
        } else {
            $check = $db->prepare("SELECT id FROM org_users WHERE username = ? LIMIT 1");
            $check->execute([$new_username]);
            if ($check->fetch()) {
                http_response_code(409);
                echo json_encode(['error' => 'Email/Username already registered']);
                $db->rollBack();
                exit;
            }
            $stmt = $db->prepare("UPDATE org_users SET username = ? WHERE id = ?");
            $stmt->execute([$new_username, $user_id]);
        }
    }

    // If new_password is provided, hash and update
    if (!empty($new_password)) {
        if (strlen($new_password) < 8) {
            http_response_code(400);
            echo json_encode(['error' => 'Password must be at least 8 characters']);
            $db->rollBack();
            exit;
        }
        $hash = password_hash($new_password, PASSWORD_BCRYPT, ['cost' => 12]);
        if ($is_admin) {
            $stmt = $db->prepare("UPDATE org_admins SET password_hash = ? WHERE id = ?");
            $stmt->execute([$hash, $user_id]);
        } else {
            $stmt = $db->prepare("UPDATE org_users SET password_hash = ? WHERE id = ?");
            $stmt->execute([$hash, $user_id]);
        }
    }

    // Always clear the requires_password_change flag on update
    if ($is_admin) {
        $stmt = $db->prepare("UPDATE org_admins SET requires_password_change = 0 WHERE id = ?");
        $stmt->execute([$user_id]);
    } else {
        $stmt = $db->prepare("UPDATE org_users SET requires_password_change = 0 WHERE id = ?");
        $stmt->execute([$user_id]);
    }

    $db->commit();
    echo json_encode(['success' => true, 'message' => 'Credentials updated successfully']);

} catch (Exception $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
