"""
Alert Notification Router
API endpoints for managing alert notifications
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from .. import models, schemas, deps, database
from ..validation_service import ValidationService

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.post("/validate/shift-entry", response_model=schemas.ValidationResult)
def validate_shift_entry(
    data: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Validate shift entry data without saving
    Returns validation result with any alerts/warnings
    """
    try:
        result = ValidationService.validate_shift_entry(data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


@router.post("/validate/data-record", response_model=schemas.ValidationResult)
def validate_data_record(
    data: dict,
    product_fields: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Validate product data record without saving
    Returns validation result with any alerts/warnings
    """
    try:
        result = ValidationService.validate_data_record(data, product_fields)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


@router.post("/validate/unit-data", response_model=schemas.ValidationResult)
@router.post("/validate/tower-data", response_model=schemas.ValidationResult)
def validate_unit_data(
    payload: dict,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Validate unit/tower and customer/tenant data without saving
    Returns validation result with any alerts/warnings
    """
    try:
        unit_data = payload.get("unit_data") or payload.get("tower_data") or {}
        customer_data = payload.get("customer_data") or payload.get("tenant_data") or []
        result = ValidationService.validate_unit_data(unit_data, customer_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")


@router.post("/", response_model=schemas.AlertResponse)
def create_alert(
    alert: schemas.AlertCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Create a new alert notification
    """
    db_alert = models.Alert(
        organization_id=current_user.organization_id,
        user_id=alert.user_id or current_user.id,
        alert_type=alert.alert_type,
        severity=alert.severity,
        title=alert.title,
        message=alert.message,
        entity_type=alert.entity_type,
        entity_id=alert.entity_id,
        data_context=alert.data_context
    )
    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)
    return db_alert


@router.get("/", response_model=List[schemas.AlertResponse])
def list_alerts(
    dismissed: Optional[bool] = None,
    alert_type: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    List alerts for the current user's organization
    Filters by dismissed status, type, and severity if provided
    """
    query = db.query(models.Alert).filter(
        models.Alert.organization_id == current_user.organization_id
    )
    
    if dismissed is not None:
        query = query.filter(models.Alert.is_dismissed == dismissed)
    
    if alert_type:
        query = query.filter(models.Alert.alert_type == alert_type)
    
    if severity:
        query = query.filter(models.Alert.severity == severity)
    
    results = query.order_by(models.Alert.created_at.desc()).all()
    
    # Filter out alerts for deleted KPIs
    active_kpi_ids = {
        k.id for k in db.query(models.KPIDefinition).filter(
            models.KPIDefinition.organization_id == current_user.organization_id,
            models.KPIDefinition.is_active == True
        ).all()
    }
    
    filtered_results = []
    for alert in results:
        if alert.entity_type == "kpi" and alert.entity_id not in active_kpi_ids:
            # Clean up/delete the stale alert from database in the background so it doesn't build up
            try:
                db.delete(alert)
                db.commit()
            except:
                db.rollback()
            continue
        filtered_results.append(alert)
        
    return filtered_results[:limit]


@router.get("/{alert_id}", response_model=schemas.AlertResponse)
def get_alert(
    alert_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Get a specific alert by ID
    """
    alert = db.query(models.Alert).filter(
        models.Alert.id == alert_id,
        models.Alert.organization_id == current_user.organization_id
    ).first()
    
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    return alert


@router.put("/{alert_id}/dismiss", response_model=schemas.AlertResponse)
def dismiss_alert(
    alert_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Dismiss an alert
    """
    alert = db.query(models.Alert).filter(
        models.Alert.id == alert_id,
        models.Alert.organization_id == current_user.organization_id
    ).first()
    
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    alert.is_dismissed = True
    alert.dismissed_at = datetime.utcnow()
    alert.dismissed_by = current_user.id
    
    db.commit()
    db.refresh(alert)
    return alert


@router.delete("/{alert_id}")
def delete_alert(
    alert_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Delete an alert permanently
    """
    alert = db.query(models.Alert).filter(
        models.Alert.id == alert_id,
        models.Alert.organization_id == current_user.organization_id
    ).first()
    
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    db.delete(alert)
    db.commit()
    return {"detail": "Alert deleted successfully"}


@router.get("/stats/summary")
def get_alert_stats(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Get alert statistics summary
    """
    total_alerts = db.query(models.Alert).filter(
        models.Alert.organization_id == current_user.organization_id
    ).count()
    
    active_alerts = db.query(models.Alert).filter(
        models.Alert.organization_id == current_user.organization_id,
        models.Alert.is_dismissed == False
    ).count()
    
    critical_alerts = db.query(models.Alert).filter(
        models.Alert.organization_id == current_user.organization_id,
        models.Alert.severity == "critical",
        models.Alert.is_dismissed == False
    ).count()
    
    warning_alerts = db.query(models.Alert).filter(
        models.Alert.organization_id == current_user.organization_id,
        models.Alert.severity == "warning",
        models.Alert.is_dismissed == False
    ).count()
    
    return {
        "total_alerts": total_alerts,
        "active_alerts": active_alerts,
        "critical_alerts": critical_alerts,
        "warning_alerts": warning_alerts
    }