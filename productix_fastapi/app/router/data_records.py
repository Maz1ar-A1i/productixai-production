from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import pandas as pd
import json
import os

from .. import models, schemas, deps
from ..database import get_db
from ..validation_service import ValidationService

router = APIRouter(prefix="/data-records", tags=["Data Records"])


def _require_not_org_admin(current_user: models.User):
    if current_user.role.value == "org_admin":
        raise HTTPException(
            status_code=403,
            detail="Organization admins have read-only monitoring access and cannot modify data records."
        )


# ------------------------------------------------
# List records for a product (or all for org)
# ------------------------------------------------
@router.get("/", response_model=List[schemas.ProductDataRecordResponse])
def list_records(
    product_id: Optional[int] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    region: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    eff_start = date_start or start_date
    eff_end = date_end or end_date

    query = db.query(models.ProductDataRecord).filter(
        models.ProductDataRecord.organization_id == current_user.organization_id
    )
    if product_id is not None:
        query = query.filter(models.ProductDataRecord.product_id == product_id)

    if current_user.role.value == "org_user":
        assigned_ids = [a.product_id for a in db.query(models.UserProductAssignment).filter(
            models.UserProductAssignment.user_id == current_user.id
        ).all()]
        if product_id is not None:
            if product_id not in assigned_ids:
                raise HTTPException(status_code=403, detail="You do not have access to this unit.")
        else:
            query = query.filter(models.ProductDataRecord.product_id.in_(assigned_ids))

    records = query.order_by(models.ProductDataRecord.month.desc()).all()

    # Use apply_filters to filter on dates and regions
    from ..data_pipeline import apply_filters
    filters = {
        "tower_id": product_id,
        "date_start": eff_start,
        "date_end": eff_end,
        "region": region
    }
    return apply_filters(records, filters)


@router.post("/bulk")
def save_bulk_records(
    payload: schemas.BulkDataRecordCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    _require_not_org_admin(current_user)
    product = None
    try:
        product_id = int(payload.tower_id)
        product = db.query(models.Product).filter(
            models.Product.id == product_id,
            models.Product.organization_id == current_user.organization_id
        ).first()
    except (ValueError, TypeError):
        pass

    if not product:
        # Fallback to name search
        product = db.query(models.Product).filter(
            models.Product.name == payload.tower_name,
            models.Product.organization_id == current_user.organization_id
        ).first()

    if not product:
        # Create product if it doesn't exist
        product = models.Product(
            name=payload.tower_name,
            organization_id=current_user.organization_id,
            description=payload.city or "",
            region=payload.region or payload.city or "",
            sector="Telecom",
            input_fields=[],
            output_fields=[]
        )
        db.add(product)
        db.flush()

    if current_user.role.value == "org_user":
        assignment = db.query(models.UserProductAssignment).filter(
            models.UserProductAssignment.user_id == current_user.id,
            models.UserProductAssignment.product_id == product.id
        ).first()
        if not assignment:
            raise HTTPException(status_code=403, detail="You do not have access to assign data for this unit.")

    from ..data_pipeline import normalize_from_manual_entry

    # normalize unit_rows and customer_rows
    normalized_records = normalize_from_manual_entry(
        unit_rows=payload.unit_rows,
        customer_rows=payload.customer_rows,
        tower_name=payload.tower_name,
        city=payload.city,
        region=payload.region or product.region or payload.city or "",
        col_map=payload.col_map
    )

    # Save to database
    dirty = False
    if payload.city and product.description != payload.city:
        product.description = payload.city
        dirty = True
    if payload.region and product.region != payload.region:
        product.region = payload.region
        dirty = True
    if dirty:
        db.flush()

    records_created = 0
    records_updated = 0

    for rec_data in normalized_records:
        date_val = str(rec_data["parameters"]["date"]).split("T")[0].strip()
        
        # Check if record exists for this Product and Date
        existing_record = db.query(models.ProductDataRecord).filter(
            models.ProductDataRecord.product_id == product.id,
            models.ProductDataRecord.month == date_val,
            models.ProductDataRecord.organization_id == current_user.organization_id
        ).first()

        if existing_record:
            existing_record.data = rec_data
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(existing_record, 'data')
            records_updated += 1
        else:
            record = models.ProductDataRecord(
                organization_id=current_user.organization_id,
                product_id=product.id,
                month=date_val,
                data=rec_data
            )
            db.add(record)
            records_created += 1

    db.commit()
    return {
        "success": True,
        "message": f"Successfully saved manual data: {records_created} created, {records_updated} updated.",
        "records_created": records_created,
        "records_updated": records_updated,
        "product_id": product.id
    }


# ------------------------------------------------
# Create a record
# ------------------------------------------------
@router.post("/", response_model=schemas.ProductDataRecordResponse)
def create_record(
    record_in: schemas.ProductDataRecordCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    _require_not_org_admin(current_user)
    # Verify product belongs to org
    product = db.query(models.Product).filter(
        models.Product.id == record_in.product_id,
        models.Product.organization_id == current_user.organization_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if current_user.role.value == "org_user":
        assignment = db.query(models.UserProductAssignment).filter(
            models.UserProductAssignment.user_id == current_user.id,
            models.UserProductAssignment.product_id == record_in.product_id
        ).first()
        if not assignment:
            raise HTTPException(status_code=403, detail="You do not have access to this unit.")

    # Validate the record data
    product_fields = {
        "input_fields": product.input_fields or [],
        "output_fields": product.output_fields or []
    }
    validation_result = ValidationService.validate_data_record(record_in.dict(), product_fields)
    
    # Create alerts for any validation issues
    for alert_data in validation_result.alerts:
        alert_data.user_id = current_user.id
        db_alert = models.Alert(
            organization_id=current_user.organization_id,
            **alert_data.dict()
        )
        db.add(db_alert)

    record = models.ProductDataRecord(
        organization_id=current_user.organization_id,
        product_id=record_in.product_id,
        month=record_in.month,
        data=record_in.data
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


# ------------------------------------------------
# Update a record
# ------------------------------------------------
@router.put("/{record_id}", response_model=schemas.ProductDataRecordResponse)
def update_record(
    record_id: int,
    record_in: schemas.ProductDataRecordCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    _require_not_org_admin(current_user)
    record = db.query(models.ProductDataRecord).filter(
        models.ProductDataRecord.id == record_id,
        models.ProductDataRecord.organization_id == current_user.organization_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    if current_user.role.value == "org_user":
        assignment = db.query(models.UserProductAssignment).filter(
            models.UserProductAssignment.user_id == current_user.id,
            models.UserProductAssignment.product_id == record.product_id
        ).first()
        if not assignment:
            raise HTTPException(status_code=403, detail="You do not have access to this unit.")

    # Validate the updated record data
    product = db.query(models.Product).filter(
        models.Product.id == record.product_id,
        models.Product.organization_id == current_user.organization_id
    ).first()
    
    if product:
        product_fields = {
            "input_fields": product.input_fields or [],
            "output_fields": product.output_fields or []
        }
        validation_result = ValidationService.validate_data_record(record_in.dict(), product_fields)
        
        # Create alerts for any validation issues
        for alert_data in validation_result.alerts:
            alert_data.user_id = current_user.id
            alert_data.entity_id = record_id
            db_alert = models.Alert(
                organization_id=current_user.organization_id,
                **alert_data.dict()
            )
            db.add(db_alert)

    record.month = record_in.month
    record.data = record_in.data
    db.commit()
    db.refresh(record)
    return record


# ------------------------------------------------
# Delete a record
# ------------------------------------------------
@router.delete("/{record_id}")
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    _require_not_org_admin(current_user)
    record = db.query(models.ProductDataRecord).filter(
        models.ProductDataRecord.id == record_id,
        models.ProductDataRecord.organization_id == current_user.organization_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    if current_user.role.value == "org_user":
        assignment = db.query(models.UserProductAssignment).filter(
            models.UserProductAssignment.user_id == current_user.id,
            models.UserProductAssignment.product_id == record.product_id
        ).first()
        if not assignment:
            raise HTTPException(status_code=403, detail="You do not have access to this unit.")

    db.delete(record)
    db.commit()
    return {"detail": "Record deleted successfully"}


# ------------------------------------------------
# Aggregated Analytics Report for a Record
# (Replacement for Batch Report)
# ------------------------------------------------
@router.get("/{record_id}/report")
def get_record_report(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    record = db.query(models.ProductDataRecord).filter(
        models.ProductDataRecord.id == record_id,
        models.ProductDataRecord.organization_id == current_user.organization_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    if current_user.role.value == "org_user":
        assignment = db.query(models.UserProductAssignment).filter(
            models.UserProductAssignment.user_id == current_user.id,
            models.UserProductAssignment.product_id == record.product_id
        ).first()
        if not assignment:
            raise HTTPException(status_code=403, detail="You do not have access to this unit.")

    from ..data_pipeline import parse_legacy_record, OUTPUT_KEYWORDS

    normalised = parse_legacy_record(record.data or {})
    unit_data = normalised.get("unit_data", {})
    customer_data = normalised.get("customer_data", [])
    computed_data = normalised.get("computed", {})

    inputs = {}
    outputs = {}
    total_output = 0.0
    total_input_cost = 0.0
    per_input_stats = {}

    # Helper to classify and aggregate metrics
    def process_kv(k, v):
        nonlocal total_output, total_input_cost
        try:
            val = float(v)
        except (ValueError, TypeError):
            return
        
        k_lower = k.lower()
        is_output = any(kw in k_lower for kw in OUTPUT_KEYWORDS)
        
        if is_output:
            outputs[k] = outputs.get(k, 0.0) + val
            total_output += val
        else:
            inputs[k] = inputs.get(k, 0.0) + val
            total_input_cost += val

    # 1. Process overall unit-level metrics
    for k, v in unit_data.items():
        process_kv(k, v)

    # 2. Process customer-level metrics
    for cust in customer_data:
        for k, v in cust.items():
            if k == "name":
                continue
            process_kv(k, v)

    # 3. Process computed fields (like KPI formulas)
    for k, v in computed_data.items():
        process_kv(k, v)

    # Calculate per-input stats
    for k, v in inputs.items():
        per_input_stats[k] = {
            "total_used": v,
            "unit_price": 1.0, 
            "total_cost": v,
            "cost_per_output_unit": (v / total_output) if total_output > 0 else 0,
            "productivity_ratio": (total_output / v) if v > 0 else 0
        }

    # Map to structure for frontend compatibility with exact user-included variables
    all_totals = {**inputs, **outputs}
    return {
        "record_id": record_id,
        "product_name": record.product.name if record.product else "N/A",
        "month": record.month,
        "totals": all_totals if all_totals else (record.data or {}),
        "total_input_cost": total_input_cost,
        "input_cost_per_unit": (total_input_cost / total_output) if total_output > 0 else 0,
        "Combined_productivity_ratio": (total_output / total_input_cost) if total_input_cost > 0 else 0,
        "per_input_stats": per_input_stats,
        "daily_details": [{"date": record.month, "totals": all_totals if all_totals else (record.data or {})}],
        "trend_data": [
            {"shift": "Current", "output_units": total_output, "total_cost": total_input_cost, "productivity_ratio": (total_output / total_input_cost) if total_input_cost > 0 else 0}
        ]
    }


# ------------------------------------------------
# Export Record to Excel
# ------------------------------------------------
@router.get("/{record_id}/export")
def export_record_excel(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    record = db.query(models.ProductDataRecord).filter(
        models.ProductDataRecord.id == record_id,
        models.ProductDataRecord.organization_id == current_user.organization_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    if current_user.role.value == "org_user":
        assignment = db.query(models.UserProductAssignment).filter(
            models.UserProductAssignment.user_id == current_user.id,
            models.UserProductAssignment.product_id == record.product_id
        ).first()
        if not assignment:
            raise HTTPException(status_code=403, detail="You do not have access to this unit.")

    df = pd.DataFrame([record.data or {}])
    file_path = f"record_{record_id}_export.xlsx"
    df.to_excel(file_path, index=False)

    return FileResponse(
        file_path,
        filename=f"Report_{record.month}.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
