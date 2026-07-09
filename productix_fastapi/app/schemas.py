from pydantic import BaseModel
from typing import Any, Dict, Optional, List, Union
from decimal import Decimal
from datetime import datetime,date
from .models import UserRole


# Login / Auth Schemas
# -------------------
class LoginSchema(BaseModel):
    email: str
    password: str


class TokenSchema(BaseModel):
    access_token: str
    token_type: str = "bearer"
    requires_password_change: bool = False
# ------------------------
# AUTH
# ------------------------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    id: int
    role: UserRole
    organization_id: Optional[int]


class UserLogin(BaseModel):
    email: str
    password: str


# ------------------------
# USER
# ------------------------
class UserBase(BaseModel):
    name: Optional[str] = None
    email: str


class UserCreate(UserBase):
    password: str
    role: UserRole = UserRole.org_user


class UserResponse(UserBase):
    id: int
    role: UserRole
    organization_id: int
    is_active: bool
    chatbot_name: Optional[str] = "Productix AI"
    chatbot_persona: Optional[str] = "a helpful AI assistant specialized in operational productivity analysis"
    analysis_goals: Optional[List[str]] = []
    created_at: datetime

    class Config:
        from_attributes = True


# ------------------------
# ORGANIZATION
# ------------------------
class OrganizationBase(BaseModel):
    name: str
    subscription_plan: Optional[str] = "free"
    column_mappings: Optional[Dict[str, str]] = {}
    user_limit: Optional[int] = 5


class OrganizationCreate(OrganizationBase):
    pass


class ColumnRenameRequest(BaseModel):
    canonical_name: str
    new_display_name: str


class SubscriptionResponse(BaseModel):
    id: int
    plan_name: str
    status: str
    start_date: datetime
    end_date: Optional[datetime] = None

    class Config:
        from_attributes = True


class SubscriptionTimerUpdate(BaseModel):
    days: int


class OrganizationResponse(OrganizationBase):
    id: int
    status: str
    created_at: datetime
    subscription: Optional[SubscriptionResponse] = None

    class Config:
        from_attributes = True

# ------------------------
# PRODUCT
# ------------------------
class ProductBase(BaseModel):
    name: str
    description: Optional[str] = None
    input_fields: Optional[List[str]] = []  # New field for dynamic input fields
    output_fields: Optional[List[str]] = []
    sector: Optional[str] = "Telecom"
    region: Optional[str] = None
    organization_id: Optional[int] = None
    location: Optional[str] = "Urban"
    customers: Optional[List[str]] = []
    unit_vars: Optional[List[str]] = []
    customer_vars: Optional[List[str]] = []


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sector: Optional[str] = "Telecom"
    region: Optional[str] = None
    location: Optional[str] = None
    customers: Optional[List[str]] = None
    unit_vars: Optional[List[str]] = None
    customer_vars: Optional[List[str]] = None


class ProductResponse(ProductBase):
    id: int
    organization_id: int
    created_at: Optional[datetime] = None 

    class Config:
        from_attributes = True


# ------------------------
# BATCH
# ------------------------
class ProductOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True

class BatchBase(BaseModel):
    batch_number: Optional[str] = None

class BatchCreate(BatchBase):
    product_id: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = "open"

class BatchUpdate(BaseModel):
    batch_number: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = "open"

class BatchResponse(BatchBase):
    id: int
    product_id: int
    batch_number: str
    start_date: Optional[date]
    end_date: Optional[date] = None
    status: str
    product: ProductOut  # Include product info for frontend
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class BatchReportResponse(BaseModel):
    batch_id: int
    batch_no: str
    product_id: int
    status: str

    # ✅ Totals (combined inputs + outputs)
    totals: Dict[str, Union[int, float]]

    # ✅ Cost and output metrics
    total_input_cost: float
    total_output: float
    input_cost_per_unit: float

    # ✅ Productivity per input (input used per unit of output)
    Combined_productivity_ratio: float

    # ⚠️ New field: inputs missing unit price
    missing_unit_prices: Optional[List[str]] = []
    per_input_stats: dict[str, dict]

    class Config:
        from_attributes = True





class InputMaterial(BaseModel):
    amount: float
    unit_price: Optional[float] = None

# Each output product only has amount
class OutputProduct(BaseModel):
    amount: float

# Base schema for shift entry
class ShiftEntryBase(BaseModel):
    batch_id: int
    date: date
    shift_no: str  # morning, evening, night

    input_materials: Optional[Dict[str, InputMaterial]] = None  # {field_name: {amount, unit_price}}
    output_products: Optional[Dict[str, OutputProduct]] = None  # {field_name: {amount}}
    admin_notes: Optional[str] = None

    class Config:
        from_attributes = True

# Schema for creating a shift entry
class ShiftEntryCreate(ShiftEntryBase):
    pass

# Schema for updating a shift entry
class ShiftEntryUpdate(ShiftEntryBase):
    pass

