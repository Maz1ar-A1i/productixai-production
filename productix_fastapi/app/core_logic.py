# core_logic.py
#import google.generativeai as genai
import json
from typing import List
from .models import Batch, ShiftEntry, Product, ProductDataRecord
from sqlalchemy.orm import Session
import numpy as np
import os
from collections import defaultdict
from groq import Groq
import os
from pathlib import Path
from dotenv import load_dotenv
import re
import time

def _generate_with_retry(client, model, messages, system_instruction=None):
    """Wrapper to automatically retry on Groq rate limits or server errors."""
    for i in range(3):
        try:
            # If system instruction is provided, prepend it to messages
            final_messages = messages
            if system_instruction:
                final_messages = [{"role": "system", "content": system_instruction}] + messages
            
            completion = client.chat.completions.create(
                model=model,
                messages=final_messages,
                temperature=0.1, # Better for analytics
            )
            return completion.choices[0].message.content
        except Exception as e:
            # Check for rate limit (429) or overloaded server (503/500)
            err_str = str(e).lower()
            if ("429" in err_str or "503" in err_str or "500" in err_str) and i < 2:
                time.sleep(2 ** i)
                continue
            raise e

# ✅ Robustly load .env from current folder, parent, root, or exe directory
import sys
current_dir = Path(__file__).parent
env_paths = [
    current_dir / ".env",          # app/.env
    current_dir.parent / ".env",   # root/.env
]
if getattr(sys, 'frozen', False):
    env_paths.append(Path(sys.executable).parent / ".env")

for env_path in env_paths:
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=True)

APP_CONFIG = {
    "api_key": os.getenv("GROQ_API_KEY"),
}


def _format_records_for_ai(records: dict) -> str:
    """
    Formats a dictionary of ProductDataRecord objects into a string suitable
    for the AI agent. Each key in `records` is a product name, and
    the value is a list of records.
    """
    context = "Here is the historical productivity data (Flat Schema):\n\n"
    record_count = 1

    for product_name, p_records in records.items():
        for record in p_records:
            if record_count > 30:  # Higher limit for flat records
                context += "... [Additional records truncated] ...\n"
                return context

            def get_val(obj, key, default):
                if hasattr(obj, key): return getattr(obj, key)
                if isinstance(obj, dict): return obj.get(key, default)
                return default

            record_id = get_val(record, "id", "N/A")
            month = get_val(record, "month", "N/A")
            data = get_val(record, "data", {})

            context += f"--- Record {record_count} (Product: {product_name}, ID: {record_id}) ---\n"
            context += f"Month: {month}\n"
            
            if "unit_data" in data or "customer_data" in data:
                from .data_pipeline import parse_legacy_record
                normalised = parse_legacy_record(data)
                params = normalised.get("parameters", {})
                unit_data = normalised.get("unit_data", {})
                customer_data = normalised.get("customer_data", [])
                
                context += f"  Tower: {params.get('towerName', 'N/A')} | City: {params.get('city', 'N/A')} | Region: {params.get('region', 'N/A')}\n"
                context += f"  Unit Metrics: {json.dumps(unit_data)}\n"
                if customer_data:
                    context += "  Customer Data:\n"
                    for c in customer_data:
                        c_name = c.get("name", "Unknown")
                        c_metrics = {k: v for k, v in c.items() if k != "name"}
                        context += f"    * Customer: {c_name} | {json.dumps(c_metrics)}\n"
            elif "tenants" in data and isinstance(data["tenants"], list):
                context += "Tenants Data:\n"
                for t in data["tenants"]:
                    context += f"  * Tenant: {t.get('name', 'Unknown')}\n"
                    context += f"    - Inputs: {json.dumps(t.get('inputs', {}))}\n"
                    context += f"    - Outputs: {json.dumps(t.get('outputs', {}))}\n"
                if "totalTowerRevenue" in data:
                    context += f"  Total Tower Revenue: {data['totalTowerRevenue']}\n"
            else:
                context += "Data JSON: " + json.dumps(data) + "\n"
            context += "\n"

            record_count += 1

    return context



