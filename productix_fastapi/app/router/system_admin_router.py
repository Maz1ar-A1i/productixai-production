# app/routers/system_admin.py

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Organization, Subscription, User, UserRole
from ..schemas import (
    OrganizationResponse,
    OrganizationBase,
    UserResponse,
    UserCreate,
    SubscriptionTimerUpdate
)
from ..deps import require_system_admin
from ..auth import hash_password

router = APIRouter(prefix="/system-admin", tags=["System Admin"])

# ------------------------------------------------
# Organizations
# ------------------------------------------------
@router.get("/organizations", response_model=List[OrganizationResponse])
def list_organizations(db: Session = Depends(get_db), admin=Depends(require_system_admin)):
    orgs = db.query(Organization).all()
    now = datetime.utcnow()
    updated = False
    
    for org in orgs:
        if org.status == "active" and org.subscription and org.subscription.end_date:
            if org.subscription.end_date < now:
                org.status = "disabled"
                updated = True
    
    if updated:
        db.commit()
        # Refresh orgs to get updated status
        orgs = db.query(Organization).all()
        
    return orgs


@router.post("/organizations", response_model=OrganizationResponse)
def create_organization(
    org_in: OrganizationBase,
    db: Session = Depends(get_db),
    admin=Depends(require_system_admin)
):
    org = Organization(**org_in.dict())
    db.add(org)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Organization already exists or invalid data")
    db.refresh(org)
    return org


