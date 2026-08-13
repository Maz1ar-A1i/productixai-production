# app/router/formulas.py
"""
Formula Builder CRUD Router.
All endpoints restricted to org_admin role only, except GET /api/formulas
(which is readable by any authenticated user for dashboard display).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import FormulaRecord, ProductDataRecord, Product, User
from ..deps import get_current_user
from ..schemas import (
    FormulaCreate, FormulaUpdate, FormulaResponse,
    FormulaEvaluateRequest, FormulaEvaluateResult,
    ColumnsResponse, ColumnMeta,
)
from ..engines.formula_engine import (
    ALL_COLUMNS, UNIT_EXPENSES_COLUMNS, UNIT_REVENUE_COLUMNS,
    FORMULA_TEMPLATES, build_expression, validate_columns,
    validate_expression, evaluate_formula_on_dataset,
)

router = APIRouter(prefix="/formulas", tags=["Formula Builder"])


def _require_admin(current_user: User):
    """Raise 403 if user is not org_admin or system_admin."""
    if current_user.role.value not in ("org_admin", "system_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Formula Builder is restricted to admin accounts."
        )


# ── GET /columns  ─────────────────────────────────────────────────────────────

@router.get("/columns", response_model=ColumnsResponse, summary="Get fixed column list")
def get_columns(current_user: User = Depends(get_current_user)):
    """
    Returns the locked fixed column list for Tower Expenses and Tower Revenue.
    Text/date columns are marked as ineligible.
    """
    te_cols = [
        ColumnMeta(name=k, type=v["type"], eligible=v["eligible"], table=v["table"])
        for k, v in UNIT_EXPENSES_COLUMNS.items()
    ]
    tr_cols = [
        ColumnMeta(name=k, type=v["type"], eligible=v["eligible"], table=v["table"])
        for k, v in UNIT_REVENUE_COLUMNS.items()
    ]
    return ColumnsResponse(unit_expenses=te_cols, unit_revenue=tr_cols)


# ── GET /templates  ───────────────────────────────────────────────────────────

@router.get("/templates", summary="Get available formula templates")
def get_templates(current_user: User = Depends(get_current_user)):
    """Returns all stored formula templates with their operator patterns."""
    return [
        {
            "id": key,
            "label": val["label"],
            "pattern": val["pattern"],
            "min_cols": val["min_cols"],
            "output_type": val["output_type"],
        }
        for key, val in FORMULA_TEMPLATES.items()
    ]


# ── POST /preview  ────────────────────────────────────────────────────────────

@router.post("/preview", summary="Preview expression for selected columns + template")
def preview_formula(
    template: str,
    columns: List[str],
    current_user: User = Depends(get_current_user),
):
    """
    Generate and validate expression string without saving.
    Used by the live preview panel in the Formula Builder UI.
    """
    _require_admin(current_user)

    valid, err = validate_columns(columns)
    if not valid:
        raise HTTPException(status_code=422, detail=err)

    if template not in FORMULA_TEMPLATES:
        raise HTTPException(status_code=422, detail=f"Unknown template: {template}")

    expr = build_expression(template, columns)
    tmpl = FORMULA_TEMPLATES[template]

    # Sample evaluation using hardcoded demo row (TWR-001, April 2026)
    SAMPLE_ROW = {
        "Date": "2026-04-01",
        "Tower ID": "TWR-001",
        "Tower Name": "Lahore-Tower-1",
        "City": "Lahore",
        "Fuel Cost": 50000,
        "WAPDA Cost": 30000,
        "HR Cost": 20000,
        "Rent": 40000,
        "Other Costs": 10000,
        "Total Capacity (KW)": 100,
        "KW Produced": 80,
        "KW Sold": 60,
        "Attached Tenants": 3,
        "Max Tenants": 5,
        "Total OPEX": 150000,
        "Daily Cost": 5000,
        "Monthly OPEX": 150000,
        "Capacity Utilization": 60,
        "Idle Capacity (KW)": 40,
        "Cost per KW": 2500,
        "Tenant Utilization": 60,
        "Total Revenue": 300000,
        "Profit": 150000,
        "Idle Capacity Value": 20000,
        "KW Sold": 20,           # revenue table
        "Price per KW": 500,
        "Daily Revenue": 10000,
        "Monthly Revenue": 300000,
    }

    from ..engines.formula_engine import evaluate_expression
    sample_result = evaluate_expression(expr, SAMPLE_ROW)

    out_type = tmpl["output_type"]
    if sample_result is not None:
        if out_type == "percentage":
            sample_formatted = f"{sample_result:.1f}%"
        elif out_type == "currency":
            sample_formatted = f"PKR {sample_result:,.0f}"
        else:
            sample_formatted = f"{sample_result:,.2f}"
    else:
        sample_formatted = "N/A"

    return {
        "expression_string": expr,
        "output_type": out_type,
        "template_label": tmpl["label"],
        "pattern": tmpl["pattern"],
        "sample_result": sample_result,
        "sample_formatted": sample_formatted,
    }


# ── POST /  ───────────────────────────────────────────────────────────────────

@router.post("/", response_model=FormulaResponse, status_code=status.HTTP_201_CREATED,
             summary="Create a new formula")
def create_formula(
    payload: FormulaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    # Validate columns
    valid, err = validate_columns(payload.selected_columns)
    if not valid:
        raise HTTPException(status_code=422, detail=err)

    # Validate expression
    valid, err = validate_expression(payload.expression_string, payload.selected_columns)
    if not valid:
        raise HTTPException(status_code=422, detail=err)

    # Determine source_table from columns
    te_names = {k.lower() for k in UNIT_EXPENSES_COLUMNS}
    tr_names = {k.lower() for k in UNIT_REVENUE_COLUMNS}
    col_lower = {c.lower() for c in payload.selected_columns}
    has_te = bool(col_lower & te_names)
    has_tr = bool(col_lower & tr_names)
    if has_te and has_tr:
        source_table = "both"
    elif has_tr:
        source_table = "unit_revenue"
    else:
        source_table = "unit_expenses"

    # Check if a formula is already applied to this target_column in the organization and product
    if payload.target_column:
        query_target = db.query(FormulaRecord).filter(
            FormulaRecord.organization_id == current_user.organization_id,
            FormulaRecord.target_column == payload.target_column,
            FormulaRecord.is_active == True,
        )
        if payload.product_id:
            query_target = query_target.filter(FormulaRecord.product_id == payload.product_id)
        else:
            query_target = query_target.filter(FormulaRecord.product_id.is_(None))
        existing_by_target = query_target.first()

        if existing_by_target:
            # Overwrite/update the existing formula targeting the same column
            existing_by_target.formula_name = payload.formula_name
            existing_by_target.formula_template = payload.formula_template
            existing_by_target.selected_columns = payload.selected_columns
            existing_by_target.source_table = source_table
            existing_by_target.expression_string = payload.expression_string
            existing_by_target.output_type = payload.output_type
            existing_by_target.product_id = payload.product_id
            db.commit()
            db.refresh(existing_by_target)
            return existing_by_target

    formula = FormulaRecord(
        organization_id=current_user.organization_id,
        created_by=current_user.id,
        formula_name=payload.formula_name,
        formula_template=payload.formula_template,
        selected_columns=payload.selected_columns,
        source_table=source_table,
        expression_string=payload.expression_string,
        output_type=payload.output_type,
        target_column=payload.target_column,
        product_id=payload.product_id,
    )
    db.add(formula)
    db.commit()
    db.refresh(formula)
    return formula


# ── GET /  ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[FormulaResponse], summary="List active formulas")
def list_formulas(
    product_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns active formulas for the current user's organisation.
    Optionally filters by product_id.
    """
    query = db.query(FormulaRecord).filter(
        FormulaRecord.organization_id == current_user.organization_id,
        FormulaRecord.is_active == True,
    )
    if product_id is not None:
        query = query.filter(
            (FormulaRecord.product_id == product_id) | (FormulaRecord.product_id.is_(None))
        )

    formulas = query.order_by(FormulaRecord.created_at.desc()).all()
    return formulas