def perform_calculation(inputs: dict, outputs: dict) -> dict:
    """
    Performs the core productivity calculation based on input and output dictionaries.
    """
    total_input_value = 0
    valid_inputs = {}
    for key, value in inputs.items():
        try:
            float_value = float(value)
            total_input_value += float_value
            valid_inputs[key] = float_value
        except (ValueError, TypeError):
            print(f"Warning: Could not convert input '{key}' with value '{value}' to a number.")
            continue

    if not outputs:
        return {"error": "Output data is missing."}

    first_output_key = list(outputs.keys())[0]
    output_name_formatted = first_output_key.replace('_', ' ').title()
    try:
        first_output_value = float(outputs[first_output_key])
    except (ValueError, TypeError):
        return {"error": f"Invalid output value: '{outputs[first_output_key]}'."}

    # 1. Calculate Combined Input Productivity
    if total_input_value != 0:
        total_productivity = first_output_value / total_input_value
        total_productivity_text = f"Productivity = {total_productivity:.2f}"
    else:
        total_productivity_text = "Productivity = Cannot divide by zero"

    # 2. Calculate Single Input Productivity
    individual_productivity_results = {}
    if valid_inputs:
        for input_name, input_value in valid_inputs.items():
            if input_value != 0:
                individual_productivity = first_output_value / input_value
                result_text = f"{individual_productivity:.2f}"
            else:
                result_text = "Cannot divide by zero"
            individual_productivity_results[f"{input_name} / {output_name_formatted}"] = result_text

    return {
        "combined_productivity": total_productivity_text,
        "single_productivity": individual_productivity_results,
        "processed_inputs": valid_inputs,
        "processed_outputs": {output_name_formatted: first_output_value}
    }


