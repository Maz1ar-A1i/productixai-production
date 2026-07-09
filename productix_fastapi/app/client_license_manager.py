import os
import sys
import uuid
import json
import base64
import hmac
import hashlib
import requests
import asyncio
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, Optional
from cryptography.fernet import Fernet

# Global thread-safe client-side license state
state_lock = threading.Lock()
IS_LICENSED = False
LICENSE_BLOCK_REASON = "UNLICENSED"
LICENSE_KEY = ""
EXPIRES_AT = None
HOURS_LEFT = 0.0

def get_machine_id() -> str:
    """
    Generate a stable, platform-independent unique machine ID.
    Combines stable hardware attributes and hashes them with SHA-256.
    """
    try:
        # MAC address fallback
        mac_addr = str(uuid.getnode())
        hostname = os.environ.get("COMPUTERNAME", os.environ.get("HOSTNAME", "localhost"))
        username = os.environ.get("USERNAME", os.environ.get("USER", "default_user"))
        
        # Combine hardware fingerprint elements
        raw_fingerprint = f"{mac_addr}-{hostname}-{username}-ProductixHardwareFingerprint2026"
        return hashlib.sha256(raw_fingerprint.encode("utf-8")).hexdigest()
    except Exception:
        # Fallback if system calls fail
        return hashlib.sha256(b"fallback-machine-id-salt-2026").hexdigest()

def get_cache_file_path() -> Path:
    """Return the absolute path where the encrypted license cache file is stored."""
    # Place it next to the productix database or in data directory
    data_dir_env = os.environ.get("PRODUCTIX_DATA_DIR")
    if data_dir_env:
        base_dir = Path(data_dir_env).resolve()
    else:
        base_dir = Path(__file__).parent.parent.resolve()
    return base_dir / "license.cache"

def derive_fernet_key() -> bytes:
    """
    Derive a stable 32-byte Fernet key from the Machine ID.
    This binds the cached license file cryptographically to this machine only!
    """
    machine_id = get_machine_id()
    salt = "PRODUCTIX_HARDWARE_CACHE_SALT_SECRET_2026"
    raw_hash = hashlib.sha256((machine_id + salt).encode("utf-8")).digest()
    return base64.urlsafe_b64encode(raw_hash)

def read_encrypted_cache() -> Optional[Dict[str, Any]]:
    """Read and decrypt the local license cache."""
    cache_path = get_cache_file_path()
    if not cache_path.exists():
        return None
    try:
        fernet = Fernet(derive_fernet_key())
        encrypted_data = cache_path.read_bytes()
        decrypted_bytes = fernet.decrypt(encrypted_data)
        return json.loads(decrypted_bytes.decode("utf-8"))
    except Exception as e:
        # If decryption fails (e.g. file copied to a different machine), return None
        return None

def write_encrypted_cache(data: Dict[str, Any]):
    """Encrypt and write the license cache locally."""
    try:
        cache_path = get_cache_file_path()
        fernet = Fernet(derive_fernet_key())
        serialized_data = json.dumps(data).encode("utf-8")
        encrypted_data = fernet.encrypt(serialized_data)
        cache_path.write_bytes(encrypted_data)
    except Exception as e:
        pass

def get_central_server_url() -> str:
    """Return the central license server URL."""
    # Retrieve server URL from environment variables
    # Default to the centralized registry domain
    return os.getenv("CENTRAL_LICENSE_SERVER_URL", "https://license.techohub.net")

def verify_server_signature(payload: dict, signature: str) -> bool:
    """
    Verify if the payload from the server matches the HMAC signature.
    Prevents local spoofing of license validation responses.
    """
    # Filter signature out of validation dictionary if present
    val_data = {k: v for k, v in payload.items() if k != "signature"}
    serialized = json.dumps(val_data, sort_keys=True).encode("utf-8")
    signing_key = os.getenv("LICENSE_SIGNING_KEY")
    if not signing_key:
        raise RuntimeError("[SECURITY] LICENSE_SIGNING_KEY environment variable is not set.")
    expected_sig = hmac.new(signing_key.encode("utf-8"), serialized, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_sig, signature)

