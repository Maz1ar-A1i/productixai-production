# app/models.py

from decimal import Decimal
from sqlalchemy import (
    Column, Integer, String, Date, Enum, ForeignKey, DECIMAL,
    TIMESTAMP, Boolean, DateTime, func, Text, JSON, Numeric, TypeDecorator
)
from sqlalchemy.orm import relationship
from .database import Base
import enum
from datetime import datetime
from pydantic import BaseModel


# ------------------------
# Enums
# ------------------------
class ShiftEnum(enum.Enum):
    morning = "Morning"
    evening = "Evening"
    night = "Night"


class UserRole(str, enum.Enum):
    system_admin = "system_admin"   # You (super admin)
    org_admin = "org_admin"         # Organization-level admin
    org_user = "org_user"           # Normal employee/user


class BatchStatus(enum.Enum):
    open = "open"
    closed = "closed"


# -------------------
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
# Organization (Tenant)
# ------------------------
class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    subscription_plan = Column(String(50), default="free")
    status = Column(String(50), default="active")
    column_mappings = Column(JSON, default={})
    user_limit = Column(Integer, default=5, nullable=False)
    chatbot_name = Column(String(100), default="Productix AI", nullable=True)
    chatbot_persona = Column(Text, default="a helpful AI assistant specialized in operational productivity analysis", nullable=True)
    analysis_goals = Column(JSON, default=[], nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # relationships
    users = relationship("User", back_populates="organization", cascade="all, delete")
    products = relationship("Product", back_populates="organization", cascade="all, delete")
    batches = relationship("Batch", back_populates="organization", cascade="all, delete")
    shift_entries = relationship("ShiftEntry", back_populates="organization", cascade="all, delete")
    subscription = relationship("Subscription", back_populates="organization", uselist=False, cascade="all, delete")


# ------------------------
# Users
# ------------------------
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.org_user, nullable=False)
    is_verified = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    requires_password_change = Column(Boolean, default=False, nullable=False)
    chatbot_name = Column(String(100), default="Productix AI", nullable=True)
    chatbot_persona = Column(Text, default="a helpful AI assistant specialized in operational productivity analysis", nullable=True)
    analysis_goals = Column(JSON, default=[], nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization", back_populates="users")
    productivity_calculations = relationship("ProductivityCalculation", back_populates="user")
    ai_analyses = relationship("AIAnalysis", back_populates="user")
    chatbot_history = relationship("ChatbotHistory", back_populates="user")
    ai_reports = relationship("AIReport", back_populates="user")


# ------------------------
# Subscription
# ------------------------
class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    plan_name = Column(String, nullable=False)   # e.g. Free, Pro, Enterprise
    status = Column(String, default="active")    # active, trial, cancelled
    start_date = Column(DateTime, default=datetime.utcnow)
    end_date = Column(DateTime)

    organization = relationship("Organization", back_populates="subscription")


# ------------------------
# Invitations
# ------------------------
class Invitation(Base):
    __tablename__ = "invitations"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    email = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.org_user)
    token = Column(String, unique=True, nullable=False)   # secure token for signup
    expires_at = Column(DateTime, nullable=False)
    accepted = Column(Boolean, default=False)

    organization = relationship("Organization")


# ------------------------
# AI Data / Productivity / Reports
# ------------------------
class AIData(Base):
    __tablename__ = "ai_data"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    data_json = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProductivityCalculation(Base):
    __tablename__ = "productivity_calculations"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    combined_productivity = Column(String, nullable=False)
    single_productivity = Column(JSON, nullable=False)
    processed_inputs = Column(JSON, nullable=False)
    processed_outputs = Column(JSON, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="productivity_calculations")


class AIAnalysis(Base):
    __tablename__ = "ai_analysis"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    efficiency_score = Column(String)
    ai_prediction = Column(Text)
    top_inefficiencies = Column(Text)
    ai_prescriptions = Column(Text)
    request_data = Column(JSON, nullable=False)

    combined_productivity = Column(String)
    targeted_productivity = Column(String)
    standard_productivity = Column(String)
    inputs = Column(JSON)
    outputs = Column(JSON)
    single_productivity = Column(JSON)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="ai_analyses")