# ── GET /{formula_id}  ────────────────────────────────────────────────────────

@router.get("/{formula_id}", response_model=FormulaResponse, summary="Get a single formula")
def get_formula(
    formula_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    formula = db.query(FormulaRecord).filter(
        FormulaRecord.id == formula_id,
        FormulaRecord.organization_id == current_user.organization_id,
    ).first()
    if not formula:
        raise HTTPException(status_code=404, detail="Formula not found.")
    return formula


# ── PUT /{formula_id}  ────────────────────────────────────────────────────────

@router.put("/{formula_id}", response_model=FormulaResponse, summary="Update a formula")
def update_formula(
    formula_id: int,
    payload: FormulaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    formula = db.query(FormulaRecord).filter(
        FormulaRecord.id == formula_id,
        FormulaRecord.organization_id == current_user.organization_id,
    ).first()
    if not formula:
        raise HTTPException(status_code=404, detail="Formula not found.")

    # Apply updates
    if payload.formula_name is not None:
        formula.formula_name = payload.formula_name

    if payload.formula_template is not None:
        formula.formula_template = payload.formula_template
    if payload.selected_columns is not None:
        valid, err = validate_columns(payload.selected_columns)
        if not valid:
            raise HTTPException(status_code=422, detail=err)
        formula.selected_columns = payload.selected_columns
    if payload.expression_string is not None:
        cols = payload.selected_columns or formula.selected_columns
        valid, err = validate_expression(payload.expression_string, cols)
        if not valid:
            raise HTTPException(status_code=422, detail=err)
        formula.expression_string = payload.expression_string
    if payload.source_table is not None:
        formula.source_table = payload.source_table
    if payload.output_type is not None:
        formula.output_type = payload.output_type
    if payload.target_column is not None:
        if payload.target_column:
            other = db.query(FormulaRecord).filter(
                FormulaRecord.organization_id == current_user.organization_id,
                FormulaRecord.target_column == payload.target_column,
                FormulaRecord.is_active == True,
                FormulaRecord.id != formula_id,
            ).first()
            if other:
                other.is_active = False
        formula.target_column = payload.target_column

    db.commit()
    db.refresh(formula)
    return formula


# ── DELETE /{formula_id}  ─────────────────────────────────────────────────────

@router.delete("/{formula_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Soft-delete a formula")
def delete_formula(
    formula_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    formula = db.query(FormulaRecord).filter(
        FormulaRecord.id == formula_id,
        FormulaRecord.organization_id == current_user.organization_id,
    ).first()
    if not formula:
        raise HTTPException(status_code=404, detail="Formula not found.")

    formula.is_active = False
    db.commit()


# ── POST /duplicate/{formula_id}  ─────────────────────────────────────────────

@router.post("/duplicate/{formula_id}", response_model=FormulaResponse,
             summary="Duplicate a formula")
def duplicate_formula(
    formula_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    original = db.query(FormulaRecord).filter(
        FormulaRecord.id == formula_id,
        FormulaRecord.organization_id == current_user.organization_id,
    ).first()
    if not original:
        raise HTTPException(status_code=404, detail="Formula not found.")

    # Generate unique copy name
    base_name = f"{original.formula_name} — Copy"
    copy_name = base_name
    counter = 1
    while db.query(FormulaRecord).filter(
        FormulaRecord.organization_id == current_user.organization_id,
        FormulaRecord.formula_name == copy_name,
        FormulaRecord.is_active == True,
    ).first():
        counter += 1
        copy_name = f"{base_name} {counter}"

    copy = FormulaRecord(
        organization_id=original.organization_id,
        created_by=current_user.id,
        formula_name=copy_name,
        formula_template=original.formula_template,
        selected_columns=list(original.selected_columns),
        source_table=original.source_table,
        expression_string=original.expression_string,
        output_type=original.output_type,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return copy


# ── POST /evaluate  ───────────────────────────────────────────────────────────

@router.post("/evaluate", response_model=FormulaEvaluateResult,
             summary="Evaluate a formula against real data")
def evaluate_formula(
    payload: FormulaEvaluateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Evaluates a saved formula against ProductDataRecord rows for the org.
    Accepts optional filter params: tower_id, city, start_date, end_date.
    """
    formula = db.query(FormulaRecord).filter(
        FormulaRecord.id == payload.formula_id,
        FormulaRecord.organization_id == current_user.organization_id,
        FormulaRecord.is_active == True,
    ).first()
    if not formula:
        raise HTTPException(status_code=404, detail="Formula not found.")

    # Fetch data records
    query = db.query(ProductDataRecord).filter(
        ProductDataRecord.organization_id == current_user.organization_id
    )
    if current_user.role.value == "org_user":
        from ..models import UserProductAssignment
        assigned_ids = [a.product_id for a in db.query(UserProductAssignment).filter(
            UserProductAssignment.user_id == current_user.id
        ).all()]
        
        if payload.tower_id:
            try:
                tid = int(payload.tower_id)
                if tid not in assigned_ids:
                    raise HTTPException(status_code=403, detail="You do not have access to this unit.")
            except ValueError:
                product = db.query(Product).filter(
                    Product.organization_id == current_user.organization_id,
                    Product.name == payload.tower_id
                ).first()
                if not product or product.id not in assigned_ids:
                    raise HTTPException(status_code=403, detail="You do not have access to this unit.")
        
        query = query.filter(ProductDataRecord.product_id.in_(assigned_ids))

    records = query.all()

    # Flatten each record's data dict into rows for evaluation
    from ..engines.kpi_engine import _flatten_record_data
    data_rows = []
    for rec in records:
        row = _flatten_record_data(rec.data or {})
        # Ensure parameters are available at the top-level of the row for filtering
        if rec.data and "parameters" in rec.data:
            params = rec.data["parameters"]
            row["Date"] = params.get("date", rec.month)
            row["City"] = params.get("city", "")
            row["Tower Name"] = params.get("towerName", "")
        else:
            row["Date"] = rec.month
            if rec.product:
                row["Tower Name"] = rec.product.name
                row["City"] = rec.product.description
        row["Tower ID"] = str(rec.product_id)

        # Apply filters
        if payload.tower_id and row.get("Tower ID") != payload.tower_id:
            continue
        if payload.city and row.get("City") != payload.city:
            continue
        # Date filtering (month string is stored, try to match)
        if payload.start_date or payload.end_date:
            row_date = row.get("Date") or rec.month
            # Simple string comparison — works for YYYY-MM-DD
            if payload.start_date and str(row_date) < payload.start_date:
                continue
            if payload.end_date and str(row_date) > payload.end_date:
                continue
        data_rows.append(row)

    stats = evaluate_formula_on_dataset(
        formula.expression_string,
        data_rows,
        formula.output_type,
    )

    return FormulaEvaluateResult(
        formula_id=formula.id,
        formula_name=formula.formula_name,
        expression_string=formula.expression_string,
        output_type=formula.output_type,
        result=stats["result"],
        formatted=stats["formatted"],
        row_count=stats["row_count"],
        valid_count=stats["valid_count"],
        avg=stats["avg"],
        min=stats["min"],
        max=stats["max"],
        latest=stats.get("latest"),
    )


# ── POST /evaluate-all  ───────────────────────────────────────────────────────

@router.post("/evaluate-all", summary="Evaluate all active formulas (dashboard widget)")
def evaluate_all_formulas(
    tower_id: Optional[str] = None,
    city: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Convenience endpoint: evaluates all active formulas for the org at once.
    Used by the Dashboard Custom Metrics widget.
    """
    formulas = db.query(FormulaRecord).filter(
        FormulaRecord.organization_id == current_user.organization_id,
        FormulaRecord.is_active == True,
    ).all()

    # Fetch all records once
    query = db.query(ProductDataRecord).filter(
        ProductDataRecord.organization_id == current_user.organization_id
    )
    if current_user.role.value == "org_user":
        from ..models import UserProductAssignment
        assigned_ids = [a.product_id for a in db.query(UserProductAssignment).filter(
            UserProductAssignment.user_id == current_user.id
        ).all()]
        
        if tower_id:
            try:
                tid = int(tower_id)
                if tid not in assigned_ids:
                    raise HTTPException(status_code=403, detail="You do not have access to this unit.")
            except ValueError:
                product = db.query(Product).filter(
                    Product.organization_id == current_user.organization_id,
                    Product.name == tower_id
                ).first()
                if not product or product.id not in assigned_ids:
                    raise HTTPException(status_code=403, detail="You do not have access to this unit.")
        
        query = query.filter(ProductDataRecord.product_id.in_(assigned_ids))

    records = query.all()

    from ..engines.kpi_engine import _flatten_record_data
    data_rows = []
    for rec in records:
        row = _flatten_record_data(rec.data or {})
        # Ensure parameters are available at the top-level of the row for filtering
        if rec.data and "parameters" in rec.data:
            params = rec.data["parameters"]
            row["Date"] = params.get("date", rec.month)
            row["City"] = params.get("city", "")
            row["Tower Name"] = params.get("towerName", "")
        else:
            row["Date"] = rec.month
            if rec.product:
                row["Tower Name"] = rec.product.name
                row["City"] = rec.product.description
        row["Tower ID"] = str(rec.product_id)

        if tower_id and row.get("Tower ID") != tower_id:
            continue
        if city and row.get("City") != city:
            continue
        data_rows.append(row)

    results = []
    for f in formulas:
        stats = evaluate_formula_on_dataset(f.expression_string, data_rows, f.output_type)
        results.append({
            "formula_id": f.id,
            "formula_name": f.formula_name,
            "expression_string": f.expression_string,
            "output_type": f.output_type,
            "template": f.formula_template,
            **stats,
        })

    return results
