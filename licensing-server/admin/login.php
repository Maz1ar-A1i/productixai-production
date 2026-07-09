<?php
// admin/login.php
// Unified Login Page — Super Admin (hardcoded) + Org Admin (database)
// NO self-registration. Accounts are created by Super Admin only.

require_once __DIR__ . '/../db_config.php';

// Redirect if already authenticated
if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
    $role = $_SESSION['role'] ?? 'super_admin';
    header('Location: ' . ($role === 'org_admin' ? 'org_admin_panel.php' : 'index.php'));
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = isset($_POST['username']) ? trim($_POST['username']) : '';
    $password = isset($_POST['password']) ? trim($_POST['password']) : '';

    if (empty($username) || empty($password)) {
        $error = 'Username and password are required.';
    } else {
        // ── Route 1: Super Admin (hardcoded) ──
        if ($username === ADMIN_USER && $password === ADMIN_PASS) {
            $_SESSION['admin_logged_in'] = true;
            $_SESSION['role']            = 'super_admin';
            $_SESSION['admin_user']      = $username;
            header('Location: index.php');
            exit;
        }

        // ── Route 2: Org Admin (database lookup) ──
        $db   = get_db_connection();
        $stmt = $db->prepare("SELECT id, password_hash, organization_name FROM org_admins WHERE username = ? LIMIT 1");
        $stmt->execute([$username]);
        $org_admin = $stmt->fetch();

        if ($org_admin && password_verify($password, $org_admin['password_hash'])) {
            $_SESSION['admin_logged_in']   = true;
            $_SESSION['role']              = 'org_admin';
            $_SESSION['admin_user']        = $username;
            $_SESSION['org_admin_id']      = $org_admin['id'];
            $_SESSION['org_admin_org']     = $org_admin['organization_name'];
            header('Location: org_admin_panel.php');
            exit;
        }

        // Neither matched
        $error = 'Invalid username or password.';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Productix | Licensing Portal Login</title>
    <link rel="stylesheet" href="style.css">
    <script type="module" src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.esm.js"></script>
    <script nomodule src="https://unpkg.com/ionicons@7.1.0/dist/ionicons/ionicons.js"></script>
</head>
<body>
    <div class="auth-container">
        <div class="auth-card">
            <div class="auth-logo">
                <div class="logo-icon">PX</div>
                <div class="logo-text">Productix</div>
            </div>

            <h2 class="auth-title">Licensing Portal</h2>
            <p class="auth-subtitle">Sign in with your administrator credentials</p>

            <?php if (!empty($error)): ?>
                <div class="alert-danger">
                    <ion-icon name="alert-circle-outline" style="font-size: 20px; flex-shrink: 0;"></ion-icon>
                    <span><?php echo htmlspecialchars($error); ?></span>
                </div>
            <?php endif; ?>

            <form action="login.php" method="POST" autocomplete="off">
                <div class="form-group">
                    <label for="username" class="form-label">Username</label>
                    <input type="text" id="username" name="username" class="form-input"
                           placeholder="Enter your username" required autocomplete="username"
                           value="<?php echo htmlspecialchars($_POST['username'] ?? ''); ?>">
                </div>

                <div class="form-group">
                    <label for="password" class="form-label">Password</label>
                    <input type="password" id="password" name="password" class="form-input"
                           placeholder="••••••••••••" required autocomplete="current-password">
                </div>

                <button type="submit" class="btn-submit">
                    <span>Sign In</span>
                    <ion-icon name="arrow-forward-outline" style="font-size: 18px; margin-left: 6px;"></ion-icon>
                </button>
            </form>

            <p style="margin-top: 24px; font-size: 12px; color: var(--text-muted); text-align: center;">
                Access is by invitation only. Contact your administrator.
            </p>
        </div>
    </div>
</body>
</html>
