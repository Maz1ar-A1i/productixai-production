import os
import hmac
import hashlib
import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import License, Organization, User

router = APIRouter(prefix="/api/license", tags=["License Validation"])

# Pydantic validation schemas
class LicenseValidateRequest(BaseModel):
    licenseKey: str
    accountId: Optional[str] = None
    accountRole: Optional[str] = None
    machineId: Optional[str] = None

class LicenseValidateResponse(BaseModel):
    valid: bool
    reason: str
    expiresAt: Optional[str] = None
    signature: Optional[str] = None

def get_signing_key() -> str:
    """Return the license signing key from environment variables or a default fallback."""
    return os.getenv("LICENSE_SIGNING_KEY", "PRODUCTIX_SECRET_LICENSE_SIGNING_KEY_2026_DEFAULT")

def sign_response(payload: dict) -> str:
    """Generate a HMAC-SHA256 signature for the given payload dict."""
    signing_key = get_signing_key()
    # Sort keys to ensure stable serialized string representation
    serialized_payload = json.dumps(payload, sort_keys=True).encode("utf-8")
    return hmac.new(signing_key.encode("utf-8"), serialized_payload, hashlib.sha256).hexdigest()

@router.post("/validate", response_model=LicenseValidateResponse)
def validate_license(
    request: LicenseValidateRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    Validates client license status.
    Implements a cascade priority check:
    1. Global Admin Master Kill Switch
    2. Individual license key validity
    3. OTP Machine-Lock binding check (first machine claims the key permanently)
    """
    machine_id = request.machineId

    # ── Step 1: Check Global Admin License Status First (Master Kill Switch) ──
    global_admin_license = db.query(License).filter(License.role == "global_admin").first()
    
    if global_admin_license and global_admin_license.status == "revoked":
        res_payload = {
            "valid": False,
            "reason": "SYSTEM_SUSPENDED",
            "expiresAt": None
        }
        sig = sign_response(res_payload)
        res_payload["signature"] = sig
        response.headers["X-License-Signature"] = sig
        return LicenseValidateResponse(**res_payload)

    # ── Step 2: Validate the Individual License Key ──
    license_key = request.licenseKey.strip()
    license_record = db.query(License).filter(License.license_key == license_key).first()

    if not license_record:
        res_payload = {
            "valid": False,
            "reason": "REVOKED",
            "expiresAt": None
        }
    elif license_record.status == "revoked":
        res_payload = {
            "valid": False,
            "reason": "REVOKED",
            "expiresAt": license_record.expires_at.isoformat() if license_record.expires_at else None
        }
    elif license_record.expires_at and license_record.expires_at < datetime.utcnow():
        # License has expired naturally
        res_payload = {
            "valid": False,
            "reason": "EXPIRED",
            "expiresAt": license_record.expires_at.isoformat()
        }
    else:
        # ── Step 3: OTP Machine-Lock Binding Check ──
        # global_admin keys are exempt from machine binding
        if license_record.role != "global_admin" and machine_id:
            bound = license_record.bound_machine_id

            if not bound:
                # First use — bind this key to this machine permanently
                license_record.bound_machine_id = machine_id
                license_record.first_used_at = datetime.utcnow()
                db.commit()
                # Fall through to ACTIVE
            elif bound != machine_id:
                # Key is already claimed by a different machine — REJECT
                res_payload = {
                    "valid": False,
                    "reason": "MACHINE_MISMATCH",
                    "expiresAt": license_record.expires_at.isoformat() if license_record.expires_at else None
                }
                sig = sign_response(res_payload)
                res_payload["signature"] = sig
                response.headers["X-License-Signature"] = sig
                return LicenseValidateResponse(**res_payload)
            # else: same machine, allow through to ACTIVE

        # License is active and valid!
        res_payload = {
            "valid": True,
            "reason": "ACTIVE",
            "expiresAt": license_record.expires_at.isoformat() if license_record.expires_at else None
        }

    # Generate cryptographic signature to verify response authenticity
    sig = sign_response(res_payload)
    res_payload["signature"] = sig
    
    # Send signature in response header for client to verify
    response.headers["X-License-Signature"] = sig
    
    return LicenseValidateResponse(**res_payload)
