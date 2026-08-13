"""
data_pipeline.py — Centralized data normalization, filtering, and AI formatting.

PURPOSE:
  Both data sources (Excel upload and manual UnitDataEntry) produce data in
  slightly different shapes.  This module normalises them into one canonical
  JSON schema stored in ProductDataRecord.data, applies contextual filters
  (tower / date-range / region / recency), and formats the filtered result
  into a string that the LLM chatbots can consume.

CANONICAL RECORD SCHEMA (stored in ProductDataRecord.data):
  {
    "parameters": {
      "date":       "2026-04-17",
      "towerName":  "KHI-Unit-04",
      "city":       "Karachi",
      "region":     "Karachi"        # derived from city or explicit
    },
    "unit_data": {                   # overall unit-level metrics
      "Fuel Cost": 50000,
      "KW Produced": 80,
      ...
    },
    "customer_data": [               # per-customer rows (may be empty)
      {
        "name": "Jazz",
        "KW Sold": 20,
        "Price per KW": 500,
        ...
      }
    ],
    "computed": {                    # formula-computed fields (optional)
      "Total Revenue": 300000,
      "Profit": 150000,
      ...
    }
  }
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# FIXED_VARIABLES — the authoritative column list (mirrors UnitManager.jsx)
# ---------------------------------------------------------------------------
FIXED_VARIABLES = [
    "Fuel Cost", "WAPDA Cost", "HR Cost", "Rent", "Other Costs",
    "Total Capacity (KW)", "KW Produced", "KW Sold",
    "Attached Customers", "Max Customers",
    "Total OPEX", "Daily Cost", "Monthly OPEX",
    "Capacity Utilization", "Idle Capacity (KW)", "Cost per KW",
    "Customer Utilization", "Total Revenue", "Profit",
    "Idle Capacity Value",
    "Price per KW", "Daily Revenue", "Monthly Revenue",
]

# Which of those are "output" metrics (used for heuristic classification)
OUTPUT_KEYWORDS = {
    "revenue", "sales", "traffic", "capacity", "units", "produced",
    "sold", "kw sold", "profit", "total revenue", "daily revenue",
    "monthly revenue", "idle capacity value",
}

# Legacy column name → canonical name mapping for Excel backwards compat
LEGACY_COL_MAP = {
    "totalkwproduced":       "KW Produced",
    "totalkilowattsproduced":"KW Produced",
    "totalkilowattssold":    "KW Sold",
    "priceperkilowatt":      "Price per KW",
    "fuelexpense":           "Fuel Cost",
    "hrexpense":             "HR Cost",
    "operationexpense":      "Other Costs",
    "maintenanceexpense":    "Other Costs",    # merge into Other Costs
    "batteryexpense":        "Other Costs",
    "solargridexpense":      "WAPDA Cost",
    "dieselfuelexpense":     "Fuel Cost",
    "revenue_pkr":           "Total Revenue",
    "grid_kwh":              "KW Produced",
    "dg_runhours":           "Other Costs",
    "totalrevenue":          "Total Revenue",
    "rent":                  "Rent",
    "wapda cost":            "WAPDA Cost",
    "fuel cost":             "Fuel Cost",
    "hr cost":               "HR Cost",
}


# ═══════════════════════════════════════════════════════════════════════════════
# NORMALISATION
# ═══════════════════════════════════════════════════════════════════════════════

def _map_column_name(raw: str) -> str:
    """Preserve exact user column names, falling back to clean stripped names."""
    if not raw:
        return ""
    stripped = raw.strip()
    # If case matches known FIXED_VARIABLES, format properly
    for fv in FIXED_VARIABLES:
        if stripped.lower() == fv.lower():
            return fv
    # Return user-defined exact column name as-is
    return stripped



def normalize_from_manual_entry(
    unit_rows: List[Dict[str, Any]],
    customer_rows: List[Dict[str, Any]],
    tower_name: str,
    city: str = "",
    region: str = "",
    col_map: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Convert UnitDataEntry's unit_rows + customer_rows (from the frontend)
    into a list of canonical records, one per unique Date.
    """
    col_map = col_map or {}
    records_by_date: Dict[str, Dict[str, Any]] = {}
    default_date = datetime.now().strftime("%Y-%m-%d")

    def clean_date_str(val: Any) -> str:
        s = str(val or "").strip()
        if not s or s == "undefined" or s == "null":
            return default_date
        if "T" in s:
            s = s.split("T")[0]
        return s

    # Process unit rows
    for row in unit_rows:
        date_val = clean_date_str(row.get("Date"))

        if date_val not in records_by_date:
            records_by_date[date_val] = {
                "parameters": {
                    "date": date_val,
                    "towerName": tower_name,
                    "city": city,
                    "region": region or city,
                },
                "unit_data": {},
                "customer_data": [],
                "computed": {},
            }

        rec = records_by_date[date_val]
        for key, value in row.items():
            if key in ("Date", "id"):
                continue
            clean_key = key.replace("unit_", "")
            display_name = col_map.get(clean_key, clean_key)
            try:
                numeric_val = float(value) if value not in (None, "", "nan") else 0.0
            except (ValueError, TypeError):
                numeric_val = 0.0
            rec["unit_data"][display_name] = numeric_val
            # Also store under the original key as a fallback so the frontend can
            # reconstruct data correctly even when colMap hasn't loaded yet.
            if display_name != clean_key:
                rec["unit_data"][clean_key] = numeric_val

    # Process customer rows
    for row in customer_rows:
        date_val = clean_date_str(row.get("Date"))

        customer_name = str(row.get("Customer", "")).strip()
        if not customer_name:
            continue

        if date_val not in records_by_date:
            records_by_date[date_val] = {
                "parameters": {
                    "date": date_val,
                    "towerName": tower_name,
                    "city": city,
                    "region": region or city,
                },
                "unit_data": {},
                "customer_data": [],
                "computed": {},
            }

        entry: Dict[str, Any] = {"name": customer_name}
        for key, value in row.items():
            if key in ("Date", "Customer", "id"):
                continue
            clean_key = key.replace("customer_", "")
            display_name = col_map.get(clean_key, clean_key)
            try:
                numeric_val = float(value) if value not in (None, "", "nan") else 0.0
            except (ValueError, TypeError):
                numeric_val = 0.0
            entry[display_name] = numeric_val
            # Same dual-key pattern: store under original name as fallback.
            if display_name != clean_key:
                entry[clean_key] = numeric_val

        records_by_date[date_val]["customer_data"].append(entry)

    return list(records_by_date.values())


