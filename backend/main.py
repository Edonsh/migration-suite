from pathlib import Path
import time
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from databricks.sdk import WorkspaceClient

from .migration_engine.snowflake_client import (
    discover_snowflake_tables,
    extract_and_stage_parquet,
    get_table_details,
    test_snowflake_connection,
)
from .migration_engine.databricks_client import (
    ensure_unity_catalog_hierarchy,
    upload_parquet_to_volume,
    load_via_copy_into,
    execute_sql,
)
from .migration_engine.validator import validate_migrated_tables
from .migration_engine.config import (
    build_databricks_config,
    build_snowflake_config,
    validate_databricks_env_vars,
    validate_snowflake_env_vars,
    SNOWFLAKE_CONFIG,
    DATABRICKS_WAREHOUSE_ID,
    VOLUME_CATALOG,
    VOLUME_SCHEMA,
    VOLUME_NAME,
    STAGING_VOLUME_PATH,
    ENVIRONMENT,
    LOCAL_DEV_USER_EMAIL,
    LOCAL_DEV_DISPLAY_NAME,
)

app = FastAPI(title="Snowflake to Databricks Migration Suite API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class CredentialsRequest(BaseModel):
    snowflake_user: str
    snowflake_password: str
    snowflake_account: str
    snowflake_warehouse: str
    snowflake_database: str
    snowflake_schema: str
    snowflake_role: Optional[str] = None

class MigrationRequest(BaseModel):
    selected_tables: List[str]
    creds: Optional[CredentialsRequest] = None

class AnalyzeTableRequest(BaseModel):
    table_name: str
    creds: Optional[CredentialsRequest] = None

class ValidateRequest(BaseModel):
    tables: Optional[List[str]] = None
    creds: Optional[CredentialsRequest] = None

# ─── In-Memory State ──────────────────────────────────────────────────────────

migration_status: Dict[str, Any] = {
    "job_id": None,
    "status": "IDLE",
    "progress": 0,
    "stage": "IDLE",
    "tables_total": 0,
    "tables_completed": 0,
    "tables_failed": 0,
    "start_time": None,
    "end_time": None,
    "duration_seconds": 0,
    "table_progress": {},
    "logs": [],
}

migration_history: List[Dict[str, Any]] = []

def append_log(message: str, level: str = "INFO"):
    timestamp = datetime.now().strftime("%H:%M:%S")
    log_entry = {"time": timestamp, "level": level, "message": message}
    migration_status["logs"].append(log_entry)
    # Keep last 200 logs
    if len(migration_status["logs"]) > 200:
        migration_status["logs"] = migration_status["logs"][-200:]
    print(f"[{timestamp}] [{level}] {message}")

# ─── App Lifecycle ────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    try:
        validate_snowflake_env_vars()
    except ValueError as exc:
        append_log(f"Config notice: {exc}", level="WARN")

# ─── Identity & Health ────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "migration-suite", "env": ENVIRONMENT}

@app.get("/api/identity")
async def get_identity(request: Request):
    """Returns the Databricks-forwarded identity of the currently logged-in user."""
    email = request.headers.get("x-forwarded-email")
    display_name = request.headers.get("x-forwarded-preferred-username")

    if not email and ENVIRONMENT == "local":
        email = LOCAL_DEV_USER_EMAIL
        display_name = LOCAL_DEV_DISPLAY_NAME

    return {"email": email or "", "display_name": display_name or email or ""}

# ─── Connections Endpoints ────────────────────────────────────────────────────

@app.get("/api/connections/status")
async def get_connections_status():
    """Returns current configured connection details (without sensitive passwords)."""
    sf_cfg = {
        "user": SNOWFLAKE_CONFIG.get("user") or "",
        "account": SNOWFLAKE_CONFIG.get("account") or "",
        "warehouse": SNOWFLAKE_CONFIG.get("warehouse") or "",
        "database": SNOWFLAKE_CONFIG.get("database") or "",
        "schema": SNOWFLAKE_CONFIG.get("schema") or "",
        "role": SNOWFLAKE_CONFIG.get("role") or "",
        "configured": bool(SNOWFLAKE_CONFIG.get("user") and SNOWFLAKE_CONFIG.get("account")),
    }
    dbx_cfg = {
        "warehouse_id": DATABRICKS_WAREHOUSE_ID or "",
        "catalog": VOLUME_CATALOG,
        "schema": VOLUME_SCHEMA,
        "volume_name": VOLUME_NAME,
        "staging_volume_path": STAGING_VOLUME_PATH,
        "configured": bool(DATABRICKS_WAREHOUSE_ID),
    }
    return {
        "snowflake": sf_cfg,
        "databricks": dbx_cfg,
        "environment": ENVIRONMENT,
    }

@app.post("/api/connections/test-snowflake")
async def api_test_snowflake(creds: Optional[CredentialsRequest] = None):
    try:
        config = build_snowflake_config(creds)
        result = test_snowflake_connection(config)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/connections/test-databricks")
async def api_test_databricks(creds: Optional[CredentialsRequest] = None):
    try:
        w = WorkspaceClient()
        validate_databricks_env_vars()
        dbx_config = build_databricks_config(creds)
        start_time = time.time()
        res = execute_sql(w, dbx_config["warehouse_id"], "SELECT 1 AS ping_test;")
        latency_ms = round((time.time() - start_time) * 1000, 2)
        state = res.status.state.value if res.status and res.status.state else "UNKNOWN"
        if state == "FAILED":
            error_msg = res.status.error.message if res.status.error else "Warehouse SQL execution failed"
            raise HTTPException(status_code=400, detail=error_msg)
        return {
            "status": "success",
            "result": {
                "status": "connected",
                "latency_ms": latency_ms,
                "warehouse_id": dbx_config["warehouse_id"],
                "state": state
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ─── Tables & Schema Analysis ─────────────────────────────────────────────────

@app.post("/api/connect")
async def connect_sources(creds: CredentialsRequest):
    try:
        config = build_snowflake_config(creds)
        tables = discover_snowflake_tables(config)
        return {"status": "success", "tables": tables}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/tables")
async def get_tables():
    try:
        validate_snowflake_env_vars()
        tables = discover_snowflake_tables()
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze/table")
async def api_analyze_table(req: AnalyzeTableRequest):
    try:
        config = build_snowflake_config(req.creds)
        details = get_table_details(req.table_name, config)
        return {"status": "success", "details": details}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ─── Migration Execution ──────────────────────────────────────────────────────

@app.post("/api/migrate")
async def start_migration(req: MigrationRequest, background_tasks: BackgroundTasks):
    if migration_status["status"] == "RUNNING":
        return {"message": "A migration job is already running", "status_url": "/api/status", "status": "RUNNING"}

    job_id = f"mig_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    migration_status.clear()
    migration_status.update({
        "job_id": job_id,
        "status": "RUNNING",
        "progress": 0,
        "stage": "INITIALIZING",
        "tables_total": len(req.selected_tables),
        "tables_completed": 0,
        "tables_failed": 0,
        "start_time": datetime.now().isoformat(),
        "end_time": None,
        "duration_seconds": 0,
        "selected_tables": req.selected_tables,
        "table_progress": {t: {"status": "PENDING", "stage": "QUEUED", "rows": 0, "duration_seconds": 0} for t in req.selected_tables},
        "logs": [],
    })
    append_log(f"Starting migration job [{job_id}] for {len(req.selected_tables)} table(s)")
    background_tasks.add_task(run_migration_task, job_id, req.selected_tables, req.creds)
    return {"message": "Migration started", "job_id": job_id, "status_url": "/api/status"}

def run_migration_task(job_id: str, selected_tables: List[str], creds: Optional[CredentialsRequest] = None):
    start_ts = time.time()
    try:
        migration_status["stage"] = "PREPARING_ENVIRONMENT"
        append_log("Validating Databricks & Snowflake environments...")
        validate_databricks_env_vars()
        databricks_config = build_databricks_config(creds)
        snowflake_config = build_snowflake_config(creds)
        w = WorkspaceClient()

        append_log(f"Ensuring Unity Catalog hierarchy: {snowflake_config['database']}.{snowflake_config['schema']}...")
        migration_status["stage"] = "ENSURING_UNITY_CATALOG"
        volume_root = ensure_unity_catalog_hierarchy(
            w,
            databricks_config["warehouse_id"],
            snowflake_config["database"],
            snowflake_config["schema"],
        )
        append_log(f"Unity Catalog Volume verified at: {volume_root}")

        total = len(selected_tables)
        for idx, table_name in enumerate(selected_tables, start=1):
            t_start = time.time()
            t_entry = migration_status["table_progress"][table_name]
            t_entry["status"] = "IN_PROGRESS"
            
            # Step 1: Extract Parquet
            migration_status["stage"] = f"EXTRACTING ({table_name})"
            t_entry["stage"] = "EXTRACTING"
            append_log(f"[{idx}/{total}] Extracting Parquet from Snowflake: {table_name}...")
            payload = extract_and_stage_parquet(table_name, snowflake_config)
            t_entry["rows"] = payload.get("row_count", 0)
            append_log(f"Extracted {t_entry['rows']} rows for {table_name}")

            # Step 2: Upload to UC Volume
            migration_status["stage"] = f"UPLOADING ({table_name})"
            t_entry["stage"] = "UPLOADING_VOLUME"
            append_log(f"[{idx}/{total}] Uploading Parquet to Databricks Volume: {table_name}...")
            volume_path = upload_parquet_to_volume(w, payload["local_parquet_path"], payload["table_name"], volume_root)

            # Step 3: COPY INTO Delta
            migration_status["stage"] = f"INGESTING ({table_name})"
            t_entry["stage"] = "COPY_INTO_DELTA"
            append_log(f"[{idx}/{total}] Executing COPY INTO Delta: {table_name}...")
            load_via_copy_into(w, databricks_config["warehouse_id"], snowflake_config["database"], snowflake_config["schema"], payload, volume_path)

            t_entry["stage"] = "COMPLETED"
            t_entry["status"] = "COMPLETED"
            t_entry["duration_seconds"] = round(time.time() - t_start, 2)
            migration_status["tables_completed"] += 1
            migration_status["progress"] = int((migration_status["tables_completed"] / total) * 100)
            append_log(f"Successfully migrated table: {table_name} ({t_entry['duration_seconds']}s)")

        migration_status["status"] = "COMPLETED"
        migration_status["stage"] = "ALL_TASKS_COMPLETED"
        migration_status["end_time"] = datetime.now().isoformat()
        migration_status["duration_seconds"] = round(time.time() - start_ts, 2)
        append_log(f"Migration job [{job_id}] completed successfully in {migration_status['duration_seconds']}s!")

    except Exception as e:
        migration_status["status"] = f"FAILED: {str(e)}"
        migration_status["stage"] = "FAILED"
        migration_status["end_time"] = datetime.now().isoformat()
        migration_status["duration_seconds"] = round(time.time() - start_ts, 2)
        append_log(f"Migration failed: {str(e)}", level="ERROR")
    finally:
        # Save snapshot into history
        history_entry = dict(migration_status)
        history_entry["table_progress"] = dict(migration_status.get("table_progress", {}))
        history_entry["logs"] = list(migration_status.get("logs", []))
        migration_history.insert(0, history_entry)
        if len(migration_history) > 50:
            migration_history.pop()

@app.get("/api/status")
async def get_status():
    if migration_status["status"] == "RUNNING" and migration_status.get("start_time"):
        try:
            start = datetime.fromisoformat(migration_status["start_time"])
            migration_status["duration_seconds"] = round((datetime.now() - start).total_seconds(), 1)
        except Exception:
            pass
    return migration_status

@app.get("/api/migrations/history")
async def get_migrations_history():
    return {"history": migration_history}

# ─── Validation ───────────────────────────────────────────────────────────────

@app.post("/api/validate")
async def api_validate_tables(req: ValidateRequest):
    try:
        tables = req.tables
        if not tables:
            # Fallback to last migrated tables or discover
            if migration_status.get("selected_tables"):
                tables = migration_status["selected_tables"]
            else:
                tables = discover_snowflake_tables()

        w = WorkspaceClient()
        validate_databricks_env_vars()
        sf_cfg = build_snowflake_config(req.creds)
        report = validate_migrated_tables(w, tables, sf_cfg, DATABRICKS_WAREHOUSE_ID)
        return {"status": "success", "report": report}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ─── Static Files (Frontend dist) ─────────────────────────────────────────────

static_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
