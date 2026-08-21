from fastapi import APIRouter, Depends, HTTPException, Query
from .. import deps, models
from .. import erpnext_client as erp

router = APIRouter(prefix="/api/erpnext", tags=["ERPNext Integration"])


@router.get("/health")
def erpnext_health(current_user: models.User = Depends(deps.get_current_user)):
    return erp.check_health()


@router.get("/doctypes")
def erpnext_allowed_doctypes(current_user: models.User = Depends(deps.get_current_user)):
    return {"allowed": erp.allowed_doctypes()}


@router.get("/{doctype}")
def erpnext_list(
    doctype: str,
    limit: int = Query(20, ge=1, le=100),
    current_user: models.User = Depends(deps.get_current_user),
):
    try:
        return {"data": erp.list_documents(doctype, limit=limit)}
    except erp.ERPNextForbiddenDoctype:
        raise HTTPException(status_code=403, detail=f"DocType '{doctype}' is not readable through this connector")
    except erp.ERPNextNotConfigured:
        raise HTTPException(status_code=503, detail="ERPNext connector is not configured")
    except erp.ERPNextUnavailable as exc:
        raise HTTPException(status_code=504, detail=str(exc))
    except erp.ERPNextUpstreamError as exc:
        raise HTTPException(status_code=502, detail=exc.detail)


@router.get("/{doctype}/{name}")
def erpnext_get(
    doctype: str,
    name: str,
    current_user: models.User = Depends(deps.get_current_user),
):
    try:
        doc = erp.get_document(doctype, name)
        if not doc:
            raise HTTPException(status_code=404, detail="Not found")
        return {"data": doc}
    except erp.ERPNextForbiddenDoctype:
        raise HTTPException(status_code=403, detail=f"DocType '{doctype}' is not readable through this connector")
    except erp.ERPNextNotConfigured:
        raise HTTPException(status_code=503, detail="ERPNext connector is not configured")
    except erp.ERPNextUnavailable as exc:
        raise HTTPException(status_code=504, detail=str(exc))
    except erp.ERPNextUpstreamError as exc:
        raise HTTPException(status_code=502, detail=exc.detail)
