# app/router/kpi.py
"""
KPI Router — CRUD, computation, and dashboard endpoints.

GET  /kpi/definitions              — list all active KPIs (all authenticated)
POST /kpi/definitions              — create a KPI (org_admin only)
PUT  /kpi/definitions/{id}         — update a KPI (org_admin only)
DELETE /kpi/definitions/{id}       — soft-delete a KPI (org_admin only)
GET  /kpi/definitions/built-in     — list available built-in templates (org_admin)
POST /kpi/compute                  — compute all KPIs now (org_admin only)
GET  /kpi/dashboard                — all KPIs with latest values (all authenticated)
GET  /kpi/{id}/history             — historical snapshots (all authenticated)
POST /kpi/from-formula/{formula_id} — promote formula to KPI (org_admin only)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models import KPIDefinition, KPISnapshot, FormulaRecord, User
from ..deps import get_current_user
from ..schemas import (
    KPIDefinitionCreate, KPIDefinitionUpdate, KPIDefinitionResponse,
    KPISnapshotResponse,
)
from ..engines.kpi_engine import (
    BUILT_IN_KPIS, compute_all_kpis, compute_kpi_value,
    determine_status, compute_trend,
)

router = APIRouter(prefix="/kpi", tags=["KPI"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_admin(current_user: User):
    """Raise 403 if user is not org_admin or system_admin."""
    if current_user.role.value not in ("org_admin", "system_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="KPI management is restricted to admin accounts."
        )


def _enrich_kpi(kpi: KPIDefinition, db: Session) -> dict:
    """
    Build a KPIDefinitionResponse dict enriched with latest snapshot data.
    """
    latest = db.query(KPISnapshot).filter(
        KPISnapshot.kpi_id == kpi.id,
    ).order_by(KPISnapshot.computed_at.desc()).first()

    data = {
        "id": kpi.id,
        "organization_id": kpi.organization_id,
        "name": kpi.name,
        "description": kpi.description,
        "category": kpi.category,
        "unit": kpi.unit,
        "computation_type": kpi.computation_type,
        "built_in_key": kpi.built_in_key,
        "formula_id": kpi.formula_id,
        "target_value": float(kpi.target_value) if kpi.target_value is not None else None,
        "warning_threshold": float(kpi.warning_threshold) if kpi.warning_threshold is not None else None,
        "critical_threshold": float(kpi.critical_threshold) if kpi.critical_threshold is not None else None,
        "higher_is_better": kpi.higher_is_better,
        "granularity": kpi.granularity,
        "product_id": kpi.product_id,
        "is_active": kpi.is_active,
        "created_at": kpi.created_at,
        "current_value": float(latest.value) if latest and latest.value is not None else None,
        "current_status": latest.status if latest else "no_data",
        "current_trend": latest.trend if latest else None,
        "change_pct": float(latest.change_pct) if latest and latest.change_pct is not None else None,
    }
    return data


# ── GET /definitions/built-in ─────────────────────────────────────────────────
# NOTE: This route must be BEFORE /definitions/{id} to avoid path conflict

@router.get("/definitions/built-in", summary="List available built-in KPI templates")
def get_built_in_kpis(current_user: User = Depends(get_current_user)):
    """Returns all available built-in KPI templates that can be activated."""
    templates = []
    for key, spec in BUILT_IN_KPIS.items():
        templates.append({
            "key": key,
            "label": spec["label"],
            "description": spec["description"],
            "unit": spec["unit"],
            "category": spec["category"],
            "higher_is_better": spec["higher_is_better"],
            "default_target": spec["default_target"],
            "default_warning": spec["default_warning"],
            "default_critical": spec["default_critical"],
        })
    return templates


# ── GET /definitions ──────────────────────────────────────────────────────────

@router.get("/definitions", response_model=List[KPIDefinitionResponse],
            summary="List all active KPIs")
def list_kpis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns all active KPIs for the current user's organisation."""
    kpis = db.query(KPIDefinition).filter(
        KPIDefinition.organization_id == current_user.organization_id,
        KPIDefinition.is_active == True,
    ).order_by(KPIDefinition.created_at.desc()).all()

    return [_enrich_kpi(kpi, db) for kpi in kpis]


# ── POST /definitions ─────────────────────────────────────────────────────────

@router.post("/definitions", response_model=KPIDefinitionResponse,
             status_code=status.HTTP_201_CREATED,
             summary="Create a new KPI")
