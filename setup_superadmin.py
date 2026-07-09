#!/usr/bin/env python
"""
Script to create a fresh database with global superadmin credentials.
This will set up the database with:
  Email: superadmin@productix.ai
  Password: set via SUPERADMIN_PASSWORD env var, or prompted securely at runtime.

Usage:
    SUPERADMIN_PASSWORD='your-strong-password' python setup_superadmin.py
"""

import sys
import os
import getpass
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from productix_fastapi.app.database import SessionLocal, Base, engine, auto_migrate_db
from productix_fastapi.app.models import User, Organization, UserRole
from passlib.context import CryptContext

# Create all tables
print("[*] Creating database tables...")
Base.metadata.create_all(bind=engine)

# Run auto-migration to ensure all columns exist
print("[*] Running auto-migration...")
auto_migrate_db(engine)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Read password from env or prompt securely at runtime
_admin_password = os.getenv("SUPERADMIN_PASSWORD")
if not _admin_password:
    _admin_password = getpass.getpass("Enter superadmin password: ")
    if not _admin_password or len(_admin_password) < 8:
        print("[ERROR] Password must be at least 8 characters.")
        sys.exit(1)

def setup_superadmin():
    db = SessionLocal()
    
    try:
        # Check if organization already exists
        org = db.query(Organization).filter(Organization.name == "Productix AI").first()
        
        if not org:
            # Create default organization
            org = Organization(
                name="Productix AI",
                subscription_plan="enterprise",
                status="active"
            )
            db.add(org)
            db.commit()
            db.refresh(org)
            print("[SUCCESS] Organization created!")
        else:
            print("[SUCCESS] Organization already exists!")
        
        # Check if superadmin already exists
        superadmin = db.query(User).filter(User.email == "superadmin@productix.ai").first()
        
        if superadmin:
            print("[INFO] Superadmin account already exists!")
            print("   Updating password...")
            superadmin.password_hash = pwd_context.hash(_admin_password)
            superadmin.is_verified = True
            superadmin.is_active = True
            db.commit()
            print("[SUCCESS] Superadmin password updated!")
        else:
            # Create new superadmin
            new_superadmin = User(
                organization_id=org.id,
                name="Super Admin",
                email="superadmin@productix.ai",
                password_hash=pwd_context.hash(_admin_password),
                role=UserRole.system_admin,
                is_verified=True,
                is_active=True
            )
            
            db.add(new_superadmin)
            db.commit()
            db.refresh(new_superadmin)
            
            print("[SUCCESS] Superadmin account created successfully!")
        
        print(f"   Email: superadmin@productix.ai")
        print(f"   Role: System Admin")
        print(f"   Organization: {org.name}")
        print("[OK] Password set successfully (not displayed for security).")
        
    except Exception as e:
        print(f"[ERROR] Error setting up superadmin: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    setup_superadmin()
