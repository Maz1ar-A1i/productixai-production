import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path

# Define database location
if getattr(sys, 'frozen', False):
    # Running as EXE (Production)
    # Portable mode: database is next to the executable
    base_dir = Path(sys.executable).parent.resolve()
    base_dir.mkdir(parents=True, exist_ok=True)
    db_path = (base_dir / "productix.db").resolve()
else:
    # Running in development
    # Stay relative to the project structure
    db_path = Path(__file__).parent.parent.resolve() / "productix.db"

# For SQLite absolute paths on Windows, sqlite:/// followed by path is standard, 
# but we ensure the path is stringified and resolved.
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{str(db_path)}")

if DATABASE_URL.startswith("postgres://"):
    # SQLAlchemy requires postgresql:// instead of postgres://
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
    
    # Enable WAL mode for SQLite to prevent "Database is Busy" during concurrent refreshes
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def auto_migrate_db(engine):
    """
    Automatically checks for and adds missing columns to existing tables.
    This prevents 'no such column' errors when an older client database is used
    with a newer version of the application.
    """
    # Auto-migration logic is SQLite specific (for local client DB updates)
    if not engine.url.drivername.startswith("sqlite"):
        return

    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    
    # Define known columns that might be missing in older databases
    migrations = {
        "users": [
            ("is_active", "BOOLEAN DEFAULT 1"),
            ("is_verified", "BOOLEAN DEFAULT 1"),
            ("requires_password_change", "BOOLEAN DEFAULT 0"),
            ("chatbot_name", "VARCHAR(100) DEFAULT 'Productix AI'"),
            ("chatbot_persona", "TEXT NULL"),
            ("analysis_goals", "JSON NULL")
        ],
        "organizations": [
            ("column_mappings", "JSON NULL"),
            ("user_limit", "INTEGER DEFAULT 5"),
            ("chatbot_name", "VARCHAR(100) DEFAULT 'Productix AI'"),
            ("chatbot_persona", "TEXT NULL"),
            ("analysis_goals", "JSON NULL")
        ],
        "products": [
            ("sector", "VARCHAR DEFAULT 'Telecom'"),
            ("region", "VARCHAR NULL"),
            ("location", "VARCHAR DEFAULT 'Urban'"),
            ("customers", "JSON NULL"),
            ("unit_vars", "JSON NULL"),
            ("customer_vars", "JSON NULL")
        ],
        "formula_records": [
            ("target_column", "VARCHAR(255) NULL"),
            ("product_id", "INTEGER NULL")
        ],
        "kpi_definitions": [
            ("product_id", "INTEGER NULL"),
            ("granularity", "VARCHAR(20) DEFAULT 'monthly'")
        ]
    }
    
    with engine.begin() as conn:
        for table, columns in migrations.items():
            if inspector.has_table(table):
                existing_columns = [col['name'] for col in inspector.get_columns(table)]
                for col_name, col_def in columns:
                    if col_name not in existing_columns:
                        try:
                            stmt = f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"
                            conn.execute(text(stmt))
                            print(f"[*] Auto-migrated schema: added {table}.{col_name}")
                        except Exception as e:
                            print(f"[!] Failed to auto-migrate {table}.{col_name}: {e}")

