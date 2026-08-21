import os
import time
import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import License

router = APIRouter(prefix="/api/internal", tags=["Internal System Control"])

# In-memory sliding window rate-limiter: { ip_address: [timestamp1, timestamp2, ...] }
rate_limit_cache = {}

def get_audit_log_path() -> Path:
    """Return the resolved path for the Master Kill Switch audit logs."""
    # Place logs directory in productix_fastapi folder or root directory
    base_dir = Path(__file__).parent.parent.parent.resolve()
    logs_dir = base_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    return logs_dir / "master-audit.log"

def write_audit_log(ip: str, action: str, status_msg: str):
    """Write an entry to the append-only master-audit.log file."""
    try:
        log_path = get_audit_log_path()
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_line = f"[{timestamp}] [IP: {ip}] Action: {action} Status: {status_msg}\n"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(log_line)
    except Exception as e:
        # Silently fail to protect backend robustness, but don't output standard logs
        pass

def enforce_security(request: Request, x_master_token: str = Header(None)):
    """
    Enforces the secret token, IP whitelist, and rate limits.
    Any violation returns HTTP 404 (Not Found) to make the route appear non-existent.
    """
    client_ip = request.client.host if request.client else "unknown"
    action = "MASTER_KILL_ATTEMPT" if "kill" in request.url.path else "MASTER_RESTORE_ATTEMPT"

    # 1. Rate Limiting: Max 3 requests per hour per IP
    now = time.time()
    ip_history = rate_limit_cache.get(client_ip, [])
    # Filter out entries older than 1 hour (3600 seconds)
    ip_history = [ts for ts in ip_history if now - ts < 3600]
    rate_limit_cache[client_ip] = ip_history

    if len(ip_history) >= 3:
        write_audit_log(client_ip, action, "FAILED (Rate Limit Exceeded)")
        raise HTTPException(status_code=404, detail="Not Found")

    # Increment rate limit attempt
    rate_limit_cache[client_ip].append(now)

    # 2. IP Whitelisting Check
    allowed_ip_env = os.getenv("MASTER_KILL_ALLOWED_IP")
    if allowed_ip_env:
        allowed_ips = [ip.strip() for ip in allowed_ip_env.split(",") if ip.strip()]
        if client_ip not in allowed_ips:
            write_audit_log(client_ip, action, f"FAILED (IP Blocked: {client_ip})")
            raise HTTPException(status_code=404, detail="Not Found")

    # 3. Master Token Check
    secret_token = os.getenv("MASTER_KILL_TOKEN", "PRODUCTIX_MASTER_SECRET_DEV_SWITCH_KEY_TOKEN_9999")
    if not x_master_token or x_master_token.strip() != secret_token.strip():
        write_audit_log(client_ip, action, "FAILED (Invalid/Missing Token)")
        raise HTTPException(status_code=404, detail="Not Found")

@router.post("/master-kill", include_in_schema=False)
def master_kill(
    request: Request,
    db: Session = Depends(get_db),
    _ = Depends(enforce_security)
):
    """
    Developer-only Master Kill Switch.
    Sets the Global Admin license status to 'revoked' to suspend the entire system.
    Returns standard 200 OK only on successful authentication, otherwise hidden behind 404.
    """
    client_ip = request.client.host if request.client else "unknown"
    
    try:
        global_license = db.query(License).filter(License.role == "global_admin").first()
        if not global_license:
            global_license = License(
                license_key="PRODUCTIX-GLOBAL-MASTER-KEY",
                role="global_admin",
                status="revoked",
                expires_at=None
            )
            db.add(global_license)
        else:
            global_license.status = "revoked"
        
        db.commit()
        write_audit_log(client_ip, "MASTER_KILL", "SUCCESS")
        return {"status": "success", "message": "Global system registry suspended successfully."}
        
    except Exception as e:
        db.rollback()
        write_audit_log(client_ip, "MASTER_KILL", f"ERROR (DB Transaction Failed: {str(e)})")
        raise HTTPException(status_code=404, detail="Not Found")

@router.post("/master-restore", include_in_schema=False)
def master_restore(
    request: Request,
    db: Session = Depends(get_db),
    _ = Depends(enforce_security)
):
    """
    Developer-only Master Restore Switch.
    Re-activates the Global Admin license to restore general system operations.
    """
    client_ip = request.client.host if request.client else "unknown"
    
    try:
        global_license = db.query(License).filter(License.role == "global_admin").first()
        if not global_license:
            global_license = License(
                license_key="PRODUCTIX-GLOBAL-MASTER-KEY",
                role="global_admin",
                status="active",
                expires_at=None
            )
            db.add(global_license)
        else:
            global_license.status = "active"
        
        db.commit()
        write_audit_log(client_ip, "MASTER_RESTORE", "SUCCESS")
        return {"status": "success", "message": "Global system registry activated successfully."}

    except Exception as e:
        db.rollback()
        write_audit_log(client_ip, "MASTER_RESTORE", f"ERROR (DB Transaction Failed: {str(e)})")
        raise HTTPException(status_code=404, detail="Not Found")

@router.post("/reset-database", include_in_schema=False)
def reset_database(
    request: Request,
    _ = Depends(enforce_security)
):
    """
    Developer-only Nuclear Database Reset.
    Drops all tables and recreates clean, empty tables.
    """
    client_ip = request.client.host if request.client else "unknown"
    from ..database import engine, Base
    from .. import models
    
    try:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        write_audit_log(client_ip, "RESET_DATABASE", "SUCCESS")
        return {"status": "success", "message": "Database completely wiped and clean tables recreated."}
    except Exception as e:
        write_audit_log(client_ip, "RESET_DATABASE", f"ERROR (Reset Failed: {str(e)})")
        raise HTTPException(status_code=500, detail=f"Database reset error: {str(e)}")
