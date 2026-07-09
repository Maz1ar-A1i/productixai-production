from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from .. import models, schemas, deps, auth
from ..database import get_db

router = APIRouter(prefix="/users", tags=["Users"])

# -------------------------------
# List users in the current org
# -------------------------------
@router.get("/", response_model=List[schemas.UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    return (
        db.query(models.User)
        .filter(models.User.organization_id == current_user.organization_id)
        .all()
    )

# -------------------------------
# Create new user (org_admin only)
# -------------------------------
@router.post("/", response_model=schemas.UserResponse)
def create_user(
    user_in: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    # Prevent duplicate emails
    existing = db.query(models.User).filter(models.User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    # Check user limit for organization
    org = db.query(models.Organization).filter(models.Organization.id == current_user.organization_id).first()
    user_limit = org.user_limit if org and org.user_limit is not None else 5

    current_count = db.query(models.User).filter(
        models.User.organization_id == current_user.organization_id,
        models.User.role == models.UserRole.org_user
    ).count()

    if current_count >= user_limit:
        raise HTTPException(
            status_code=400,
            detail=f"User creation limit reached ({current_count}/{user_limit}). Contact Super Admin to increase your limit."
        )

    if user_in.role == models.UserRole.system_admin:
        raise HTTPException(
            status_code=400,
            detail="Creating system admin accounts via this API is not allowed."
        )

    hashed = auth.hash_password(user_in.password)
    user = models.User(
        name=user_in.name,
        email=user_in.email,
        password_hash=hashed,
        role=user_in.role or "org_user",
        organization_id=current_user.organization_id,
        is_verified=True,   # Explicitly set: local users must be verified to login
        is_active=True,     # Explicitly set: local users are active by default
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

# -------------------------------
# Get my profile
# -------------------------------
@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(deps.get_current_user)):
    return current_user

# -------------------------------
# Delete user (org_admin only)
# -------------------------------
@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    # Fetch the user in the same organization
    user = (
        db.query(models.User)
        .filter(
            models.User.id == user_id,
            models.User.organization_id == current_user.organization_id
        )
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deleting self
    if user.id == current_user.id:
        raise HTTPException(status_code=403, detail="You cannot delete yourself")

    # Prevent deleting system admin
    if user.role == "system_admin":
        raise HTTPException(status_code=403, detail="You cannot delete system admin")

    # Only org_users can be deleted
    if user.role != "org_user":
        raise HTTPException(status_code=403, detail="You can only delete org users")

    db.delete(user)
    db.commit()
    return {"detail": "User deleted successfully"}


# -------------------------------
# Edit user (org_admin only) — Task 3
# -------------------------------
class AdminEditUserRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    chatbot_name: Optional[str] = None
    chatbot_persona: Optional[str] = None
    analysis_goals: Optional[List[str]] = None

@router.put("/{user_id}", response_model=schemas.UserResponse)
def admin_edit_user(
    user_id: int,
    payload: AdminEditUserRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    """Org admin can update a user's name, email, password, and custom chatbot settings."""
    user = db.query(models.User).filter(
        models.User.id == user_id,
        models.User.organization_id == current_user.organization_id,
        models.User.role == models.UserRole.org_user
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found in your organization")

    if payload.name is not None:
        user.name = payload.name.strip() or user.name

    if payload.email is not None:
        new_email = payload.email.strip()
        if new_email != user.email:
            existing = db.query(models.User).filter(models.User.email == new_email).first()
            if existing:
                raise HTTPException(status_code=400, detail="Email already in use")
            user.email = new_email

    if payload.password is not None and payload.password.strip() != "":
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        user.password_hash = auth.hash_password(payload.password)
        user.requires_password_change = False

    if payload.chatbot_name is not None:
        user.chatbot_name = payload.chatbot_name.strip() or "Productix AI"

    if payload.chatbot_persona is not None:
        user.chatbot_persona = payload.chatbot_persona.strip() or "a helpful AI assistant"

    if payload.analysis_goals is not None:
        import json
        user.analysis_goals = json.dumps(payload.analysis_goals)
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(user, "analysis_goals")

    db.commit()
    db.refresh(user)
    return user




# -------------------------------
# List units assigned to a user
# -------------------------------
@router.get("/{user_id}/assigned-units", response_model=List[schemas.ProductResponse])
def list_assigned_units(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    # Verify user belongs to org
    user = db.query(models.User).filter(
        models.User.id == user_id,
        models.User.organization_id == current_user.organization_id
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get assigned products
    assignments = db.query(models.UserProductAssignment).filter(
        models.UserProductAssignment.user_id == user_id
    ).all()
    
    product_ids = [a.product_id for a in assignments]
    
    products = db.query(models.Product).filter(
        models.Product.id.in_(product_ids)
    ).all() if product_ids else []

    # Map/parse JSON fields for safety
    import json
    for p in products:
        if isinstance(p.input_fields, str) and p.input_fields:
            p.input_fields = json.loads(p.input_fields.replace("'", '"'))
        if isinstance(p.output_fields, str) and p.output_fields:
            p.output_fields = json.loads(p.output_fields.replace("'", '"'))

    return products


# -------------------------------
# Assign units to a user
# -------------------------------

class AssignUnitsPayload(BaseModel):
    product_ids: List[int]

@router.post("/{user_id}/assign-units")
def assign_units(
    user_id: int,
    payload: AssignUnitsPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    # Verify user belongs to org
    user = db.query(models.User).filter(
        models.User.id == user_id,
        models.User.organization_id == current_user.organization_id
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify all product_ids belong to org
    for pid in payload.product_ids:
        product = db.query(models.Product).filter(
            models.Product.id == pid,
            models.Product.organization_id == current_user.organization_id
        ).first()
        if not product:
            raise HTTPException(status_code=400, detail=f"Unit with ID {pid} not found in your organization")

    # Delete existing assignments
    db.query(models.UserProductAssignment).filter(
        models.UserProductAssignment.user_id == user_id
    ).delete()

    # Add new assignments
    for pid in payload.product_ids:
        assignment = models.UserProductAssignment(
            user_id=user_id,
            product_id=pid
        )
        db.add(assignment)

    db.commit()
    return {"detail": "Units assigned successfully"}


class UpdateCredentialsRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None

@router.put("/update-credentials", response_model=schemas.UserResponse)
def update_credentials(
    payload: UpdateCredentialsRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    import os
    import hmac
    import hashlib
    import json
    import time
    import requests
    from ..client_license_manager import get_central_server_url

    # 1. Local Validations and Assignments
    if payload.name is not None:
        current_user.name = payload.name
    
    new_email = current_user.email
    if payload.email is not None:
        email_str = payload.email.strip()
        if email_str != current_user.email:
            existing = db.query(models.User).filter(models.User.email == email_str).first()
            if existing:
                raise HTTPException(status_code=400, detail="Email already registered locally")
            new_email = email_str

    new_password = ""
    if payload.password is not None:
        if len(payload.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
        new_password = payload.password

    # 2. Synchronize to Central Licensing Server
    if current_user.role != models.UserRole.system_admin:
        server_url = get_central_server_url()
        timestamp = int(time.time())
        update_payload = {
            "username": current_user.email,
            "new_username": new_email,
            "new_password": new_password,
            "timestamp": timestamp
        }
        
        # Serialize with sorted keys (alphabetical order) and no spaces
        serialized = json.dumps(update_payload, sort_keys=True, separators=(',', ':'))
        signing_key = os.getenv("LICENSE_SIGNING_KEY", "PRODUCTIX_SECRET_LICENSE_SIGNING_KEY_2026_DEFAULT")
        signature = hmac.new(signing_key.encode("utf-8"), serialized.encode("utf-8"), hashlib.sha256).hexdigest()
        
        headers = {
            "Content-Type": "application/json",
            "X-Update-Signature": signature
        }
        
        try:
            update_endpoint = f"{server_url}/api/update_profile.php"
            response = requests.post(update_endpoint, json=update_payload, headers=headers, timeout=8)
            if response.status_code == 409:
                raise HTTPException(status_code=400, detail="Email/Username already registered on central server")
            elif response.status_code != 200:
                detail_msg = "Failed to sync credentials with central licensing server"
                try:
                    res_json = response.json()
                    if "error" in res_json:
                        detail_msg = res_json["error"]
                except:
                    pass
                raise HTTPException(status_code=400, detail=detail_msg)
        except requests.RequestException as e:
            raise HTTPException(
                status_code=503,
                detail="Central licensing server is unreachable. Please check your internet connection before changing credentials."
            )

    # 3. Apply changes locally and commit
    current_user.email = new_email
    if payload.password is not None:
        current_user.password_hash = auth.hash_password(payload.password)
    current_user.requires_password_change = False
    
    db.commit()
    db.refresh(current_user)
    return current_user