def parse_legacy_record(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Backward-compatible parser: converts old 'tenants'/'customers' format
    records into the new canonical schema so downstream code only has to
    handle one format.

    CHANGED: Added to handle pre-refactor data stored in the DB.
    """
    if "unit_data" in data:
        # Already in new format
        return data

    params = data.get("parameters", {})
    tenants = data.get("tenants", data.get("customers", []))

    unit_data: Dict[str, float] = {}
    customer_data: List[Dict[str, Any]] = []

    if isinstance(tenants, list):
        for t in tenants:
            name = t.get("name", "Unknown")
            inputs = t.get("inputs", {})
            outputs = t.get("outputs", {})

            # Aggregate unit-level metrics from inputs
            for k, v in inputs.items():
                canonical = _map_column_name(k)
                try:
                    unit_data[canonical] = unit_data.get(canonical, 0.0) + float(v)
                except (ValueError, TypeError):
                    pass

            # Build customer entry from outputs
            cust: Dict[str, Any] = {"name": name}
            for k, v in outputs.items():
                canonical = _map_column_name(k)
                try:
                    cust[canonical] = float(v)
                except (ValueError, TypeError):
                    cust[canonical] = 0.0
            customer_data.append(cust)
    else:
        # Flat legacy format (key-value pairs directly in data)
        for k, v in data.items():
            if k in ("parameters", "tenants", "customers", "totalUnitRevenue",
                      "totalTowerRevenue"):
                continue
            canonical = _map_column_name(k)
            try:
                unit_data[canonical] = float(v)
            except (ValueError, TypeError):
                pass

    return {
        "parameters": {
            "date": params.get("date", ""),
            "towerName": params.get("towerName", params.get("unitName", "")),
            "city": params.get("city", params.get("location", "")),
            "region": params.get("region", params.get("city", "")),
        },
        "unit_data": unit_data,
        "customer_data": customer_data,
        "computed": {},
    }


# ═══════════════════════════════════════════════════════════════════════════════
# FILTERING
# ═══════════════════════════════════════════════════════════════════════════════

def apply_filters(
    records,   # List of ProductDataRecord ORM objects
    filters: Dict[str, Any],
) -> list:
    """
    Apply contextual filters to a list of ProductDataRecord objects.
    Returns only those records matching ALL specified filters.

    CHANGED: New function — ensures strict chatbot isolation.  Once filters
    are applied, no data outside the scope can leak into the AI context.

    Supported filter keys:
      tower_id      (int)  — Product.id to match
      tower_name    (str)  — Product.name substring match
      date_start    (str)  — "YYYY-MM-DD" inclusive lower bound
      date_end      (str)  — "YYYY-MM-DD" inclusive upper bound
      region        (str)  — city/region name (case-insensitive contains)
      recency_days  (int)  — only records with date within last N days
      recency_limit (int)  — max N most-recent records (applied last)
      sort_order    (str)  — "asc" or "desc" (default desc)
    """
    tower_id = filters.get("tower_id")
    tower_name = filters.get("tower_name")
    date_start = filters.get("date_start")
    date_end = filters.get("date_end")
    region = filters.get("region")
    recency_days = filters.get("recency_days")
    recency_limit = filters.get("recency_limit")
    sort_order = filters.get("sort_order", "desc")

    filtered = list(records)

    # Tower filter
    if tower_id and str(tower_id).lower() != "all":
        try:
            tid = int(tower_id)
            filtered = [r for r in filtered if r.product_id == tid]
        except (ValueError, TypeError):
            pass

    if tower_name:
        tn_lower = tower_name.lower()
        filtered = [
            r for r in filtered
            if (r.product and tn_lower in r.product.name.lower())
        ]

    # Date filters — extract date from the record's data JSON or month field
    def _get_record_date(rec) -> Optional[str]:
        """Extract date string from record, trying canonical schema then month fallback."""
        d = rec.data or {}
        if "parameters" in d and "date" in d["parameters"]:
            return str(d["parameters"]["date"])
        if hasattr(rec, "record_date") and rec.record_date:
            return str(rec.record_date)
        if rec.month:
            return str(rec.month)
        if hasattr(rec, "created_at") and rec.created_at:
            return str(rec.created_at)[:10]
        return None

    def _date_matches_range(rec_date_str: Optional[str], start: Optional[str], end: Optional[str]) -> bool:
        if not rec_date_str:
            return False
        d_val = rec_date_str.strip()
        # If rec_date_str is YYYY-MM (7 chars), compare by month prefix
        if len(d_val) == 7 and d_val[4] == "-":
            if start and d_val < start[:7]:
                return False
            if end and d_val > end[:7]:
                return False
            return True
        # Otherwise compare full YYYY-MM-DD
        if start and d_val < start:
            return False
        if end and d_val > end:
            return False
        return True

    if date_start or date_end:
        filtered = [
            r for r in filtered
            if _date_matches_range(_get_record_date(r), date_start, date_end)
        ]

    if recency_days:
        try:
            cutoff = (datetime.utcnow() - timedelta(days=int(recency_days))).strftime("%Y-%m-%d")
            filtered = [
                r for r in filtered
                if (_get_record_date(r) or "") >= cutoff
            ]
        except (ValueError, TypeError):
            pass

    # Region filter — check data.parameters.region or data.parameters.city
    if region:
        region_lower = region.lower()
        def _matches_region(rec) -> bool:
            d = rec.data or {}
            params = d.get("parameters", {})
            rec_region = str(params.get("region", params.get("city", ""))).lower()
            return region_lower in rec_region
        filtered = [r for r in filtered if _matches_region(r)]

    # Sort by date
    def _sort_key(rec):
        return _get_record_date(rec) or ""

    filtered.sort(key=_sort_key, reverse=(sort_order == "desc"))

    # Recency limit — applied last after sorting
    if recency_limit:
        try:
            filtered = filtered[:int(recency_limit)]
        except (ValueError, TypeError):
            pass

    return filtered


# ═══════════════════════════════════════════════════════════════════════════════
# AI FORMATTING
# ═══════════════════════════════════════════════════════════════════════════════

def format_for_chatbot(
    records,                   # List of ProductDataRecord ORM objects (filtered)
    filters: Dict[str, Any] = None,
) -> str:
    """
    Format filtered ProductDataRecord objects into a readable context string
    for the LLM chatbot.

    CHANGED: Replaces format_records_for_ai1() and _format_records_for_ai().
    Now handles both new canonical schema and legacy formats transparently.
    """
    if not records:
        return "No data records found matching the applied filters."

    filters = filters or {}
    lines: List[str] = []

    # Header with active filter summary
    filter_desc = []
    if filters.get("tower_id") and str(filters["tower_id"]).lower() != "all":
        filter_desc.append(f"Tower ID: {filters['tower_id']}")
    if filters.get("tower_name"):
        filter_desc.append(f"Tower: {filters['tower_name']}")
    if filters.get("date_start"):
        filter_desc.append(f"From: {filters['date_start']}")
    if filters.get("date_end"):
        filter_desc.append(f"To: {filters['date_end']}")
    if filters.get("region"):
        filter_desc.append(f"Region: {filters['region']}")
    if filters.get("recency_days"):
        filter_desc.append(f"Last {filters['recency_days']} days")

    if filter_desc:
        lines.append(f"📌 Active Filters: {' | '.join(filter_desc)}")
        lines.append("")

    lines.append(f"📊 Data Records ({len(records)} records):")
    lines.append("")

    for i, rec in enumerate(records):
        if i >= 40:  # Safety cap for context window
            lines.append("... [Additional records truncated] ...")
            break

        data = rec.data or {}
        normalised = parse_legacy_record(data)
        params = normalised.get("parameters", {})
        unit_data = normalised.get("unit_data", {})
        customer_data = normalised.get("customer_data", [])
        computed = normalised.get("computed", {})

        tower_name = params.get("towerName", "")
        if not tower_name and rec.product:
            tower_name = rec.product.name
        date_str = params.get("date", rec.month or "N/A")
        city = params.get("city", "")

        lines.append(f"--- Record {i + 1}: {tower_name} | {date_str} | {city} ---")

        # Unit-level data
        if unit_data:
            lines.append("  Unit Metrics:")
            for k, v in unit_data.items():
                lines.append(f"    {k}: {v}")

        # Customer data
        if customer_data:
            lines.append("  Customer Data:")
            for cust in customer_data:
                cust_name = cust.get("name", "Unknown")
                cust_metrics = {k: v for k, v in cust.items() if k != "name"}
                lines.append(f"    * {cust_name}: {json.dumps(cust_metrics)}")

        # Computed fields
        if computed:
            lines.append("  Computed:")
            for k, v in computed.items():
                lines.append(f"    {k}: {v}")

        lines.append("")

    return "\n".join(lines)


def classify_input_output(data: Dict[str, Any]) -> tuple:
    """
    Given the normalised record data, split unit_data into inputs and outputs
    using the FIXED_VARIABLES keyword heuristic.

    Returns (inputs_dict, outputs_dict).

    CHANGED: Uses canonical column names instead of the old heuristic
    keyword scanning.  More precise classification.
    """
    normalised = parse_legacy_record(data) if "unit_data" not in data else data
    unit_data = normalised.get("unit_data", {})
    customer_data = normalised.get("customer_data", [])

    inputs: Dict[str, float] = {}
    outputs: Dict[str, float] = {}

    for k, v in unit_data.items():
        try:
            val = float(v)
        except (ValueError, TypeError):
            continue
        if any(kw in k.lower() for kw in OUTPUT_KEYWORDS):
            outputs[k] = val
        else:
            inputs[k] = val

    # Aggregate customer outputs
    for cust in customer_data:
        for k, v in cust.items():
            if k == "name":
                continue
            try:
                val = float(v)
            except (ValueError, TypeError):
                continue
            if any(kw in k.lower() for kw in OUTPUT_KEYWORDS):
                outputs[k] = outputs.get(k, 0.0) + val
            else:
                inputs[k] = inputs.get(k, 0.0) + val

    return inputs, outputs