# Schema for returning shift entry
class ShiftEntryOut(ShiftEntryBase):
    id: int
    organization_id: int
    created_at: datetime


# ------------------------
# PRODUCTIVITY CALCULATION
# ------------------------

class ProductivityCalculationCreate(BaseModel):
    inputs: Dict[str, float]
    outputs: Dict[str, float]
    
class ProductivityCalculationResponse(BaseModel):
    id: int
    organization_id: int
    user_id: int
    processed_inputs: Dict[str, float]
    processed_outputs: Dict[str, float]
    combined_productivity: str
    single_productivity: Dict[str, float]

    class Config:
        from_attributes = True


# ------------------------
# AI ANALYSIS   
# ------------------------
class AIAnalysisCreate(BaseModel):
    inputs: Dict[str, float]   # e.g., {"Electricity Consumption": 49}
    outputs: Dict[str, float]  # e.g., {"Good Units Produced": 30}
    combined_productivity: Dict[str, float]   # e.g., {"overall": 50}
    single_productivity: Dict[str, float]     # e.g., {"Electricity / Good Units Produced": 10}
    targeted_productivity: Optional[Dict[str, float]] = None
    standard_productivity: Optional[Dict[str, float]] = None


class AIAnalysisResponse(BaseModel):
    id: int
    organization_id: int
    user_id: int
    request_data: Dict
    efficiency_score: Optional[str]  # returning '58.1%' as string
    ai_prediction: Optional[str]     # returning a raw text string
    top_inefficiencies: Optional[str]  # returning multi-line string
    ai_prescriptions: Optional[str]    # returning multi-line string
    created_at: datetime                   # returning ISO string

    class Config:
        from_attributes = True
        

# ------------------------
# CHATBOT   
# ------------------------

class ChatbotRequest(BaseModel):
    records: List[Dict]
    query: str
    
class ChatbotResponse(BaseModel):
    query: str
    response: Union[str, Dict[str, Any]]

    class Config:
        from_attributes = True
class ChatbotHistoryResponse(BaseModel):
    id: int
    organization_id: int
    user_id: int
    records: List[Dict]
    query: str
    response: Dict
    created_at: str

    class Config:
        from_attributes = True

# ------------------------
# CUSTOM CHATBOT (Task 8 & 7)
# ------------------------
class CustomChatbotCreate(BaseModel):
    user_id: int
    name: str
    description: Optional[str] = None
    goals: Optional[List[str]] = []

class CustomChatbotResponse(BaseModel):
    id: int
    organization_id: int
    user_id: int
    name: str
    description: Optional[str] = None
    goals: Optional[List[str]] = []
    created_at: datetime

    class Config:
        from_attributes = True

# ------------------------
# AI AGENT





## ------------------------

class ProductRecord(BaseModel):
    calculation_id: int
    date: Optional[str] = None  # ISO format string
    inputs: Dict[str, Any]      # Flexible: depends on your processed_inputs structure
    outputs: Dict[str, Any]     # Flexible: depends on processed_outputs
    combined_productivity: Optional[float] = None
    single_productivity: Dict[str, Optional[float]]
from pydantic import RootModel
class ProductivityRecordsResponse(RootModel):
    root: Dict[str, List[ProductRecord]]




class AnalysisCountResponse(BaseModel):
    analysis_count: int

class AgentRequest(BaseModel):
    records: Dict[str, List[ProductRecord]]  # List of product records
    goal: str

class AIText(BaseModel):
    text: str  # Wrap AI string in a dict

class AIReportResponse(BaseModel):
    id: int
    organization_id: int
    user_id: int
    goal: str
    plan: dict   # {"text": str}
    report: dict # {"text": str}
    records_used: Optional[Any] = None
    created_at: str
    class Config:
        from_attributes = True


class AggregationDataPoint(BaseModel):
    label: str
    inputs: Dict[str, float]
    outputs: Dict[str, float]
    productivity: Optional[float] = None

class AggregationResponse(BaseModel):
    granularity: str
    data: List[AggregationDataPoint]


# ------------------------
# PRODUCT DATA RECORDS (flat model)
# ------------------------
class ProductDataRecordCreate(BaseModel):
    product_id: int
    month: str
    data: Dict[str, Any]  # {"Grid_kWh": 5200, "DG_RunHours": 133, ...}


class ProductDataRecordResponse(BaseModel):
    id: int
    organization_id: int
    product_id: int
    month: str
    data: Dict[str, Any]
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ------------------------
# FORMULA BUILDER
# ------------------------

class FormulaCreate(BaseModel):
    formula_name: str
    formula_template: str  # ratio|percentage|total|difference|product|cost_per_unit|margin|average
    selected_columns: List[str]
    source_table: str      # tower_expenses|tower_revenue|both
    expression_string: str
    output_type: str = "number"  # number|currency|percentage
    target_column: Optional[str] = None  # which fixed column this formula fills (e.g. "Total Revenue")