def get_ai_analysis(calculation_data: dict) -> dict:
    """
    Analyzes a single calculation's data using the Gemini API.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {"error": "API Key is not configured."}

    # Format the data into a string for the prompt
    prompt_data = f"Combined Input Productivity: {calculation_data.get('combined_productivity', 'N/A')}\n"
    prompt_data += f"Targeted Productivity: {calculation_data.get('targeted_productivity', 'N/A')}\n"
    prompt_data += f"Standard Productivity: {calculation_data.get('standard_productivity', 'N/A')}\n"
    prompt_data += "\nInputs Used:\n" + "".join(f"- {n}: {v}\n" for n, v in calculation_data.get('inputs', {}).items())
    prompt_data += "\nOutput Used:\n" + "".join(f"- {n}: {v}\n" for n, v in calculation_data.get('outputs', {}).items())
    prompt_data += "\nSingle Input Productivity Scores:\n" + "".join(f"- {n}: {v}\n" for n, v in calculation_data.get('single_productivity', {}).items())

    system_instruction = """You are an expert productivity analyst. Analyze the provided manufacturing data.
    Your response MUST be structured exactly as follows, using these exact headers in brackets:

    [EFFICIENCY SCORE]
    Provide a single, overall efficiency score as a percentage (e.g., 85%).

    [AI PREDICTION]
    Provide a brief, one or two-sentence prediction about future productivity if current trends continue.

    [TOP INEFFICIENCIES]
    Identify the top 2-3 most significant inefficiencies as a bulleted list.

    [AI PRESCRIPTIONS]
    Provide a bulleted list of 2-3 specific, actionable steps to improve productivity.
    """
    try:
        client = Groq(api_key=api_key)
        response_text = _generate_with_retry(
            client=client,
            model='llama-3.3-70b-versatile',
            messages=[{"role": "user", "content": prompt_data}],
            system_instruction=system_instruction
        )
        ai_text = response_text

        def parse_section(text, start_tag, end_tag):
            try:
                start = text.index(start_tag) + len(start_tag)
                end = text.index(end_tag)
                return text[start:end].strip().replace('* ', '- ')
            except ValueError:
                return f"Section '{start_tag}' not found in AI response."

        ai_text_with_end_tag = ai_text + "\n[END]"
        analysis = {
            "efficiency_score": parse_section(ai_text_with_end_tag, "[EFFICIENCY SCORE]", "[AI PREDICTION]"),
            "ai_prediction": parse_section(ai_text_with_end_tag, "[AI PREDICTION]", "[TOP INEFFICIENCIES]"),
            "top_inefficiencies": parse_section(ai_text_with_end_tag, "[TOP INEFFICIENCIES]", "[AI PRESCRIPTIONS]"),
            "ai_prescriptions": parse_section(ai_text_with_end_tag, "[AI PRESCRIPTIONS]", "[END]"),
        }
        return analysis
    except Exception as e:
        return {"error": f"An error occurred during AI analysis: {e}"}

def format_records_for_ai1(records: dict):
    """
    Create a readable summary of product and flat data records for RAG.
    """
    formatted = []
    if "products" in records:
        formatted.append("🧩 Products:")
        for p in records["products"]:
            name = p.get("name") or f"Product-{p.get('id', 'N/A')}"
            region_str = f" | Region: {p.get('region')}" if p.get('region') else ""
            formatted.append(f"  - {name} | Sector: {p.get('sector', 'N/A')}{region_str} | Description: {p.get('description', 'N/A')}")
    if "data_records" in records:
        formatted.append("\n📊 Historical Data Records:")
        for r in records["data_records"]:
            month = r.get('month', 'N/A')
            data = r.get('data', {})
            if "unit_data" in data or "customer_data" in data:
                from .data_pipeline import parse_legacy_record
                normalised = parse_legacy_record(data)
                params = normalised.get("parameters", {})
                unit_data = normalised.get("unit_data", {})
                customer_data = normalised.get("customer_data", [])
                
                unit_str = ", ".join(f"{k}: {v}" for k, v in unit_data.items())
                cust_summaries = []
                for c in customer_data:
                    c_name = c.get("name", "Unknown")
                    c_metrics = {k: v for k, v in c.items() if k != "name"}
                    cust_summaries.append(f"{c_name}: {json.dumps(c_metrics)}")
                
                formatted.append(
                    f"  - Date: {month} | Tower: {params.get('towerName', 'N/A')} | City: {params.get('city', 'N/A')} | Region: {params.get('region', 'N/A')} | "
                    f"Unit Metrics: [{unit_str}] | Customer Data: [{', '.join(cust_summaries)}]"
                )
            elif "tenants" in data and isinstance(data["tenants"], list):
                tenant_summaries = []
                for t in data["tenants"]:
                    t_name = t.get('name', 'Unknown')
                    t_metrics = {**t.get('inputs', {}), **t.get('outputs', {})}
                    tenant_summaries.append(f"{t_name}: {json.dumps(t_metrics)}")
                formatted.append(f"  - Month: {month} | Tenants: [{', '.join(tenant_summaries)}]")
            else:
                formatted.append(f"  - Month: {month} | Data: {json.dumps(data)}")
    return "\n".join(formatted)


def get_rag_chatbot_response(
    records: dict,
    query: str,
    history: List[dict] = None,
    bot_type: str = "productivity",
    custom_name: str = None,
    custom_persona: str = None
) -> dict:
    """
    Uses Groq (Llama 3.3) to answer questions based on provided records and conversation history.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {"error": "API Key is not configured."}

    records_context = format_records_for_ai1(records)
    
    # Build the display name and persona for system instruction
    bot_display_name = custom_name or "Productix AI"
    bot_persona_suffix = f"Your name is '{bot_display_name}'. {custom_persona}" if custom_persona else f"Your name is '{bot_display_name}'."

    # Role-oriented system instructions
    instructions = {
        "productivity": (
            "You are a helpful Productivity Assistant for the Productix app. "
            "Focus on analyzing productivity data, batch performance, and efficiency. "
            "Answer questions *only* from the given data. If info is missing, say it's not available. "
            "Maintain a professional and helpful tone."
        ),
        "energy": (
            "You are an Energy Specialist Assistant for the Productix app. "
            "Focus on energy consumption, electricity usage, and sustainability metrics. "
            "Help the user understand their energy footprint and identify waste. "
            "Answer questions *only* from the given data. If info is missing, say it's not available."
        ),
        "hr": (
            "You are an HR Analytics Assistant for the Productix app. "
            "Focus on human resources, personnel performance, shift management, and workforce efficiency. "
            "Ensure a professional tone and maintain data privacy standards. "
            "Answer questions *only* from the given data. If info is missing, say it's not available."
        ),
        "process": (
            "You are a Process Optimization Assistant for the Productix app. "
            "Focus on manufacturing processes, workflow bottlenecks, and operational improvements. "
            "Help the user optimize their production stages. "
            "Answer questions *only* from the given data. If info is missing, say it's not available."
        )
    }

    system_instruction = instructions.get(bot_type, instructions["productivity"])
    # Inject custom persona at the end of the system instruction
    system_instruction = f"{bot_persona_suffix} " + system_instruction
    
    rag_context = f"Context Data (ONLY use this for factual answers):\n{records_context}"
    messages = []
    if history:
        for msg in history:
            role = "user" if msg.get("role") == "user" else "assistant"
            messages.append({"role": role, "content": msg.get("content", "")})
    messages.append({"role": "user", "content": f"{rag_context}\n\nUser Question: {query}"})

    try:
        client = Groq(api_key=api_key)
        response_text = _generate_with_retry(
            client=client,
            model="llama-3.3-70b-versatile",
            messages=messages,
            system_instruction=system_instruction
        )
        return {"response": response_text}
    except Exception as e:
        return {"error": f"Chatbot error: {e}"}