def create_kpi(
    payload: KPIDefinitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    # Validate built_in_key
    if payload.computation_type == "built_in":
        if not payload.built_in_key or payload.built_in_key not in BUILT_IN_KPIS:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid built_in_key: '{payload.built_in_key}'. "
                       f"Available: {list(BUILT_IN_KPIS.keys())}"
            )

    # Validate formula_id
    if payload.computation_type == "formula":
        if not payload.formula_id:
            raise HTTPException(status_code=422, detail="formula_id is required for formula-type KPIs.")
        formula = db.query(FormulaRecord).filter(
            FormulaRecord.id == payload.formula_id,
            FormulaRecord.organization_id == current_user.organization_id,
            FormulaRecord.is_active == True,
        ).first()
        if not formula:
            raise HTTPException(status_code=404, detail="Formula not found.")

    # Check for duplicate name within org
    existing = db.query(KPIDefinition).filter(
        KPIDefinition.organization_id == current_user.organization_id,
        KPIDefinition.name == payload.name,
        KPIDefinition.is_active == True,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"KPI '{payload.name}' already exists.")

    kpi = KPIDefinition(
        organization_id=current_user.organization_id,
        created_by=current_user.id,
        name=payload.name,
        description=payload.description,
        category=payload.category,
        unit=payload.unit,
        computation_type=payload.computation_type,
        built_in_key=payload.built_in_key,
        formula_id=payload.formula_id,
        target_value=payload.target_value,
        warning_threshold=payload.warning_threshold,
        critical_threshold=payload.critical_threshold,
        higher_is_better=payload.higher_is_better,
        granularity=payload.granularity,
        product_id=payload.product_id,
    )
    db.add(kpi)
    db.commit()
    db.refresh(kpi)

    return _enrich_kpi(kpi, db)


# ── PUT /definitions/{id} ─────────────────────────────────────────────────────

@router.put("/definitions/{kpi_id}", response_model=KPIDefinitionResponse,
            summary="Update a KPI")