class FormulaUpdate(BaseModel):
    formula_name: Optional[str] = None
    formula_template: Optional[str] = None
    selected_columns: Optional[List[str]] = None
    source_table: Optional[str] = None
    expression_string: Optional[str] = None
    output_type: Optional[str] = None
    target_column: Optional[str] = None  # which fixed column this formula fills


class FormulaResponse(BaseModel):
    id: int
    organization_id: int
    created_by: int
    formula_name: str
    formula_template: str
    selected_columns: List[str]
    source_table: str
    expression_string: str
    output_type: str
    target_column: Optional[str] = None  # which fixed column this formula fills
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FormulaEvaluateRequest(BaseModel):
    formula_id: int
    tower_id: Optional[str] = None
    city: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class FormulaEvaluateResult(BaseModel):
    formula_id: int
    formula_name: str
    expression_string: str
    output_type: str
    result: Optional[float] = None
    formatted: str
    row_count: int
    valid_count: int
    avg: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    latest: Optional[float] = None


class ColumnMeta(BaseModel):
    name: str
    type: str        # text|date|number|currency|percent
    eligible: bool   # can it be used in formulas?
    table: str       # tower_expenses|tower_revenue


class ColumnsResponse(BaseModel):
    tower_expenses: List[ColumnMeta]
    tower_revenue: List[ColumnMeta]


# ------------------------
# ALERT NOTIFICATIONS
# ------------------------
class AlertBase(BaseModel):
    alert_type: str  # validation_error, data_quality, threshold_breach, logical_error
    severity: str  # critical, warning, info
    title: str
    message: str
    entity_type: Optional[str] = None  # shift_entry, data_record, product, batch
    entity_id: Optional[int] = None
    data_context: Optional[Dict[str, Any]] = None


class AlertCreate(AlertBase):
    user_id: Optional[int] = None


class AlertUpdate(BaseModel):
    is_dismissed: bool = True


class AlertResponse(AlertBase):
    id: int
    organization_id: int
    user_id: Optional[int] = None
    is_dismissed: bool
    dismissed_at: Optional[datetime] = None
    dismissed_by: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ValidationResult(BaseModel):
    is_valid: bool
    alerts: List[AlertCreate] = []
    warnings: List[str] = []


# Filter schemas and Bulk upload/save schemas
class FilterParams(BaseModel):
    tower_id: Optional[Union[int, str]] = None
    tower_name: Optional[str] = None
    date_start: Optional[str] = None
    date_end: Optional[str] = None
    region: Optional[str] = None
    recency_days: Optional[int] = None
    recency_limit: Optional[int] = None
    sort_order: Optional[str] = "desc"


class ChatbotFilteredRequest(BaseModel):
    query: str
    bot_type: Optional[str] = "productivity"
    filters: Optional[FilterParams] = None


class BulkDataRecordCreate(BaseModel):
    tower_id: int
    tower_name: str
    city: Optional[str] = ""
    region: Optional[str] = ""
    unit_rows: List[Dict[str, Any]]
    customer_rows: List[Dict[str, Any]]
    col_map: Optional[Dict[str, str]] = None


# ------------------------
# KPI DEFINITIONS & SNAPSHOTS
# ------------------------
class KPIDefinitionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: str = "operational"
    unit: str = "%"
    computation_type: str  # built_in | formula
    built_in_key: Optional[str] = None
    formula_id: Optional[int] = None
    target_value: Optional[float] = None
    warning_threshold: Optional[float] = None
    critical_threshold: Optional[float] = None
    higher_is_better: bool = True
    granularity: str = "monthly"
    product_id: Optional[int] = None


class KPIDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    target_value: Optional[float] = None
    warning_threshold: Optional[float] = None
    critical_threshold: Optional[float] = None
    higher_is_better: Optional[bool] = None
    is_active: Optional[bool] = None


class KPIDefinitionResponse(BaseModel):
    id: int
    organization_id: int
    name: str
    description: Optional[str] = None
    category: str
    unit: str
    computation_type: str
    built_in_key: Optional[str] = None
    formula_id: Optional[int] = None
    target_value: Optional[float] = None
    warning_threshold: Optional[float] = None
    critical_threshold: Optional[float] = None
    higher_is_better: bool
    granularity: str
    product_id: Optional[int] = None
    is_active: bool
    created_at: Optional[datetime] = None
    # Enriched from latest snapshot
    current_value: Optional[float] = None
    current_status: Optional[str] = None
    current_trend: Optional[str] = None
    change_pct: Optional[float] = None

    class Config:
        from_attributes = True


class KPISnapshotResponse(BaseModel):
    id: int
    kpi_id: int
    period: str
    value: Optional[float] = None
    target_value: Optional[float] = None
    status: str
    trend: Optional[str] = None
    previous_value: Optional[float] = None
    change_pct: Optional[float] = None
    computed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