def get_ai_agent_report(records: dict, goal: str) -> dict:
    """
    Performs a multi-step analysis of records to generate a report.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key: return {"error": "GROQ_API_KEY is not configured."}

    records_context = _format_records_for_ai(records)

    try:
        client = Groq(api_key=api_key)

        # Step 1: Create a plan
        plan_prompt = f"Based on the user goal '{goal}' and the following data, create a step-by-step plan to analyze the data.\n\nData:\n{records_context}"
        plan = _generate_with_retry(
            client=client,
            model='llama-3.3-70b-versatile',
            messages=[{"role": "user", "content": plan_prompt}]
        )

        # Step 2: Execute the plan and generate the report
        report_prompt = f"Execute the following plan using the provided data to achieve the user's goal '{goal}'. Generate a detailed report of your findings, citing specific data points.\n\nPlan:\n{plan}\n\nData:\n{records_context}"
        report = _generate_with_retry(
            client=client,
            model='llama-3.3-70b-versatile',
            messages=[{"role": "user", "content": report_prompt}]
        )

        return {"plan": plan, "report": report}
    except Exception as e:
        print(f"❌ ERROR in get_ai_agent_report: {e}")
        import traceback
        traceback.print_exc()
        return {"error": f"An error occurred in the AI agent: {e}"}


# -----------------------------
# AI Analysis for single record
# -----------------------------

def ai_analysis_for_record(record: ProductDataRecord):
    """
    Analyzes a single ProductDataRecord JSON blob.
    Uses heuristic mapping to identify inputs/outputs.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {"error": "GROQ_API_KEY is missing."}

    data_dict = record.data or {}
    output_keywords = ["revenue", "sales", "traffic", "capacity", "units", "produced"]
    
    inputs = {}
    outputs = {}
    
    def process_kv_ai(k, v, is_explicit_input=None):
        try: val = float(v)
        except: return
        k_lower = k.lower()
        is_output = False
        if is_explicit_input is False: is_output = True
        elif is_explicit_input is True: is_output = False
        else: is_output = any(kw in k_lower for kw in output_keywords)
        
        if is_output: outputs[k] = outputs.get(k, 0.0) + val
        else: inputs[k] = inputs.get(k, 0.0) + val

    if "tenants" in data_dict and isinstance(data_dict["tenants"], list):
        for t in data_dict["tenants"]:
            for k, v in t.get("inputs", {}).items(): process_kv_ai(k, v, is_explicit_input=True)
            for k, v in t.get("outputs", {}).items(): process_kv_ai(k, v, is_explicit_input=False)
    else:
        for k, v in data_dict.items():
            process_kv_ai(k, v, is_explicit_input=None)

    prompt = f"""
You are a senior business analyst. Analyze this production record for the month {record.month}:
Data Record: {json.dumps(data_dict, indent=2)}

Mapped Inputs: {json.dumps(inputs)}
Mapped Outputs: {json.dumps(outputs)}

Please provide a JSON analysis with:
1. predicted_output_next_period: (number) 
2. top_3_inefficiencies: (array of {{source, explanation}}) 
3. top_inefficiency_scores: (array of numbers 0-100)
4. ai_recommendations: (array of 3 strings)

Format your response as valid JSON only.
"""

    client = Groq(api_key=api_key)
    try:
        response_text = _generate_with_retry(
            client=client,
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}]
        )
        match = re.search(r'\{.*\}', response_text.strip(), re.DOTALL)
        if match:
            return json.loads(match.group(0))
        return {"error": "No JSON found in AI response"}
    except Exception as e:
        return {"error": str(e)}