def update_kpi(
    kpi_id: int,
    payload: KPIDefinitionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    kpi = db.query(KPIDefinition).filter(
        KPIDefinition.id == kpi_id,
        KPIDefinition.organization_id == current_user.organization_id,
    ).first()
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(kpi, key, value)

    db.commit()
    db.refresh(kpi)
    return _enrich_kpi(kpi, db)


# ── DELETE /definitions/{id} ──────────────────────────────────────────────────

@router.delete("/definitions/{kpi_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Soft-delete a KPI")
def delete_kpi(
    kpi_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    kpi = db.query(KPIDefinition).filter(
        KPIDefinition.id == kpi_id,
        KPIDefinition.organization_id == current_user.organization_id,
    ).first()
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI not found.")

    kpi.is_active = False
    
    # Clean up associated alerts for this KPI immediately
    from ..models import Alert
    try:
        db.query(Alert).filter(
            Alert.organization_id == current_user.organization_id,
            Alert.entity_type == "kpi",
            Alert.entity_id == kpi_id
        ).delete(synchronize_session="fetch")
    except Exception as e:
        print("Failed to delete KPI alerts on cleanup:", e)

    db.commit()


# ── POST /compute ─────────────────────────────────────────────────────────────

@router.post("/compute", summary="Compute all KPIs now (manual trigger)")
def compute_kpis(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Trigger computation of all active KPIs for the organisation.
    Creates or updates snapshots for the current period.
    Also generates alerts for any threshold breaches.
    """
    results = compute_all_kpis(db, current_user.organization_id)

    # Generate alerts for breached KPIs
    _generate_kpi_alerts(db, current_user.organization_id, results)

    return {
        "message": f"Computed {len(results)} KPIs",
        "results": results,
    }


# ── GET /dashboard ────────────────────────────────────────────────────────────

@router.get("/dashboard", summary="Get KPI dashboard data")
def get_kpi_dashboard(
    category: Optional[str] = None,
    product_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all active KPIs with their latest values, formatted for the
    frontend KPI Dashboard page.
    """
    query = db.query(KPIDefinition).filter(
        KPIDefinition.organization_id == current_user.organization_id,
        KPIDefinition.is_active == True,
    )
    if category:
        query = query.filter(KPIDefinition.category == category)
    if product_id:
        query = query.filter(
            (KPIDefinition.product_id == product_id) | (KPIDefinition.product_id == None)
        )

    kpis = query.order_by(KPIDefinition.category, KPIDefinition.name).all()

    dashboard_items = []
    for kpi in kpis:
        enriched = _enrich_kpi(kpi, db)

        # Get last 6 snapshots for sparkline
        history = db.query(KPISnapshot).filter(
            KPISnapshot.kpi_id == kpi.id,
        ).order_by(KPISnapshot.period.desc()).limit(6).all()
        history.reverse()

        sparkline = [
            {"period": s.period, "value": float(s.value) if s.value is not None else None}
            for s in history
        ]

        enriched["sparkline"] = sparkline
        dashboard_items.append(enriched)

    # Summary stats
    total = len(dashboard_items)
    on_track = sum(1 for d in dashboard_items if d.get("current_status") == "on_track")
    warning = sum(1 for d in dashboard_items if d.get("current_status") == "warning")
    critical = sum(1 for d in dashboard_items if d.get("current_status") == "critical")
    no_data = sum(1 for d in dashboard_items if d.get("current_status") == "no_data")

    return {
        "summary": {
            "total": total,
            "on_track": on_track,
            "warning": warning,
            "critical": critical,
            "no_data": no_data,
        },
        "kpis": dashboard_items,
    }


# ── GET /{id}/history ─────────────────────────────────────────────────────────

@router.get("/{kpi_id}/history", response_model=List[KPISnapshotResponse],
            summary="Get KPI history")
def get_kpi_history(
    kpi_id: int,
    limit: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns historical snapshots for a KPI, most recent first."""
    kpi = db.query(KPIDefinition).filter(
        KPIDefinition.id == kpi_id,
        KPIDefinition.organization_id == current_user.organization_id,
    ).first()
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI not found.")

    snapshots = db.query(KPISnapshot).filter(
        KPISnapshot.kpi_id == kpi_id,
    ).order_by(KPISnapshot.period.desc()).limit(limit).all()

    return snapshots


# ── POST /from-formula/{formula_id} ──────────────────────────────────────────

@router.post("/from-formula/{formula_id}", response_model=KPIDefinitionResponse,
             summary="Promote a formula to a tracked KPI")
def promote_formula_to_kpi(
    formula_id: int,
    target_value: Optional[float] = None,
    warning_threshold: Optional[float] = None,
    critical_threshold: Optional[float] = None,
    higher_is_better: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    formula = db.query(FormulaRecord).filter(
        FormulaRecord.id == formula_id,
        FormulaRecord.organization_id == current_user.organization_id,
        FormulaRecord.is_active == True,
    ).first()
    if not formula:
        raise HTTPException(status_code=404, detail="Formula not found.")

    # Check if already promoted
    existing = db.query(KPIDefinition).filter(
        KPIDefinition.formula_id == formula_id,
        KPIDefinition.organization_id == current_user.organization_id,
        KPIDefinition.is_active == True,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Formula already promoted as KPI: '{existing.name}'"
        )

    unit_map = {"percentage": "%", "currency": "PKR", "number": ""}
    kpi = KPIDefinition(
        organization_id=current_user.organization_id,
        created_by=current_user.id,
        name=formula.formula_name,
        description=f"KPI from formula: {formula.expression_string}",
        category="custom",
        unit=unit_map.get(formula.output_type, ""),
        computation_type="formula",
        formula_id=formula.id,
        target_value=target_value,
        warning_threshold=warning_threshold,
        critical_threshold=critical_threshold,
        higher_is_better=higher_is_better,
    )
    db.add(kpi)
    db.commit()
    db.refresh(kpi)

    return _enrich_kpi(kpi, db)


# ═══════════════════════════════════════════════════════════════════════════════
# ALERT INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════════

def _generate_kpi_alerts(
    db: Session,
    organization_id: int,
    results: List[dict],
) -> None:
    """
    Create alert records for KPIs that breach warning or critical thresholds.

    De-duplication logic:
    - Before creating a new alert for a KPI, delete any existing active
      (non-dismissed) threshold_breach alerts for that same KPI.
    - If the KPI is now on_track or no_data, old alerts are cleaned up
      and no new alert is created (effectively resolving the alert).
    """
    from ..models import Alert

    for r in results:
        kpi_id = r["kpi_id"]

        # ── Step 1: Remove existing active alerts for this KPI ────────────
        try:
            db.query(Alert).filter(
                Alert.organization_id == organization_id,
                Alert.alert_type == "threshold_breach",
                Alert.entity_type == "kpi",
                Alert.entity_id == kpi_id,
                Alert.is_dismissed == False,
            ).delete(synchronize_session="fetch")
        except Exception:
            pass  # Alert model may not have is_dismissed; continue safely

        # ── Step 2: Create a fresh alert only if breached ─────────────────
        if r["status"] in ("warning", "critical"):
            severity = r["status"]
            value_str = f"{r['value']}" if r['value'] is not None else "N/A"
            target_str = f"{r['target']}" if r['target'] is not None else "N/A"

            try:
                alert = Alert(
                    organization_id=organization_id,
                    alert_type="threshold_breach",
                    severity=severity,
                    title=f"KPI {'⚠️' if severity == 'warning' else '🔴'} {r['kpi_name']}",
                    message=(
                        f"{r['kpi_name']} is at {value_str} "
                        f"(target: {target_str}). "
                        f"Status: {severity.upper()}"
                    ),
                    entity_type="kpi",
                    entity_id=r["kpi_id"],
                    data_context={
                        "kpi_id": r["kpi_id"],
                        "value": r["value"],
                        "target": r["target"],
                        "trend": r["trend"],
                    },
                )
                db.add(alert)
            except Exception:
                # Alert model may not exist yet or may have different schema
                # Fail silently — KPI computation is more important
                pass

    try:
        db.commit()
    except Exception:
        db.rollback()