class ChatbotHistory(Base):
    __tablename__ = "chatbot_history"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    query = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    records = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="chatbot_history")


class AIReport(Base):
    __tablename__ = "ai_reports"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    goal = Column(Text, nullable=False)
    plan = Column(Text, nullable=False)
    report = Column(Text, nullable=False)
    records_used = Column(JSON, nullable=True)
    request_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="ai_reports")


# ------------------------
# Products & Batches
# ------------------------
class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String)

    # Dynamic fields
    input_fields = Column(JSON, default=[])
    output_fields = Column(JSON, default=[])
    sector = Column(String, default="Telecom")
    region = Column(String, nullable=True)
    location = Column(String, default="Urban")
    customers = Column(JSON, default=[])
    unit_vars = Column(JSON, default=[])
    customer_vars = Column(JSON, default=[])

    organization = relationship("Organization", back_populates="products")

    batches = relationship(
        "Batch",
        back_populates="product",
        cascade="all, delete-orphan"
    )

    data_records = relationship(
        "ProductDataRecord",
        back_populates="product",
        cascade="all, delete-orphan"
    )


class Batch(Base):
    __tablename__ = "batches"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_number = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date)
    status = Column(Enum(BatchStatus), default=BatchStatus.open)

    organization = relationship("Organization", back_populates="batches")
    product = relationship("Product", back_populates="batches")
    shift_entries = relationship("ShiftEntry", back_populates="batch")


# ------------------------
# Shift Entries
# ------------------------
class JSONDecimal(TypeDecorator):
    impl = JSON

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        return self._convert_decimals(value)

    def _convert_decimals(self, obj):
        if isinstance(obj, list):
            return [self._convert_decimals(i) for i in obj]
        elif isinstance(obj, dict):
            return {k: self._convert_decimals(v) for k, v in obj.items()}
        elif isinstance(obj, Decimal):
            return float(obj)
        else:
            return obj

    def process_result_value(self, value, dialect):
        return value


class ShiftEntry(Base):
    __tablename__ = "shift_entries"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    date = Column(Date, nullable=False)
    shift_no = Column(String, nullable=False)  # morning, evening, night

    # New structure for product inputs and outputs
    input_materials = Column(JSONDecimal, nullable=True)  # {field_name: {amount, unit_price}}
    output_products = Column(JSONDecimal, nullable=True)  # {field_name: {amount}}

    admin_notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    organization = relationship("Organization", back_populates="shift_entries")
    batch = relationship("Batch", back_populates="shift_entries")

    @property
    def total_cost(self) -> float:
        cost = 0.0
        inputs = self.input_materials or {}
        for v in inputs.values():
            if isinstance(v, dict) and "amount" in v and "unit_price" in v:
                cost += float(v.get("amount") or 0) * float(v.get("unit_price") or 0)
        return cost

    @property
    def output_units(self) -> float:
        units = 0.0
        outputs = self.output_products or {}
        for v in outputs.values():
            if isinstance(v, dict) and "amount" in v:
                units += float(v.get("amount") or 0)
        return units

# ------------------------
# Product Data Records (flat model replacing Batch+ShiftEntry)
# ------------------------
class ProductDataRecord(Base):
    __tablename__ = "product_data_records"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    month = Column(String(50), nullable=False)   # e.g. "Jan", "Feb", "2024-01"
    data = Column(JSON, default={})              # {"Grid_kWh": 5200, "DG_RunHours": 133, ...}
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization")
    product = relationship("Product", back_populates="data_records")


# ------------------------
# Productivity Calculations




# ------------------------
# Chatbot History
# ------------------------





# ------------------------
# Formula Records (Formula Builder Module)
# ------------------------
class FormulaRecord(Base):
    __tablename__ = "formula_records"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    formula_name = Column(String(255), nullable=False)
    formula_template = Column(String(50), nullable=False)  # ratio|percentage|total|difference|product|cost_per_unit|margin|average
    selected_columns = Column(JSON, default=[])             # ordered list of column name strings
    source_table = Column(String(50), nullable=False)       # tower_expenses|tower_revenue|both
    expression_string = Column(Text, nullable=False)        # e.g. "[KW Sold] / [Total Capacity (KW)] * 100"
    output_type = Column(String(20), default="number")      # number|currency|percentage
    target_column = Column(String(255), nullable=True)       # which column in data record this formula fills
    is_active = Column(Boolean, default=True)               # soft delete flag
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization")
    created_by_user = relationship("User", foreign_keys=[created_by])