def sync_local_db_status(license_key: str, valid: bool, reason: str, expires_at_str: Optional[str], machine_id: str):
    """Sync the license status from the central server to the local SQLite database."""
    try:
        from .database import SessionLocal
        from .models import License, Organization
        
        db = SessionLocal()
        try:
            lic = db.query(License).filter(License.license_key == license_key).first()
            if lic:
                lic.status = "active" if valid else reason.lower()
                if expires_at_str:
                    try:
                        lic.expires_at = datetime.fromisoformat(expires_at_str)
                    except ValueError:
                        lic.expires_at = datetime.fromisoformat(expires_at_str.replace(' ', 'T'))
                else:
                    lic.expires_at = None
                if valid:
                    lic.bound_machine_id = machine_id
                    if not lic.first_used_at:
                        lic.first_used_at = datetime.utcnow()
                db.commit()
            else:
                # Only insert if the remote server verified it as valid
                if valid:
                    org = db.query(Organization).first()
                    org_id = org.id if org else None
                    
                    parsed_expires_at = None
                    if expires_at_str:
                        try:
                            parsed_expires_at = datetime.fromisoformat(expires_at_str)
                        except ValueError:
                            parsed_expires_at = datetime.fromisoformat(expires_at_str.replace(' ', 'T'))
                            
                    lic = License(
                        license_key=license_key,
                        organization_id=org_id,
                        role="org_admin",
                        status="active",
                        expires_at=parsed_expires_at,
                        bound_machine_id=machine_id,
                        first_used_at=datetime.utcnow()
                    )
                    db.add(lic)
                    db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"[!] Failed to sync remote license status to local DB: {e}")