@router.put("/organizations/{org_id}", response_model=OrganizationResponse)
def update_organization(
    org_id: int,
    org_in: OrganizationBase,
    db: Session = Depends(get_db),
    admin=Depends(require_system_admin)
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.name = org_in.name
    org.subscription_plan = org_in.subscription_plan
    db.commit()
    db.refresh(org)
    return org


@router.delete("/organizations/{org_id}")
def delete_organization(
    org_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_system_admin)
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    db.delete(org)
    db.commit()
    return {"detail": "Organization deleted"}


# ------------------------------------------------
# Users
# ------------------------------------------------
@router.get("/users", response_model=List[UserResponse])
def list_all_users(db: Session = Depends(get_db), admin=Depends(require_system_admin)):
    return db.query(User).all()


@router.post("/organizations/{org_id}/users", response_model=UserResponse)
def create_org_user(
    org_id: int,
    user_in: UserCreate,   # contains email, password, role
    db: Session = Depends(get_db),
    admin=Depends(require_system_admin)
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if user_in.role == UserRole.system_admin:
        raise HTTPException(status_code=400, detail="Cannot create multiple global admin accounts.")

    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    new_user = User(
        email=user_in.email,
        password_hash=hash_password(user_in.password),
        role=user_in.role,
        organization_id=org_id,
        is_verified=True, # Auto-verify users created by admin
        requires_password_change=True
    )
    db.add(new_user)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Could not create user (Integrity error)")
    db.refresh(new_user)
    return new_user

@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), admin=Depends(require_system_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return {"detail": "User deleted"}


# ------------------------------------------------
# Subscription Management
# ------------------------------------------------
@router.get("/organizations/{org_id}/subscription")
def view_subscription(org_id: int, db: Session = Depends(get_db), admin=Depends(require_system_admin)):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    return {
        "organization": org.name,
        "subscription_plan": org.subscription_plan,
        "is_active": org.is_active
    }


@router.post("/organizations/{org_id}/subscription/cancel")
def cancel_subscription(org_id: int, db: Session = Depends(get_db), admin=Depends(require_system_admin)):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    if org.subscription:
        org.subscription.status = "cancelled"
    
    # Update the organization status column
    org.status = "disabled"

    db.add(org)
    db.commit()
    db.refresh(org)
    return {"subscription": {"status": org.subscription.status}, "org_status": org.status}


@router.post("/organizations/{org_id}/subscription/enable")
def enable_subscription(org_id: int, db: Session = Depends(get_db), admin=Depends(require_system_admin)):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Update subscription table
    if not org.subscription:
        org.subscription = Subscription(
            organization_id=org.id,
            plan_name=org.subscription_plan,
            status="active",
            start_date=datetime.utcnow()
        )
    else:
        org.subscription.status = "active"

    # Update the organization status column
    org.status = "active"

    db.add(org)
    db.commit()
    db.refresh(org)
    return {"subscription": {"status": org.subscription.status}, "org_status": org.status}


# ------------------------------------------------
# Generic Status Toggles (Active/Inactive)
# ------------------------------------------------

@router.put("/organizations/{org_id}/toggle-status", response_model=OrganizationResponse)
def toggle_organization_status(
    org_id: int, 
    db: Session = Depends(get_db), 
    admin=Depends(require_system_admin)
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    org.status = "disabled" if org.status == "active" else "active"
    db.commit()
    db.refresh(org)
    return org


@router.put("/organizations/{org_id}/subscription-timer", response_model=OrganizationResponse)
def set_subscription_timer(
    org_id: int,
    timer_in: SubscriptionTimerUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_system_admin)
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    now = datetime.utcnow()
    end_date = now + timedelta(days=timer_in.days)

    if not org.subscription:
        org.subscription = Subscription(
            organization_id=org.id,
            plan_name=org.subscription_plan or "pro",
            status="active",
            start_date=now,
            end_date=end_date
        )
    else:
        org.subscription.status = "active"
        org.subscription.end_date = end_date

    org.status = "active"
    db.commit()
    db.refresh(org)
    return org


@router.put("/users/{user_id}/toggle-status", response_model=UserResponse)
def toggle_user_status(
    user_id: int, 
    db: Session = Depends(get_db), 
    admin=Depends(require_system_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user


# ------------------------------------------------
# License Management
# ------------------------------------------------
import uuid

@router.get("/licenses")
def list_licenses(db: Session = Depends(get_db), admin=Depends(require_system_admin)):
    """List all licenses in the central registry, with their associated organization name."""
    from ..models import License, Organization
    licenses = db.query(License).filter(License.role != "global_admin").all()
    res = []
    for lic in licenses:
        org_name = "Global Registry"
        if lic.organization_id:
            org = db.query(Organization).filter(Organization.id == lic.organization_id).first()
            if org:
                org_name = org.name
        
        res.append({
            "id": lic.id,
            "license_key": lic.license_key,
            "role": lic.role,
            "status": lic.status,
            "expires_at": lic.expires_at.isoformat() if lic.expires_at else None,
            "created_at": lic.created_at.isoformat() if lic.created_at else None,
            "organization_id": lic.organization_id,
            "organization_name": org_name
        })
    return res

class CreateLicenseSchema(BaseModel):
    organization_id: int
    duration_days: int

@router.post("/licenses")
def create_license(
    lic_in: CreateLicenseSchema,
    db: Session = Depends(get_db),
    admin=Depends(require_system_admin)
):
    """Generate and issue a new cryptographic license key for an organization."""
    from ..models import License, Organization
    org = db.query(Organization).filter(Organization.id == lic_in.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Generate a beautiful license key format: PX-XXXX-XXXX-XXXX
    raw_uuid = str(uuid.uuid4()).upper().replace("-", "")
    key_formatted = f"PX-{raw_uuid[0:4]}-{raw_uuid[4:8]}-{raw_uuid[8:12]}-{raw_uuid[12:16]}"

    expires_at = datetime.utcnow() + timedelta(days=lic_in.duration_days)

    new_license = License(
        license_key=key_formatted,
        role="org_admin",
        status="active",
        expires_at=expires_at,
        organization_id=lic_in.organization_id
    )

    db.add(new_license)
    db.commit()
    db.refresh(new_license)

    return {
        "id": new_license.id,
        "license_key": new_license.license_key,
        "role": new_license.role,
        "status": new_license.status,
        "expires_at": new_license.expires_at.isoformat(),
        "organization_id": new_license.organization_id,
        "organization_name": org.name
    }

@router.put("/licenses/{license_id}/revoke")
def revoke_license(
    license_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_system_admin)
):
    """Instantly revoke an active organization license."""
    from ..models import License
    lic = db.query(License).filter(License.id == license_id).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")

    if lic.role == "global_admin":
        raise HTTPException(status_code=400, detail="Global master license cannot be modified via this API.")

    lic.status = "revoked"
    db.commit()
    db.refresh(lic)
    return {"status": "success", "message": f"License {lic.license_key} revoked."}

class ExtendLicenseSchema(BaseModel):
    days: int

@router.put("/licenses/{license_id}/extend")
def extend_license(
    license_id: int,
    extend_in: ExtendLicenseSchema,
    db: Session = Depends(get_db),
    admin=Depends(require_system_admin)
):
    """Extend the expiration date of an existing license by N days."""
    from ..models import License
    lic = db.query(License).filter(License.id == license_id).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")

    if lic.role == "global_admin":
        raise HTTPException(status_code=400, detail="Global master license cannot be modified via this API.")

    if not lic.expires_at:
        raise HTTPException(status_code=400, detail="Cannot extend an open-ended license.")

    # Extend from current expiry if it is in the future, else extend from now
    current_expiry = lic.expires_at if lic.expires_at > datetime.utcnow() else datetime.utcnow()
    lic.expires_at = current_expiry + timedelta(days=extend_in.days)
    lic.status = "active"  # Re-enable if it was expired
    db.commit()
    db.refresh(lic)
    
    return {
        "status": "success",
        "message": f"License extended by {extend_in.days} days.",
        "expires_at": lic.expires_at.isoformat()
    }

@router.put("/licenses/{license_id}/reactivate")
def reactivate_license(
    license_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_system_admin)
):
    """Instantly reactivate a revoked organization license."""
    from ..models import License
    lic = db.query(License).filter(License.id == license_id).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")

    if lic.role == "global_admin":
        raise HTTPException(status_code=400, detail="Global master license cannot be modified via this API.")

    lic.status = "active"
    db.commit()
    db.refresh(lic)
    return {"status": "success", "message": f"License {lic.license_key} reactivated."}


@router.delete("/licenses/{license_id}")
def delete_license(
    license_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_system_admin)
):
    """Permanently delete a license key from the central registry."""
    from ..models import License
    lic = db.query(License).filter(License.id == license_id).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")

    if lic.role == "global_admin":
        raise HTTPException(status_code=400, detail="Global master license cannot be deleted.")

    db.delete(lic)
    db.commit()
    return {"status": "success", "message": "License deleted successfully."}



