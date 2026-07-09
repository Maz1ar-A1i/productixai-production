import re
import json
from typing import Optional, Dict, Any, List
from datetime import date, datetime
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException
from ..database import get_db
from .. import models, schemas
from ..deps import get_current_user
from ..core_logic import get_rag_chatbot_response as core_rag_response

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])

# Utility for formatting DB values
def _fmt(v):
    if v is None:
        return "N/A"
    if isinstance(v, (date,)):
        return v.isoformat()
    return str(v)

def detect_intent(query: str) -> Dict[str, Any]:
    """Lightweight intent detection."""
    q = query.lower()
    
    # Specific product list request (e.g. "list all products")
    if re.search(r"\b(list|show)\b.*\bproducts\b", q):
        return {"entity_type": "product", "identifier": None}

    # product name lookup (e.g. "info on product ABC")
    m = re.search(r"product\s+(?:named|is)?\s*([a-z0-9_\- ]+)", q)
    if m:
        return {"entity_type": "product", "identifier": m.group(1).strip()}

    # Recent records request
    if re.search(r"\b(show|list)\b.*\b(records|data)\b", q):
        return {"entity_type": "record", "identifier": None}

    # Analytics intent
    if any(tok in q for tok in ["highest", "lowest", "average", "max", "min", "which product"]):
        return {"entity_type": "analytics", "identifier": None}

    return {"entity_type": "unknown", "identifier": None}

def answer_product(db, org_id: int, identifier: Optional[str], current_user: models.User) -> Optional[str]:
    query_prod = db.query(models.Product).filter(models.Product.organization_id == org_id)
    if current_user.role.value == "org_user":
        assigned_ids = [a.product_id for a in db.query(models.UserProductAssignment).filter(
            models.UserProductAssignment.user_id == current_user.id
        ).all()]
        query_prod = query_prod.filter(models.Product.id.in_(assigned_ids))

    if identifier:
        products = query_prod.filter(models.Product.name.ilike(f"%{identifier}%")).all()
    else:
        products = query_prod.all()

    if not products: return None
    lines = ["🧩 Products:"]
    for p in products:
        lines.append(f"- {p.name} | Sector: {p.sector or 'N/A'} | Description: {p.description or 'N/A'}")
    return "\n".join(lines)

def answer_record(db, org_id: int, current_user: models.User) -> Optional[str]:
    query_rec = db.query(models.ProductDataRecord).filter(models.ProductDataRecord.organization_id == org_id)
    if current_user.role.value == "org_user":
        assigned_ids = [a.product_id for a in db.query(models.UserProductAssignment).filter(
            models.UserProductAssignment.user_id == current_user.id
        ).all()]
        query_rec = query_rec.filter(models.ProductDataRecord.product_id.in_(assigned_ids))

    records = query_rec.order_by(models.ProductDataRecord.created_at.desc()).limit(10).all()
    if not records: return None
    lines = ["📊 Recent Data Records:"]
    for r in records:
        product_name = r.product.name if r.product else r.product_id
        data = r.data or {}
        if "tenants" in data and isinstance(data["tenants"], list):
            t_names = [t.get("name", "N/A") for t in data["tenants"]]
            lines.append(f"- {r.month} | Tower: {product_name} | Tenants: {', '.join(t_names)}")
        else:
            lines.append(f"- {r.month} | Tower: {product_name} | Data: {json.dumps(data)}")
    return "\n".join(lines)

def run_analytics(db, org_id: int, query: str, current_user: models.User) -> Optional[str]:
    q = query.lower()
    if any(tok in q for tok in ["highest output", "max output", "which product had highest"]):
        query_rec = db.query(models.ProductDataRecord).filter(models.ProductDataRecord.organization_id == org_id)
        if current_user.role.value == "org_user":
            assigned_ids = [a.product_id for a in db.query(models.UserProductAssignment).filter(
                models.UserProductAssignment.user_id == current_user.id
            ).all()]
            query_rec = query_rec.filter(models.ProductDataRecord.product_id.in_(assigned_ids))
        records = query_rec.all()
        prod_sums = {}
        for r in records:
            p_name = r.product.name if r.product else str(r.product_id)
            total = 0.0
            found = False
            if r.data:
                if "tenants" in r.data and isinstance(r.data["tenants"], list):
                    for t in r.data["tenants"]:
                        for k, v in t.get("outputs", {}).items():
                            try:
                                total += float(v)
                                found = True
                            except: pass
                else:
                    for k, v in r.data.items():
                        try:
                            if any(kw in k.lower() for kw in ["revenue", "sales", "traffic", "capacity", "units", "produced", "sold", "kw", "kilowatt"]):
                                total += float(v)
                                found = True
                        except: continue
            if found:
                prod_sums[p_name] = prod_sums.get(p_name, 0.0) + total
        
        if not prod_sums: return "No output data found."
        best_p = max(prod_sums.items(), key=lambda x: x[1])
        return f"Product with highest output: {best_p[0]} ({best_p[1]} units/revenue)"
    return None

import enum

def serialize_model(obj):
    """Helper to convert SQLAlchemy model to dict, handling dates, enums, and Decimals."""
    data = {}
    for k, v in obj.__dict__.items():
        if not k.startswith("_sa_"):
            if isinstance(v, (date, datetime)):
                data[k] = v.isoformat()
            elif isinstance(v, enum.Enum):
                data[k] = v.value
            elif hasattr(v, '__dict__'): # Skip complex objects/relationships
                continue
            else:
                try:
                    json.dumps(v) # Test serializability
                    data[k] = v
                except:
                    data[k] = str(v)
    return data