def check_license_status(provided_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Core licensing status validator for the client app.
    Combines online server-checks, signature validation, offline grace periods, and clock tampering.
    """
    global IS_LICENSED, LICENSE_BLOCK_REASON, LICENSE_KEY, EXPIRES_AT, HOURS_LEFT
    
    current_time = datetime.utcnow()
    machine_id = get_machine_id()
    
    # 1. Resolve license key to use
    cache = read_encrypted_cache()
    license_key = provided_key
    if not license_key and cache:
        license_key = cache.get("license_key")
        
    if not license_key:
        with state_lock:
            IS_LICENSED = False
            LICENSE_BLOCK_REASON = "UNLICENSED"
        return {"valid": False, "reason": "UNLICENSED", "machineId": machine_id}

    # 2. Try Online Validation
    server_url = get_central_server_url()
    is_local_url = "localhost" in server_url or "127.0.0.1" in server_url
    
    if is_local_url:
        # Validate against local database directly to prevent loopback deadlocks
        try:
            from .database import SessionLocal
            from .models import License
            
            db = SessionLocal()
            try:
                # Check Global Master Kill Switch
                global_license = db.query(License).filter(License.role == "global_admin").first()
                if global_license and global_license.status == "revoked":
                    with state_lock:
                        IS_LICENSED = False
                        LICENSE_BLOCK_REASON = "SYSTEM_SUSPENDED"
                        LICENSE_KEY = license_key
                        EXPIRES_AT = None
                    return {"valid": False, "reason": "SYSTEM_SUSPENDED", "machineId": machine_id}
                    
                # Validate individual license key
                lic = db.query(License).filter(License.license_key == license_key).first()
                if not lic:
                    with state_lock:
                        IS_LICENSED = False
                        LICENSE_BLOCK_REASON = "REVOKED"
                        LICENSE_KEY = license_key
                        EXPIRES_AT = None
                    return {"valid": False, "reason": "REVOKED", "machineId": machine_id}
                    
                if lic.status == "revoked":
                    expires_at_str = lic.expires_at.isoformat() if lic.expires_at else None
                    with state_lock:
                        IS_LICENSED = False
                        LICENSE_BLOCK_REASON = "REVOKED"
                        LICENSE_KEY = license_key
                        EXPIRES_AT = expires_at_str
                    return {"valid": False, "reason": "REVOKED", "expiresAt": expires_at_str, "machineId": machine_id}
                    
                if lic.expires_at and lic.expires_at < current_time:
                    expires_at_str = lic.expires_at.isoformat()
                    with state_lock:
                        IS_LICENSED = False
                        LICENSE_BLOCK_REASON = "EXPIRED"
                        LICENSE_KEY = license_key
                        EXPIRES_AT = expires_at_str
                    return {"valid": False, "reason": "EXPIRED", "expiresAt": expires_at_str, "machineId": machine_id}
                    
                # Active!
                expires_at_str = lic.expires_at.isoformat() if lic.expires_at else None

                # OTP Machine-Lock: check binding (global_admin exempt)
                if lic.role != "global_admin" and machine_id:
                    bound = lic.bound_machine_id
                    if not bound:
                        # First use — bind to this machine
                        lic.bound_machine_id = machine_id
                        lic.first_used_at = current_time
                        db.commit()
                    elif bound != machine_id:
                        # Different machine — REJECT
                        with state_lock:
                            IS_LICENSED = False
                            LICENSE_BLOCK_REASON = "MACHINE_MISMATCH"
                            LICENSE_KEY = license_key
                            EXPIRES_AT = expires_at_str
                        return {"valid": False, "reason": "MACHINE_MISMATCH", "expiresAt": expires_at_str, "machineId": machine_id}

                new_cache = {
                    "license_key": license_key,
                    "last_validated": current_time.isoformat(),
                    "max_seen_time": current_time.isoformat(),
                    "expires_at": expires_at_str,
                    "cached_status": "active"
                }
                write_encrypted_cache(new_cache)
                with state_lock:
                    IS_LICENSED = True
                    LICENSE_BLOCK_REASON = "ACTIVE"
                    LICENSE_KEY = license_key
                    EXPIRES_AT = expires_at_str
                    HOURS_LEFT = 24.0
                return {"valid": True, "reason": "ACTIVE", "expiresAt": expires_at_str, "machineId": machine_id}
            finally:
                db.close()
        except Exception:
            pass # fallback to cache
    else:
        # Remote central server validation via HTTP request
        try:
            validate_endpoint = f"{server_url}/api/validate.php"
            payload = {
                "licenseKey": license_key,
                "machineId": machine_id
            }
            response = requests.post(validate_endpoint, json=payload, timeout=5)
            
            if response.status_code == 200:
                res_data = response.json()
                server_sig = res_data.get("signature")
                
                # Verify signature
                if not server_sig or not verify_server_signature(res_data, server_sig):
                    with state_lock:
                        IS_LICENSED = False
                        LICENSE_BLOCK_REASON = "SIGNATURE_SPOOFED"
                    return {"valid": False, "reason": "SIGNATURE_SPOOFED", "machineId": machine_id}
                
                valid = res_data.get("valid", False)
                reason = res_data.get("reason", "REVOKED")
                expires_at_str = res_data.get("expiresAt")
                
                # Sync response status directly to local SQLite DB
                sync_local_db_status(license_key, valid, reason, expires_at_str, machine_id)
                
                if valid:
                    new_cache = {
                        "license_key": license_key,
                        "last_validated": current_time.isoformat(),
                        "max_seen_time": current_time.isoformat(),
                        "expires_at": expires_at_str,
                        "cached_status": "active"
                    }
                    write_encrypted_cache(new_cache)
                    with state_lock:
                        IS_LICENSED = True
                        LICENSE_BLOCK_REASON = "ACTIVE"
                        LICENSE_KEY = license_key
                        EXPIRES_AT = expires_at_str
                        HOURS_LEFT = 24.0
                    return {"valid": True, "reason": "ACTIVE", "expiresAt": expires_at_str, "machineId": machine_id}
                else:
                    # Keep the cache file so we remember the key, but mark the cached status as revoked/expired
                    new_cache = {
                        "license_key": license_key,
                        "last_validated": current_time.isoformat(),
                        "max_seen_time": current_time.isoformat(),
                        "expires_at": expires_at_str,
                        "cached_status": reason.lower()
                    }
                    write_encrypted_cache(new_cache)
                    with state_lock:
                        IS_LICENSED = False
                        LICENSE_BLOCK_REASON = reason
                        LICENSE_KEY = license_key
                        EXPIRES_AT = expires_at_str
                    # MACHINE_MISMATCH: this key is permanently bound to a different machine.
                    # The user must contact the administrator to unbind or get a new key.
                    return {"valid": False, "reason": reason, "expiresAt": expires_at_str, "machineId": machine_id}
        except Exception:
            pass # fallback to cache

    # 3. Fallback to Local Encrypted Cache (Offline Grace Period)
    if not cache:
        with state_lock:
            IS_LICENSED = False
            LICENSE_BLOCK_REASON = "UNLICENSED"
        return {"valid": False, "reason": "UNLICENSED", "machineId": machine_id}

    try:
        last_validated_str = cache.get("last_validated")
        max_seen_str = cache.get("max_seen_time")
        expires_at_str = cache.get("expires_at")
        cached_status = cache.get("cached_status", "active")
        
        last_validated = datetime.fromisoformat(last_validated_str)
        max_seen = datetime.fromisoformat(max_seen_str)
        
        # Clock manipulation check (Time Tampering)
        if current_time < max_seen:
            with state_lock:
                IS_LICENSED = False
                LICENSE_BLOCK_REASON = "TIME_TAMPERING"
            return {"valid": False, "reason": "TIME_TAMPERING", "machineId": machine_id}
            
        # Check cached status (prevent offline grace bypass for revoked keys)
        if cached_status != "active":
            with state_lock:
                IS_LICENSED = False
                LICENSE_BLOCK_REASON = cached_status.upper()
            return {"valid": False, "reason": cached_status.upper(), "expiresAt": expires_at_str, "machineId": machine_id}
        
        # Expiry Check
        if expires_at_str:
            expires_at = datetime.fromisoformat(expires_at_str)
            if current_time > expires_at:
                with state_lock:
                    IS_LICENSED = False
                    LICENSE_BLOCK_REASON = "EXPIRED"
                    EXPIRES_AT = expires_at_str
                return {"valid": False, "reason": "EXPIRED", "expiresAt": expires_at_str, "machineId": machine_id}

        # Update max seen time in local cache to prevent future clock rolling back
        cache["max_seen_time"] = current_time.isoformat()
        write_encrypted_cache(cache)
        
        # Enforce 24h grace period
        hours_since_sync = (current_time - last_validated).total_seconds() / 3600.0
        
        if hours_since_sync <= 24.0:
            remaining_hours = max(0.0, 24.0 - hours_since_sync)
            with state_lock:
                IS_LICENSED = True
                LICENSE_BLOCK_REASON = "OFFLINE_GRACE"
                LICENSE_KEY = license_key
                EXPIRES_AT = expires_at_str
                HOURS_LEFT = remaining_hours
            
            # Sync offline grace active state to local DB
            sync_local_db_status(license_key, True, "ACTIVE", expires_at_str, machine_id)
            
            return {"valid": True, "reason": "OFFLINE_GRACE", "expiresAt": expires_at_str, "hoursLeft": remaining_hours, "machineId": machine_id}
        else:
            # Offline timeout!
            with state_lock:
                IS_LICENSED = False
                LICENSE_BLOCK_REASON = "OFFLINE_TIMEOUT"
                LICENSE_KEY = license_key
                EXPIRES_AT = expires_at_str
            
            # Update local database status to offline_timeout
            sync_local_db_status(license_key, False, "OFFLINE_TIMEOUT", expires_at_str, machine_id)
            
            return {"valid": False, "reason": "OFFLINE_TIMEOUT", "expiresAt": expires_at_str, "machineId": machine_id}
            
    except Exception as e:
        with state_lock:
            IS_LICENSED = False
            LICENSE_BLOCK_REASON = "UNLICENSED"
        return {"valid": False, "reason": "UNLICENSED", "machineId": machine_id}

def start_periodic_license_polling():
    """
    Start the background daemon thread loop that re-validates licensing state
    every 30 minutes during client application runtime.
    """
    def poll_loop():
        # Let the app finish loading before the first validation loop
        time.sleep(10)
        while True:
            try:
                check_license_status()
            except Exception:
                pass
            # Poll every 30 minutes (1800 seconds)
            time.sleep(1800)
            
    polling_thread = threading.Thread(target=poll_loop, daemon=True)
    polling_thread.start()
