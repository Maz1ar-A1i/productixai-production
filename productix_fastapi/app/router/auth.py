from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from .. import models, schemas, auth, deps
from ..database import get_db

router = APIRouter(prefix="/auth", tags=["Auth"])


# -----------------------------------------------
# Combined Registration Request Body
# -----------------------------------------------
class RegisterRequest(BaseModel):
    user_in: schemas.UserCreate
    org_in: schemas.OrganizationCreate


# ------------------------
# REGISTER ORG + ADMIN
# ------------------------
@router.post("/register", response_model=schemas.UserResponse)
def register_org(body: RegisterRequest, db: Session = Depends(get_db)):
    raise HTTPException(
        status_code=403,
        detail="Registration is disabled. Accounts must be created by an administrator."
    )


# ------------------------
# LOGIN
# ------------------------
@router.post("/login", response_model=schemas.Token)
def login(user_in: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == user_in.email).first()
    if not user or not auth.verify_password(user_in.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = auth.create_access_token({
        "user_id": user.id,
        "role": user.role.value,
        "organization_id": user.organization_id
    })
    return {"access_token": token, "token_type": "bearer"}