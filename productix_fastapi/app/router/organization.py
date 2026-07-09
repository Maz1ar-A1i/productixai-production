from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas, deps
from ..database import get_db

router = APIRouter(prefix="/organizations", tags=["Organizations"])

# ------------------------------------------------
# Get my organization details
# ------------------------------------------------
@router.get("/me", response_model=schemas.OrganizationResponse)
def get_my_org(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    org = db.query(models.Organization).filter(models.Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


# ------------------------------------------------
# Update my organization (org_admin only)
# ------------------------------------------------
@router.put("/me", response_model=schemas.OrganizationResponse)
def update_my_org(
    org_in: schemas.OrganizationBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    org = db.query(models.Organization).filter(models.Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.name = org_in.name
    if org_in.subscription_plan:
        org.subscription_plan = org_in.subscription_plan
    if org_in.column_mappings is not None:
        org.column_mappings = org_in.column_mappings

    db.commit()
    db.refresh(org)
    return org


# ------------------------------------------------
# Rename variable (column) organization-wide (org_admin only)
# ------------------------------------------------
@router.put("/me/rename-column", response_model=schemas.OrganizationResponse)
def rename_column(
    payload: schemas.ColumnRenameRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    org = db.query(models.Organization).filter(models.Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Get current mappings
    mappings = dict(org.column_mappings or {})
    canonical_name = payload.canonical_name
    new_display_name = payload.new_display_name.strip()

    old_display_name = mappings.get(canonical_name, canonical_name)

    if new_display_name == "" or new_display_name == canonical_name:
        if canonical_name in mappings:
            del mappings[canonical_name]
    else:
        mappings[canonical_name] = new_display_name

    org.column_mappings = mappings
    db.flush()

    # If the display name changed, propagate the change to Data Records and Formulas
    if old_display_name != new_display_name:
        # 1. Update ProductDataRecord data keys
        records = db.query(models.ProductDataRecord).filter(
            models.ProductDataRecord.organization_id == org.id
        ).all()

        for rec in records:
            if not rec.data:
                continue
            
            # Use deepcopy or dict copy to mutate JSON
            data = dict(rec.data)
            modified = False

            # Update unit_data keys
            if "unit_data" in data and isinstance(data["unit_data"], dict):
                unit_data = dict(data["unit_data"])
                if old_display_name in unit_data:
                    val = unit_data.pop(old_display_name)
                    unit_data[new_display_name] = val
                    data["unit_data"] = unit_data
                    modified = True

            # Update customer_data keys
            if "customer_data" in data and isinstance(data["customer_data"], list):
                customer_data = []
                for cust in data["customer_data"]:
                    cust_copy = dict(cust)
                    if old_display_name in cust_copy:
                        val = cust_copy.pop(old_display_name)
                        cust_copy[new_display_name] = val
                        modified = True
                    customer_data.append(cust_copy)
                data["customer_data"] = customer_data

            # Update computed keys
            if "computed" in data and isinstance(data["computed"], dict):
                computed = dict(data["computed"])
                if old_display_name in computed:
                    val = computed.pop(old_display_name)
                    computed[new_display_name] = val
                    data["computed"] = computed
                    modified = True

            if modified:
                rec.data = data
                # Force SQLAlchemy to detect JSON mutation
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(rec, "data")

        # 2. Update FormulaRecord references
        formulas = db.query(models.FormulaRecord).filter(
            models.FormulaRecord.organization_id == org.id,
            models.FormulaRecord.is_active == True
        ).all()

        for formula in formulas:
            # Update target column name if it matches
            if formula.target_column == old_display_name:
                formula.target_column = new_display_name

            # Update selected_columns list
            if formula.selected_columns and isinstance(formula.selected_columns, list):
                cols = list(formula.selected_columns)
                if old_display_name in cols:
                    cols = [new_display_name if c == old_display_name else c for c in cols]
                    formula.selected_columns = cols
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(formula, "selected_columns")

            # Update expression_string
            if formula.expression_string:
                # Replace token e.g., [old_display_name] with [new_display_name]
                old_token = f"[{old_display_name}]"
                new_token = f"[{new_display_name}]"
                if old_token in formula.expression_string:
                    formula.expression_string = formula.expression_string.replace(old_token, new_token)

        # 3. Update KPIDefinition references
        kpis = db.query(models.KPIDefinition).filter(
            models.KPIDefinition.organization_id == org.id,
            models.KPIDefinition.is_active == True
        ).all()

        for kpi in kpis:
            # Update KPI name if it matches the old column name
            if kpi.name == old_display_name:
                kpi.name = new_display_name

            # Update old display name in description if it exists
            if kpi.description:
                if old_display_name in kpi.description:
                    kpi.description = kpi.description.replace(old_display_name, new_display_name)
                # Also handle token format like [old_display_name]
                old_token = f"[{old_display_name}]"
                new_token = f"[{new_display_name}]"
                if old_token in kpi.description:
                    kpi.description = kpi.description.replace(old_token, new_token)

    db.commit()
    db.refresh(org)
    return org


# ------------------------------------------------
# List all organizations (superadmin only)
# ------------------------------------------------
@router.get("/", response_model=List[schemas.OrganizationResponse])
def list_orgs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("superadmin"))
):
    return db.query(models.Organization).all()


# ------------------------------------------------
# Get specific org (superadmin only)
# ------------------------------------------------
@router.get("/{org_id}", response_model=schemas.OrganizationResponse)
def get_org(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("superadmin"))
):
    org = db.query(models.Organization).filter(models.Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


# ------------------------------------------------
# Delete organization (superadmin only)
# ------------------------------------------------
@router.delete("/{org_id}")
def delete_org(
    org_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("superadmin"))
):
    org = db.query(models.Organization).filter(models.Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    db.delete(org)
    db.commit()
    return {"detail": "Organization deleted"}


# ================================================
# CHATBOT SETTINGS (Task 8)
# ================================================

from pydantic import BaseModel
from typing import Optional, List

class ChatbotSettingsPayload(BaseModel):
    chatbot_name: Optional[str] = None
    chatbot_persona: Optional[str] = None


@router.get("/me/chatbot-settings")
def get_chatbot_settings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """Get organization's chatbot name and persona (all authenticated users)."""
    org = db.query(models.Organization).filter(models.Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {
        "chatbot_name": org.chatbot_name or "Productix AI",
        "chatbot_persona": org.chatbot_persona or "a helpful AI assistant specialized in operational productivity analysis"
    }


@router.post("/me/chatbot-settings")
def update_chatbot_settings(
    payload: ChatbotSettingsPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    """Update chatbot name and persona (org_admin only)."""
    org = db.query(models.Organization).filter(models.Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if payload.chatbot_name is not None:
        name = payload.chatbot_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Chatbot name cannot be empty")
        org.chatbot_name = name
    if payload.chatbot_persona is not None:
        org.chatbot_persona = payload.chatbot_persona.strip() or "a helpful AI assistant"
    db.commit()
    db.refresh(org)
    return {
        "chatbot_name": org.chatbot_name,
        "chatbot_persona": org.chatbot_persona
    }


# ================================================
# ANALYSIS GOALS (Task 7)
# ================================================

class AnalysisGoalsPayload(BaseModel):
    goals: List[str]


@router.get("/me/analysis-goals")
def get_analysis_goals(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """Get admin-defined analysis goals for this organization."""
    org = db.query(models.Organization).filter(models.Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    goals = org.analysis_goals
    # Handle JSON-stored-as-string (SQLite may return string)
    if isinstance(goals, str):
        import json
        try:
            goals = json.loads(goals)
        except Exception:
            goals = []
    return {"goals": goals or []}


@router.post("/me/analysis-goals")
def update_analysis_goals(
    payload: AnalysisGoalsPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.require_role("org_admin"))
):
    """Update admin-defined analysis goals (org_admin only). Max 8 goals."""
    goals = [g.strip() for g in payload.goals if g.strip()]
    if len(goals) > 8:
        raise HTTPException(status_code=400, detail="Maximum 8 goals allowed")
    org = db.query(models.Organization).filter(models.Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    import json
    org.analysis_goals = json.dumps(goals)
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(org, "analysis_goals")
    db.commit()
    return {"goals": goals}

