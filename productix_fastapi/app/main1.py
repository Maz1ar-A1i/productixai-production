from fastapi import FastAPI, Depends


from .router import Dashboard, Productivity_calculator, agent, ai_analysis, analytics, chatbot, login
from .router import auth, User
from .database import Base, engine
from .router import organization
from .router import Product
from .router import Batch
from fastapi.middleware.cors import CORSMiddleware
from .router import shift_entries
from .router import data_records
from .router import alerts
from fastapi.security import OAuth2PasswordBearer
from fastapi.openapi.utils import get_openapi
from .router import system_admin_router
from .router import license_router
from .router import internal_admin
from .router import client_license_router

# ── New Co-Pilot Routers (Phase 3–5) ──────────────────────────────────────────
from .router import feed
from .router import agents as agents_router
from .plugins.telco import router as telco_router
from .plugins.retail import router as retail_router
from .plugins.automobile import router as auto_router
from .router import formulas as formulas_router



#Base.metadata.drop_all(bind=engine)   # drops all tables
Base.metadata.create_all(bind=engine) 

from .database import auto_migrate_db
auto_migrate_db(engine)

# Auto-provision Global Admin master license if missing
from .models import License
from .database import SessionLocal
db = SessionLocal()
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
        db.commit()
        print("[*] Provisioned default Global Admin master license key.")
except Exception as e:
    print(f"[!] Failed to auto-provision Global Admin license: {e}")
    db.rollback()
finally:
    db.close()

app = FastAPI(title="Multi-tenant Productivity CRM")

import os

origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "https://productix.techohub.net",
]

