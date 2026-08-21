"""
Server-side ERPNext connector (Productix -> ERPNext REST API only, never a
direct DB connection). Read-only: list/get on an explicit DocType allowlist.

Configured entirely through env vars — no secret is ever returned to a
caller, only used for the outbound Authorization header.
"""
import os
import requests

ERPNEXT_BASE_URL = os.getenv("ERPNEXT_BASE_URL", "").rstrip("/")
ERPNEXT_API_KEY = os.getenv("ERPNEXT_API_KEY", "")
ERPNEXT_API_SECRET = os.getenv("ERPNEXT_API_SECRET", "")
ERPNEXT_TIMEOUT_S = int(os.getenv("ERPNEXT_TIMEOUT_MS", "8000")) / 1000
ERPNEXT_ALLOWED_DOCTYPES = {
    d.strip() for d in os.getenv("ERPNEXT_ALLOWED_DOCTYPES", "").split(",") if d.strip()
}


class ERPNextNotConfigured(Exception):
    pass


class ERPNextForbiddenDoctype(Exception):
    def __init__(self, doctype: str):
        self.doctype = doctype
        super().__init__(f"DocType '{doctype}' is not in ERPNEXT_ALLOWED_DOCTYPES")


class ERPNextUpstreamError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class ERPNextUnavailable(Exception):
    pass


def is_configured() -> bool:
    return bool(ERPNEXT_BASE_URL and ERPNEXT_API_KEY and ERPNEXT_API_SECRET)


def _headers() -> dict:
    return {
        "Authorization": f"token {ERPNEXT_API_KEY}:{ERPNEXT_API_SECRET}",
        "Accept": "application/json",
    }


def _require_configured():
    if not is_configured():
        raise ERPNextNotConfigured(
            "ERPNEXT_BASE_URL, ERPNEXT_API_KEY and ERPNEXT_API_SECRET must all be set"
        )


def _require_allowed(doctype: str):
    if doctype not in ERPNEXT_ALLOWED_DOCTYPES:
        raise ERPNextForbiddenDoctype(doctype)


def _request(method: str, path: str, **kwargs) -> dict:
    _require_configured()
    url = f"{ERPNEXT_BASE_URL}{path}"
    try:
        resp = requests.request(
            method, url, headers=_headers(), timeout=ERPNEXT_TIMEOUT_S, **kwargs
        )
    except requests.exceptions.Timeout:
        raise ERPNextUnavailable(f"ERPNext request timed out after {ERPNEXT_TIMEOUT_S}s")
    except requests.exceptions.RequestException as exc:
        raise ERPNextUnavailable(f"Could not reach ERPNext: {exc.__class__.__name__}")

    if resp.status_code == 401 or resp.status_code == 403:
        raise ERPNextUpstreamError(resp.status_code, "ERPNext rejected the integration credentials")
    if resp.status_code >= 400:
        raise ERPNextUpstreamError(resp.status_code, f"ERPNext returned HTTP {resp.status_code}")

    try:
        return resp.json()
    except ValueError:
        raise ERPNextUpstreamError(resp.status_code, "ERPNext returned a non-JSON response")


def check_health() -> dict:
    """Never raises — used for a health widget that must degrade safely."""
    if not is_configured():
        return {"status": "unconfigured", "detail": "ERPNext connector env vars are not set"}
    try:
        _request("GET", "/api/method/frappe.auth.get_logged_user")
        return {"status": "ok"}
    except ERPNextUnavailable as exc:
        return {"status": "unreachable", "detail": str(exc)}
    except ERPNextUpstreamError as exc:
        return {"status": "error", "detail": exc.detail}


def list_documents(doctype: str, limit: int = 20, fields: list[str] | None = None) -> list[dict]:
    _require_allowed(doctype)
    params = {"limit_page_length": max(1, min(limit, 100))}
    if fields:
        params["fields"] = str(fields)
    data = _request("GET", f"/api/resource/{doctype}", params=params)
    return data.get("data", [])


def get_document(doctype: str, name: str) -> dict:
    _require_allowed(doctype)
    data = _request("GET", f"/api/resource/{doctype}/{name}")
    return data.get("data", {})


def allowed_doctypes() -> list[str]:
    return sorted(ERPNEXT_ALLOWED_DOCTYPES)
