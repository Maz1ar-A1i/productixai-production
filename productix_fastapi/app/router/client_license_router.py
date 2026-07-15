from fastapi import APIRouter, HTTPException, status, Request, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from ..database import get_db
from ..client_license_manager import (
    check_license_status,
    IS_LICENSED,
    LICENSE_BLOCK_REASON,
    LICENSE_KEY,
    EXPIRES_AT,
    HOURS_LEFT,
    get_machine_id
)

router = APIRouter(prefix="/license", tags=["Local Client License"])

class RegisterLocalRequest(BaseModel):
    licenseKey: str

class LocalStatusResponse(BaseModel):
    valid: bool
    reason: str
    licenseKey: str
    expiresAt: Optional[str] = None
    hoursLeft: float
    machineId: str

@router.get("/local-status", response_model=LocalStatusResponse)
def get_local_status(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Returns the current local licensing status of the client application.
    Checks the database directly, scoped to the user's organization if authenticated.
    """
    valid = False
    reason = "UNLICENSED"
    license_key = ""
    expires_at = None
    hours_left = 0.0
    machine_id = get_machine_id()

    # Get cached license key
    from ..client_license_manager import read_encrypted_cache
    cache = read_encrypted_cache()
    cached_key = cache.get("license_key") if cache else None

    # Get token from Authorization header if present
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        from ..auth import decode_token
        decoded = decode_token(token)
        if decoded:
            if decoded.role == "system_admin":
                valid = True
                reason = "ACTIVE"
            elif decoded.organization_id:
                # First check Master Kill Switch
                from ..models import License
                global_license = db.query(License).filter(License.role == "global_admin").first()
                if global_license and global_license.status == "revoked":
                    valid = False
                    reason = "SYSTEM_SUSPENDED"
                else:
                    # Determine the license key to check (cache key first, fallback to DB key)
                    key_to_check = cached_key
                    if not key_to_check:
                        db_lic = db.query(License).filter(
                            License.organization_id == decoded.organization_id
                        ).order_by(License.id.desc()).first()
                        if db_lic:
                            key_to_check = db_lic.license_key

                    # Check organization's license matching the key
                    lic = None
                    if key_to_check:
                        lic = db.query(License).filter(
                            License.organization_id == decoded.organization_id,
                            License.license_key == key_to_check,
                            License.status == "active"
                        ).first()
                        
                        from datetime import datetime
                        if lic and lic.expires_at and lic.expires_at < datetime.utcnow():
                            lic.status = "expired"
                            db.commit()
                            lic = None

                        # If not active in DB, or cache doesn't exist, or cache is not active:
                        # trigger online verification to see if it was re-activated!
                        from ..client_license_manager import read_encrypted_cache
                        cache_data = read_encrypted_cache()
                        if not lic or not cache_data or cache_data.get("cached_status") != "active":
                            from ..client_license_manager import check_license_status
                            check_license_status(key_to_check)
                            
                            # Query again after checking
                            lic = db.query(License).filter(
                                License.organization_id == decoded.organization_id,
                                License.license_key == key_to_check,
                                License.status == "active"
                            ).first()
                            
                            # Reload cache key
                            cache_data = read_encrypted_cache()
                            cached_key = cache_data.get("license_key") if cache_data else None

                    if lic:
                        valid = True
                        reason = "ACTIVE"
                        license_key = lic.license_key
                        expires_at = lic.expires_at.isoformat() if lic.expires_at else None
                        if lic.expires_at:
                            time_left = lic.expires_at - datetime.utcnow()
                            hours_left = max(0.0, time_left.total_seconds() / 3600.0)
                        else:
                            hours_left = 99999.0
                    else:
                        # Check if any expired/revoked license exists to get the reason
                        any_lic = db.query(License).filter(
                            License.organization_id == decoded.organization_id
                        ).order_by(License.id.desc()).first()
                        if any_lic:
                            reason = any_lic.status.upper() # REVOKED or EXPIRED
                            license_key = any_lic.license_key
                            expires_at = any_lic.expires_at.isoformat() if any_lic.expires_at else None
                        else:
                            reason = "UNLICENSED"

    return LocalStatusResponse(
        valid=valid,
        reason=reason,
        licenseKey=license_key,
        expiresAt=expires_at,
        hoursLeft=hours_left,
        machineId=machine_id
    )

@router.post("/register-local", response_model=LocalStatusResponse)
def register_local_license(
    request: RegisterLocalRequest,
    req: Request,
    db: Session = Depends(get_db)
):
    """
    Registers/activates a new license key locally for the logged-in organization.
    """
    # Decode token to verify organization
    auth_header = req.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required to register license.")
        
    token = auth_header.split(" ")[1]
    from ..auth import decode_token
    decoded = decode_token(token)
    if not decoded:
        raise HTTPException(status_code=401, detail="Invalid session token.")
        
    if decoded.role == "system_admin":
        raise HTTPException(status_code=400, detail="System admin does not need to register a license.")

    import requests
    from ..client_license_manager import get_central_server_url, verify_server_signature, write_encrypted_cache
    from .. import client_license_manager as clm
    from datetime import datetime

    server_url = get_central_server_url()
    machine_id = get_machine_id()
    license_key = request.licenseKey.strip()

    validate_endpoint = f"{server_url}/api/validate.php"
    payload = {
        "licenseKey": license_key,
        "machineId": machine_id
    }

    try:
        response = requests.post(validate_endpoint, json=payload, timeout=8)
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"License validation server returned status code {response.status_code}."
            )
        res_data = response.json()
    except requests.RequestException as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Central licensing server is unreachable. Please verify your internet connection."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error communicating with licensing server: {str(e)}"
        )

    server_sig = res_data.get("signature")
    if not server_sig or not verify_server_signature(res_data, server_sig):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cryptographic response verification failed. Response signature was invalid."
        )

    valid = res_data.get("valid", False)
    reason = res_data.get("reason", "REVOKED")
    expires_at_str = res_data.get("expiresAt")

    if not valid:
        # Update local DB if the license already exists in DB
        from ..models import License
        lic = db.query(License).filter(License.license_key == license_key).first()
        if lic:
            lic.status = reason.lower()
            db.commit()
        
        with clm.state_lock:
            clm.IS_LICENSED = False
            clm.LICENSE_BLOCK_REASON = reason
            clm.LICENSE_KEY = license_key
            clm.EXPIRES_AT = expires_at_str

        return LocalStatusResponse(
            valid=False,
            reason=reason,
            licenseKey=license_key,
            expiresAt=expires_at_str,
            hoursLeft=0.0,
            machineId=machine_id
        )

    # If valid, sync to local DB:
    from ..models import License
    lic = db.query(License).filter(License.license_key == license_key).first()
    
    parsed_expires_at = None
    if expires_at_str:
        try:
            parsed_expires_at = datetime.fromisoformat(expires_at_str)
        except ValueError:
            parsed_expires_at = datetime.fromisoformat(expires_at_str.replace(' ', 'T'))

    if lic:
        lic.organization_id = decoded.organization_id
        lic.status = "active"
        lic.expires_at = parsed_expires_at
        lic.bound_machine_id = machine_id
        if not lic.first_used_at:
            lic.first_used_at = datetime.utcnow()
        db.commit()
    else:
        lic = License(
            license_key=license_key,
            organization_id=decoded.organization_id,
            role="org_admin",
            status="active",
            expires_at=parsed_expires_at,
            bound_machine_id=machine_id,
            first_used_at=datetime.utcnow()
        )
        db.add(lic)
        db.commit()

    # Update cache
    new_cache = {
        "license_key": license_key,
        "last_validated": datetime.utcnow().isoformat(),
        "max_seen_time": datetime.utcnow().isoformat(),
        "expires_at": expires_at_str,
        "cached_status": "active"
    }
    write_encrypted_cache(new_cache)

    # Update memory state
    with clm.state_lock:
        clm.IS_LICENSED = True
        clm.LICENSE_BLOCK_REASON = "ACTIVE"
        clm.LICENSE_KEY = license_key
        clm.EXPIRES_AT = expires_at_str
        clm.HOURS_LEFT = 24.0

    return LocalStatusResponse(
        valid=True,
        reason="ACTIVE",
        licenseKey=license_key,
        expiresAt=expires_at_str,
        hoursLeft=24.0,
        machineId=machine_id
    )