env_origins = os.getenv("CORS_ORIGINS")
if env_origins:
    origins.extend([org.strip() for org in env_origins.split(",") if org.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,       # Allowed origins
    allow_credentials=True,
    allow_methods=["*"],         # Allow all HTTP methods
    allow_headers=["*"],         # Allow all headers
)

@app.on_event("startup")
async def startup_event():
    import os
    if os.getenv("PRODUCTIX_ENFORCE_CLIENT_LICENSING", "true").lower() == "true":
        from .client_license_manager import check_license_status, start_periodic_license_polling
        print("[*] Client-side licensing enforcement active. Performing startup check...")
        check_license_status()
        start_periodic_license_polling()

@app.middleware("http")
async def enforce_client_licensing(request, call_next):
    import os
    enforce_licensing = os.getenv("PRODUCTIX_ENFORCE_CLIENT_LICENSING", "true").lower() == "true"
    
    if enforce_licensing:
        if request.method == "OPTIONS":
            return await call_next(request)
            
        path = request.url.path
        
        # Skip static frontend assets — these are served by StaticFiles and must
        # never be blocked by the licensing layer.  Covers the SPA index, JS/CSS
        # bundles, images, fonts, favicon, etc.
        static_extensions = (
            ".html", ".js", ".css", ".png", ".jpg", ".jpeg", ".gif",
            ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".map",
        )
        if path == "/" or path.endswith(static_extensions):
            return await call_next(request)
        
        unprotected_paths = [
            "/api/license/local-status",
            "/api/license/register-local",
            "/api/license/validate",
            "/api/internal/master-kill",
            "/api/internal/master-restore",
            "/openapi.json",
            "/docs",
            "/redoc",
            "/auth/register",
            "/auth/login",
            "/login/login",
            "/users/update-credentials"
        ]
        
        # Check if the requested path is unprotected
        is_unprotected = any(path == up or path.startswith(up + "/") or path.startswith(up + "?") for up in unprotected_paths)
        
        if not is_unprotected:
            # 1. Decode token to check if user is system_admin or check their organization ID
            auth_header = request.headers.get("Authorization")
            
            # No auth header = unauthenticated request (page load, login page,
            # or an API call that will be rejected by the endpoint's own
            # Depends(get_current_user) anyway).  Let it through.
            if not auth_header or not auth_header.startswith("Bearer "):
                return await call_next(request)
            
            is_system_admin = False
            user_org_id = None
            token = auth_header.split(" ")[1]
            try:
                from .auth import decode_token
                decoded = decode_token(token)
                if decoded:
                    user_org_id = decoded.organization_id
                    if decoded.role == "system_admin":
                        is_system_admin = True
            except Exception:
                pass
            
            # 2. Bypassed for system admin
            if not is_system_admin:
                from .database import SessionLocal
                from .models import License
                from .client_license_manager import read_encrypted_cache
                from datetime import datetime
                
                # Get cached license key
                cache = read_encrypted_cache()
                cached_key = cache.get("license_key") if cache else None
                
                db = SessionLocal()
                try:
                    # Check Global Master Kill Switch
                    global_license = db.query(License).filter(License.role == "global_admin").first()
                    if global_license and global_license.status == "revoked":
                        from fastapi.responses import JSONResponse
                        return JSONResponse(
                            status_code=403,
                            content={"detail": "LICENSE_REQUIRED", "reason": "SYSTEM_SUSPENDED"}
                        )
                    
                    if user_org_id:
                        # Check organization's license key status in DB directly, matching the cached key
                        lic = db.query(License).filter(
                            License.organization_id == user_org_id,
                            License.license_key == cached_key,
                            License.status == "active"
                        ).first()
                        
                        # Handle expiration check
                        if lic and lic.expires_at and lic.expires_at < datetime.utcnow():
                            lic.status = "expired"
                            db.commit()
                            lic = None
                            
                        if not lic:
                            # Check if the org has any active license key (but different from cache)
                            any_active = db.query(License).filter(
                                License.organization_id == user_org_id,
                                License.status == "active"
                            ).first()
                            
                            if any_active:
                                # We have an active key, but it's not registered on this machine yet
                                reason = "UNLICENSED"
                            else:
                                # Find if there is an expired/revoked key to return exact reason
                                any_lic = db.query(License).filter(
                                    License.organization_id == user_org_id
                                ).order_by(License.id.desc()).first()
                                reason = any_lic.status.upper() if any_lic else "UNLICENSED"
                                
                            from fastapi.responses import JSONResponse
                            return JSONResponse(
                                status_code=403,
                                content={"detail": "LICENSE_REQUIRED", "reason": reason}
                            )
                    else:
                        # Authenticated but no organization ID and not system admin -> block
                        from fastapi.responses import JSONResponse
                        return JSONResponse(
                            status_code=403,
                            content={"detail": "LICENSE_REQUIRED", "reason": "UNLICENSED"}
                        )
                except Exception as e:
                    print(f"[!] Middleware DB error checking license: {e}")
                finally:
                    db.close()
                    
    return await call_next(request)

# Middleware to help handle trailing slashes for the packaged app
@app.middleware("http")
async def fix_trailing_slash(request, call_next):
    path = request.url.path
    # List of routes that we know exist and might need a slash handle
    api_roots = ["/products", "/batches", "/shifts", "/auth", "/login", "/analytics"]
    
    if path in api_roots:
        from fastapi.responses import RedirectResponse
        # Use 307 Temporary Redirect to preserve POST body and method!
        return RedirectResponse(
            url=str(request.url).replace(path, path + "/"),
            status_code=307
        )
    return await call_next(request)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# Custom OpenAPI schema with security definition
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="My API",
        version="1.0.0",
        description="API with JWT auth",
        routes=app.routes,
    )
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
    }
    for path in openapi_schema["paths"]:
        for method in openapi_schema["paths"][path]:
            openapi_schema["paths"][path][method]["security"] = [{"BearerAuth": []}]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

app.include_router(auth.router)
app.include_router(User.router)
app.include_router(organization.router)
app.include_router(Product.router)
app.include_router(Batch.router)
app.include_router(shift_entries.router)
app.include_router(agent.router)
app.include_router(Dashboard.router)
app.include_router(ai_analysis.router)
app.include_router(analytics.router)
app.include_router(chatbot.router)
app.include_router(login.router)
app.include_router(Productivity_calculator.router)
app.include_router(system_admin_router.router)
app.include_router(license_router.router)
app.include_router(internal_admin.router)
app.include_router(client_license_router.router)

app.include_router(alerts.router)
app.include_router(data_records.router)

from .router import custom_chatbot
app.include_router(custom_chatbot.router)


# ── KPI Layer ─────────────────────────────────────────────────────────────────
from .router import kpi as kpi_router
app.include_router(kpi_router.router)

# ── Co-Pilot API Routers ──────────────────────────────────────────────────────
app.include_router(feed.router,          prefix="/api")
app.include_router(agents_router.router, prefix="/api")
app.include_router(telco_router.router,  prefix="/api")
app.include_router(retail_router.router, prefix="/api")
app.include_router(auto_router.router,   prefix="/api")
app.include_router(formulas_router.router, prefix="/api")