# ------------------------
# KPI Definitions & Snapshots
# ------------------------
class KPIDefinition(Base):
    """Org-admin defined KPI with target/threshold configuration."""
    __tablename__ = "kpi_definitions"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), default="operational")   # operational|financial|trend|custom
    unit = Column(String(20), default="%")                  # %, PKR, units, ratio

    # Computation source
    computation_type = Column(String(50), nullable=False)   # built_in | formula
    built_in_key = Column(String(100), nullable=True)       # e.g. "capacity_utilization"
    formula_id = Column(Integer, ForeignKey("formula_records.id"), nullable=True)

    # Targets & Thresholds
    target_value = Column(Numeric, nullable=True)
    warning_threshold = Column(Numeric, nullable=True)
    critical_threshold = Column(Numeric, nullable=True)
    higher_is_better = Column(Boolean, default=True)

    # Scope
    granularity = Column(String(20), default="monthly")     # daily|weekly|monthly
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    organization = relationship("Organization")
    created_by_user = relationship("User", foreign_keys=[created_by])
    formula = relationship("FormulaRecord", foreign_keys=[formula_id])
    product = relationship("Product", foreign_keys=[product_id])
    snapshots = relationship("KPISnapshot", back_populates="kpi_definition", cascade="all, delete-orphan")


class KPISnapshot(Base):
    """Historical KPI value computed at a specific period."""
    __tablename__ = "kpi_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    kpi_id = Column(Integer, ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)

    period = Column(String(50), nullable=False)          # "2026-05", "2026-W21", "2026-05-25"
    value = Column(Numeric, nullable=True)
    target_value = Column(Numeric, nullable=True)
    status = Column(String(20), default="on_track")      # on_track|warning|critical|no_data
    trend = Column(String(10), nullable=True)             # up|down|stable
    previous_value = Column(Numeric, nullable=True)
    change_pct = Column(Numeric, nullable=True)

    computed_at = Column(DateTime(timezone=True), server_default=func.now())

    kpi_definition = relationship("KPIDefinition", back_populates="snapshots")
    organization = relationship("Organization")


class UserProductAssignment(Base):
    """Junction table linking users to products (units) they are assigned to manage."""
    __tablename__ = "user_product_assignments"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)

    user = relationship("User")
    product = relationship("Product")


class Alert(Base):
    """System and validation alerts generated for organizations and users."""
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    alert_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(Integer, nullable=True)
    data_context = Column(JSON, nullable=True)
    is_dismissed = Column(Boolean, default=False)
    dismissed_at = Column(DateTime, nullable=True)
    dismissed_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")
    user = relationship("User", foreign_keys=[user_id])
    dismissed_by_user = relationship("User", foreign_keys=[dismissed_by])


# ------------------------
# Licensing
# ------------------------
class License(Base):
    __tablename__ = "licenses"

    id = Column(Integer, primary_key=True, index=True)
    license_key = Column(String(255), unique=True, index=True, nullable=False)
    account_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    role = Column(String(50), nullable=False)  # "global_admin" or "org_admin"
    status = Column(String(50), default="active", nullable=False)  # "active", "revoked", "expired"
    expires_at = Column(DateTime, nullable=True)  # Null for global_admin
    # OTP Machine-Lock: records the first machine that claimed this key (NULL = unbound/fresh)
    bound_machine_id = Column(String(255), nullable=True, default=None)
    first_used_at = Column(DateTime, nullable=True, default=None)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", foreign_keys=[account_id])
    organization = relationship("Organization", foreign_keys=[organization_id])


class CustomChatbot(Base):
    __tablename__ = "custom_chatbots"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    goals = Column(JSON, default=[], nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    organization = relationship("Organization")
    user = relationship("User", foreign_keys=[user_id])

