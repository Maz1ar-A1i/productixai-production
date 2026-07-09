from sqlalchemy.orm import joinedload
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime

from ..database import get_db
from ..models import User, UserRole
from ..schemas import LoginSchema, TokenSchema
from ..auth import verify_password, create_access_token

router = APIRouter()

@router.post("/login/login", response_model=TokenSchema, summary="User Login with JWT")
async def login(credentials: LoginSchema, db: Session = Depends(get_db)):
    import requests
    import hmac
    import hashlib
    import json
    import os
    from ..client_license_manager import get_central_server_url
    from ..auth import hash_password

    username = credentials.email.strip()
    password = credentials.password

    server_url = get_central_server_url()
    login_endpoint = f"{server_url}/api/login.php"

    # We will try online authentication first
    online_auth_success = False
    online_res_data = None

    try:
        # Timeout of 5 seconds to prevent locking the app if there's no internet/poor connection
        payload = {"username": username, "password": password}
        response = requests.post(login_endpoint, json=payload, timeout=5)

        if response.status_code == 200:
            res_data = response.json()
            server_sig = response.headers.get("X-Login-Signature") or res_data.get("signature")

            # Verify signature if present to prevent spoofing
            if server_sig:
                # Reconstruct serialized string exactly:
                # Sorted keys: expiresAt, organizationName, requiresPasswordChange, role, userLimit, username, valid
                expires_val = f'"{res_data["expiresAt"]}"' if res_data.get("expiresAt") else 'null'
                req_change_val = "true" if res_data.get("requiresPasswordChange") else "false"
                user_limit_val = res_data.get("userLimit", 5)
                serialized = f'{{"expiresAt": {expires_val}, "organizationName": "{res_data["organizationName"]}", "requiresPasswordChange": {req_change_val}, "role": "{res_data["role"]}", "userLimit": {user_limit_val}, "username": "{res_data["username"]}", "valid": true}}'

                signing_key = os.getenv("LICENSE_SIGNING_KEY")
                if not signing_key:
                    raise RuntimeError("[SECURITY] LICENSE_SIGNING_KEY environment variable is not set.")
                expected_sig = hmac.new(signing_key.encode("utf-8"), serialized.encode("utf-8"), hashlib.sha256).hexdigest()

                if hmac.compare_digest(expected_sig, server_sig):
                    online_auth_success = True
                    online_res_data = res_data
                else:
                    print("[LOGIN WARNING] Cryptographic response signature was invalid!")
            else:
                # If no signature but we returned 200 (might happen in debug/local testing without signing key setup, but let's require signature in production)
                if "localhost" in server_url or "127.0.0.1" in server_url:
                    online_auth_success = True
                    online_res_data = res_data
                else:
                    print("[LOGIN WARNING] Remote central server returned 200 but did not provide a signature.")

        elif response.status_code == 401:
            # Central server rejected the credentials.
            # IMPORTANT: Only org_admin accounts are managed on the central server.
            # Sub-users (org_user) created locally by an org_admin will NOT exist on the
            # central server, so their 401 is expected — fall through to local DB auth.
            print(f"[LOGIN INFO] Central server returned 401 for: {username}. Will try local DB fallback.")
            # Do NOT raise here — let the local DB authentication below handle it.

    except HTTPException:
        raise
    except Exception as e:
        # Network connection timeout or unreachable server — we will fallback to local DB login
        print(f"[LOGIN INFO] Central login server unreachable, falling back to local DB check. Error: {e}")
        pass

    # If online authentication succeeded, sync to local DB
    if online_auth_success and online_res_data:
        org_name = online_res_data["organizationName"]
        role_str = online_res_data["role"]
        requires_password_change = online_res_data.get("requiresPasswordChange", False)
        user_limit_val = online_res_data.get("userLimit", 5)

        # 1. Look up or create local Organization
        from ..models import Organization
        org = db.query(Organization).filter(Organization.name == org_name).first()
        if not org:
            org = Organization(name=org_name, subscription_plan="pro", status="active", user_limit=user_limit_val)
            db.add(org)
            db.commit()
            db.refresh(org)
        else:
            org.user_limit = user_limit_val
            db.commit()
            db.refresh(org)

        # 2. Look up or create local User
        user = db.query(User).filter(User.email == username).first()

        # Map central roles to local UserRole enum
        local_role = UserRole.org_user
        if role_str == "super_admin":
            local_role = UserRole.system_admin
        elif role_str == "org_admin":
            local_role = UserRole.org_admin

        hashed_pass = hash_password(password)

        if not user:
            user = User(
                name=username,
                email=username,
                password_hash=hashed_pass,
                role=local_role,
                organization_id=org.id,
                is_verified=True,
                is_active=True,
                requires_password_change=requires_password_change
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # Sync user information to local DB
            user.password_hash = hashed_pass
            user.role = local_role
            user.organization_id = org.id
            user.is_active = True
            user.requires_password_change = requires_password_change
            db.commit()
            db.refresh(user)

        # 3. Sync license status locally
        license_status_str = online_res_data.get("licenseStatus", "active")
        
        # Check for existing license key in DB or cached key
        from ..client_license_manager import read_encrypted_cache, get_cache_file_path
        from ..models import License
        cache = read_encrypted_cache()
        cached_key = cache.get("license_key") if cache else None
        
        lic = None
        if cached_key:
            lic = db.query(License).filter(License.license_key == cached_key).first()
        if not lic:
            lic = db.query(License).filter(License.organization_id == org.id).order_by(License.id.desc()).first()
            
        if lic:
            try:
                if online_res_data.get("expiresAt"):
                    from datetime import datetime
                    expires_dt = datetime.fromisoformat(online_res_data["expiresAt"].replace('T', ' '))
                    lic.expires_at = expires_dt
                lic.status = license_status_str
                db.commit()
            except Exception as ex:
                print(f"[LOGIN WARNING] Failed to sync license details locally: {ex}")
                
            # If license is NOT active (e.g. revoked or expired), clear the cache!
            if license_status_str != "active":
                cache_path = get_cache_file_path()
                if cache_path.exists():
                    try:
                        cache_path.unlink()
                        print("[*] Cleared local license cache because license is inactive.")
                    except Exception as ex:
                        print(f"[!] Failed to delete license cache: {ex}")

        # Block login if license is revoked or expired
        if license_status_str in ["revoked", "expired"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your organization's license is {license_status_str.upper()}. Access suspended. Please contact your administrator.",
            )

        # 4. Generate access token
        access_token = create_access_token({
            "user_id": user.id,
            "organization_id": user.organization_id if user.role != UserRole.system_admin else None,
            "role": user.role.value,
            "requires_password_change": getattr(user, "requires_password_change", False)
        })

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "requires_password_change": getattr(user, "requires_password_change", False)
        }

    # ── Fallback: Local Database Authentication ──
    user = (
        db.query(User)
        .options(joinedload(User.organization))
        .filter(User.email == username)
        .first()
    )

    if not user:
        print(f"[LOGIN FAILED] Local user not found: {username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(password, user.password_hash):
        print(f"[LOGIN FAILED] Invalid local password for user: {username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Require verification flag for local-only users
    if not getattr(user, "is_verified", False):
        print(f"[LOGIN FAILED] Email not verified for user: {username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email not verified. Please check your inbox.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    is_active_val = getattr(user, "is_active", True)
    if is_active_val is False:
        print(f"[LOGIN FAILED] Account deactivated for user: {username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account deactivated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check organization status only for non-system-admin users
    if user.role != UserRole.system_admin:
        org = user.organization
        if not org:
             raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organization not found.",
            )

        # Check for subscription expiration
        if org.subscription and org.subscription.end_date:
            if org.subscription.end_date < datetime.utcnow():
                org.status = "disabled"
                db.commit()

        if org.status != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Package expired. Please renew your subscription.",
            )

        # Check license status from local database
        from ..models import License
        lic = db.query(License).filter(
            License.organization_id == user.organization_id
        ).order_by(License.id.desc()).first()
        if lic and lic.status in ["revoked", "expired"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your organization's license is {lic.status.upper()}. Access suspended. Please contact your administrator.",
            )

    # Create JWT access token
    access_token = create_access_token({
        "user_id": user.id,
        "organization_id": user.organization_id if user.role != UserRole.system_admin else None,
        "role": user.role.value,
        "requires_password_change": getattr(user, "requires_password_change", False)
    })

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "requires_password_change": getattr(user, "requires_password_change", False)
    }