@router.post("/rag", response_model=schemas.ChatbotResponse)
def chatbot_query(payload: Dict[str, Any], db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = payload.get("query")
    history = payload.get("history", [])
    bot_type = payload.get("bot_type", "productivity")
    product_id = payload.get("product_id")
    
    if not query:
        raise HTTPException(status_code=400, detail="Query is required.")

    org_id = current_user.organization_id

    try:
        # Get active filters from payload
        active_filters = payload.get("filters", {})
        if not active_filters and product_id:
            # Fallback for old parameter
            active_filters = {"tower_id": product_id}

        # If user is org_user, verify filter matches assignment
        assigned_ids = None
        if current_user.role.value == "org_user":
            assigned_ids = [a.product_id for a in db.query(models.UserProductAssignment).filter(
                models.UserProductAssignment.user_id == current_user.id
            ).all()]
            if active_filters.get("tower_id") and str(active_filters["tower_id"]).lower() != "all":
                try:
                    tid = int(active_filters["tower_id"])
                    if tid not in assigned_ids:
                        raise HTTPException(status_code=403, detail="You do not have access to this unit.")
                except (ValueError, TypeError):
                    pass

        # 1) Direct DB Intent Handling (only for simple queries without history)
        intent = detect_intent(query)
        db_answer = None
        if not history and not active_filters:  # only do simple db intent answer if no filters are active to avoid leaking out-of-scope data
            if intent["entity_type"] == "product":
                db_answer = answer_product(db, org_id, intent.get("identifier"), current_user)
            elif intent["entity_type"] == "record":
                db_answer = answer_record(db, org_id, current_user)
            elif intent["entity_type"] == "analytics":
                db_answer = run_analytics(db, org_id, query, current_user)

        if db_answer:
            history_record = models.ChatbotHistory(
                organization_id=org_id, user_id=current_user.id,
                query=query, response=db_answer
            )
            db.add(history_record)
            db.commit()
            return {"query": query, "response": db_answer}

        # 2) RAG Fallback with History and Filters
        records_query = db.query(models.ProductDataRecord).filter(
            models.ProductDataRecord.organization_id == org_id
        )
        products_query = db.query(models.Product).filter(
            models.Product.organization_id == org_id
        )
        
        if assigned_ids is not None:
            records_query = records_query.filter(models.ProductDataRecord.product_id.in_(assigned_ids))
            products_query = products_query.filter(models.Product.id.in_(assigned_ids))

        all_records = records_query.all()
        all_products = products_query.all()

        # Apply filters using apply_filters helper
        from ..data_pipeline import apply_filters
        filtered_records = apply_filters(all_records, active_filters)

        # Filter products to match remaining records, or directly filter if a tower filter is applied
        filtered_pids = {r.product_id for r in filtered_records}
        filtered_products = [p for p in all_products if p.id in filtered_pids]

        if active_filters.get("tower_id") and str(active_filters["tower_id"]).lower() != "all":
            try:
                tid = int(active_filters["tower_id"])
                filtered_products = [p for p in all_products if p.id == tid]
            except (ValueError, TypeError):
                # Try matching by name
                target_name = str(active_filters["tower_id"]).lower()
                filtered_products = [p for p in all_products if target_name in p.name.lower()]
                
        # Limit the lists for safety context sizes
        filtered_products = filtered_products[:15]
        filtered_records = filtered_records[:30]

        context_data = {
            "products": [serialize_model(p) for p in filtered_products],
            "data_records": [serialize_model(r) for r in filtered_records],
        }

        # Check if bot_type is a custom chatbot ID (integer)
        custom_bot_name = "Productix AI"
        custom_bot_persona = ""
        
        is_custom_bot = False
        try:
            bot_id_int = int(bot_type)
            is_custom_bot = True
        except (ValueError, TypeError):
            is_custom_bot = False

        if is_custom_bot:
            custom_bot = db.query(models.CustomChatbot).filter(
                models.CustomChatbot.id == bot_id_int,
                models.CustomChatbot.organization_id == org_id
            ).first()
            if custom_bot:
                custom_bot_name = custom_bot.name
                custom_bot_persona = custom_bot.description
                bot_type = "productivity" # Use default productivity data engine
        else:
            # Fallback to user settings
            custom_bot_name = getattr(current_user, "chatbot_name", "Productix AI") or "Productix AI"
            custom_bot_persona = getattr(current_user, "chatbot_persona", "") or ""
        
        rag_result = core_rag_response(
            context_data, query, history=history, bot_type=bot_type,
            custom_name=custom_bot_name, custom_persona=custom_bot_persona
        )
        
        if "error" in rag_result:
             return {"query": query, "response": f"AI Error: {rag_result['error']}"}

        rag_text = rag_result.get("response", "No response generated.")

        # Save to history
        new_history = models.ChatbotHistory(
            organization_id=org_id, user_id=current_user.id,
            query=query, response=rag_text, records=context_data
        )
        db.add(new_history)
        db.commit()

        return {"query": query, "response": rag_text}

    except Exception as e:
        import traceback
        traceback.print_exc()
        # Return a valid ChatbotResponse even on error to avoid 500s
        return {"query": query, "response": f"System Error: {str(e)}"}