def ai_analysis_for_batch(batch: Batch, shift_entries: List[ShiftEntry]):
    """
    Analyzes all shift entries under a Batch.
    Summarizes total cost, total output, and calls LLM to generate recommendations.
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {"error": "GROQ_API_KEY is missing."}

    # Aggregate inputs and outputs from all shift entries
    total_cost = 0.0
    total_output = 0.0
    inputs_agg = {}
    outputs_agg = {}

    for entry in shift_entries:
        total_cost += entry.total_cost
        total_output += entry.output_units
        
        # Merge individual input details
        for name, detail in (entry.input_materials or {}).items():
            if isinstance(detail, dict) and "amount" in detail:
                inputs_agg[name] = inputs_agg.get(name, 0.0) + float(detail["amount"])

        # Merge individual output details
        for name, detail in (entry.output_products or {}).items():
            if isinstance(detail, dict) and "amount" in detail:
                outputs_agg[name] = outputs_agg.get(name, 0.0) + float(detail["amount"])

    # Calculate overall productivity
    productivity_ratio = (total_output / total_cost) if total_cost > 0 else 0.0

    prompt = f"""
You are a senior business analyst. Analyze this manufacturing batch:
Batch Number: {batch.batch_number}
Status: {batch.status.value if hasattr(batch.status, 'value') else batch.status}
Start Date: {batch.start_date}
End Date: {batch.end_date}

Aggregated Inputs: {json.dumps(inputs_agg)}
Aggregated Outputs: {json.dumps(outputs_agg)}
Total Cost: {total_cost}
Total Output: {total_output}
Productivity Ratio (Output / Cost): {productivity_ratio:.4f}

Please provide a JSON analysis with:
1. predicted_output_next_period: (number) 
2. top_3_inefficiencies: (array of {{source, explanation}}) 
3. top_inefficiency_scores: (array of numbers 0-100)
4. ai_recommendations: (array of 3 strings)

Format your response as valid JSON only.
"""

    client = Groq(api_key=api_key)
    try:
        response_text = _generate_with_retry(
            client=client,
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}]
        )
        match = re.search(r'\{.*\}', response_text.strip(), re.DOTALL)
        if match:
            return json.loads(match.group(0))
        return {"error": "No JSON found in AI response"}
    except Exception as e:
        return {"error": str(e)}


def rag_chat_response(db: Session, organization_id: int, query: str):
    """
    Updated RAG Chatbot using flat records.
    """
    products = db.query(Product).filter(Product.organization_id == organization_id).all()
    records = db.query(ProductDataRecord).filter(ProductDataRecord.organization_id == organization_id).order_by(ProductDataRecord.created_at.desc()).limit(20).all()

    context = f"Organization ID: {organization_id}\n\n"
    context += "PRODUCTS:\n" + "\n".join([f"- {p.name} ({p.sector})" for p in products]) + "\n\n"
    context += "DATA RECORDS:\n"
    for r in records:
        context += f"- {r.month} | Product: {r.product.name if r.product else 'Unknown'} | Data: {json.dumps(r.data)}\n"

    prompt = f"Use this data to answer the user query: {query}\n\nContext Data:\n{context}"
    
    api_key = os.getenv("GROQ_API_KEY")
    client = Groq(api_key=api_key)
    response_text = _generate_with_retry(
        client=client,
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}]
    )
    return {"response": {"text": response_text}}
