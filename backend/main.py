from dataclasses import asdict
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
    discover_snowflake_all_objects,
    extract_and_stage_parquet,
    test_snowflake_connection,
    dump_snowflake_ddls_to_dir,
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
from .migration_engine.lakebridge import LakebridgeService

from .migration_engine.connection_store import (
    load_saved_profiles,
    get_profile_by_id,
    create_or_update_profile,
    delete_profile,
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

class SavedProfileRequest(BaseModel):
    id: Optional[str] = None
    name: str
    snowflake_user: str
    snowflake_password: Optional[str] = ""
    snowflake_account: str
    snowflake_warehouse: str
    snowflake_database: str
    snowflake_schema: str
    snowflake_role: Optional[str] = None
    is_default: Optional[bool] = False

class MigrationRequest(BaseModel):
    selected_tables: List[str]
    creds: Optional[CredentialsRequest] = None
    profile_id: Optional[str] = None

class ObjectDiscoveryRequest(BaseModel):
    creds: Optional[CredentialsRequest] = None
    profile_id: Optional[str] = None

class ValidateRequest(BaseModel):
    tables: Optional[List[str]] = None
    creds: Optional[CredentialsRequest] = None
    profile_id: Optional[str] = None


class LakebridgeAssessRequest(BaseModel):
    """Request body for the Lakebridge assess endpoint.

    If *source_directory* is omitted, DDLs are automatically exported from the
    configured Snowflake database/schema before the Lakebridge analysis runs.
    """
    source_directory: Optional[str] = None
    report_file: Optional[str] = None
    source_tech: str = "snowflake"
    profile_id: Optional[str] = None
    creds: Optional[CredentialsRequest] = None


class GenerateDDLRequest(BaseModel):
    """Request body for generating and optionally applying DDL in Databricks."""
    object_type: str  # 'table' | 'view' | 'procedure'
    object_names: List[str]  # list of Snowflake object names to generate DDL for
    execute_in_databricks: bool = False  # if True, run the DDL against the Databricks warehouse
    profile_id: Optional[str] = None
    creds: Optional[CredentialsRequest] = None


def resolve_snowflake_config(creds: Optional[CredentialsRequest] = None, profile_id: Optional[str] = None) -> Dict[str, Any]:
    """Resolves Snowflake configuration from explicit credentials, a saved profile, or backend/.env."""
    if profile_id:
        p = get_profile_by_id(profile_id)
        if p and p.get("snowflake_user"):
            return {
                "user": p["snowflake_user"],
                "password": p.get("snowflake_password") or "",
                "account": p["snowflake_account"],
                "warehouse": p["snowflake_warehouse"],
                "database": p["snowflake_database"],
                "schema": p["snowflake_schema"],
                "role": p.get("snowflake_role") or None,
            }

    if creds and creds.snowflake_user:
        pwd = getattr(creds, "snowflake_password", None)
        if pwd and pwd != "********":
            return build_snowflake_config(creds)

    # Fallback to first saved profile in connection store
    profiles = load_saved_profiles()
    active = next((p for p in profiles if p.get("snowflake_user")), None)
    if active:
        return {
            "user": active["snowflake_user"],
            "password": active.get("snowflake_password") or "",
            "account": active["snowflake_account"],
            "warehouse": active["snowflake_warehouse"],
            "database": active["snowflake_database"],
            "schema": active["snowflake_schema"],
            "role": active.get("snowflake_role") or None,
        }

    return build_snowflake_config(creds)

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
def startup_event():
    try:
        validate_snowflake_env_vars()
    except ValueError as exc:
        append_log(f"Config notice: {exc}", level="WARN")

# ─── Identity & Health ────────────────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "migration-suite", "env": ENVIRONMENT}

@app.get("/api/identity")
def get_identity(request: Request):
    """Returns the Databricks-forwarded identity of the currently logged-in user."""
    email = request.headers.get("x-forwarded-email")
    display_name = request.headers.get("x-forwarded-preferred-username")

    if not email and ENVIRONMENT == "local":
        email = LOCAL_DEV_USER_EMAIL
        display_name = LOCAL_DEV_DISPLAY_NAME

    return {"email": email or "", "display_name": display_name or email or ""}

# ─── Connections Endpoints ────────────────────────────────────────────────────

@app.get("/api/connections/status")
def get_connections_status():
    """Returns current configured connection details (without sensitive passwords)."""
    sf_cfg = {
        "account": SNOWFLAKE_CONFIG.get("account") or "",
        "user": SNOWFLAKE_CONFIG.get("user") or "",
        "warehouse": SNOWFLAKE_CONFIG.get("warehouse") or "",
        "database": SNOWFLAKE_CONFIG.get("database") or "",
        "schema": SNOWFLAKE_CONFIG.get("schema") or "",
        "role": SNOWFLAKE_CONFIG.get("role") or "",
        "configured": bool(SNOWFLAKE_CONFIG.get("account") and SNOWFLAKE_CONFIG.get("user")),
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
        "lakebridge": LakebridgeService().status(),
        "environment": ENVIRONMENT,
    }

@app.post("/api/connections/test-snowflake")
def api_test_snowflake(creds: Optional[CredentialsRequest] = None):
    try:
        config = build_snowflake_config(creds)
        result = test_snowflake_connection(config)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/lakebridge/status")
def api_lakebridge_status():
    return LakebridgeService().status()


@app.post("/api/lakebridge/assess")
def api_lakebridge_assess(req: Optional[LakebridgeAssessRequest] = None):
    """Runs Lakebridge analysis on a directory of SQL sources.

    If *source_directory* is not supplied the endpoint automatically exports DDLs
    from the configured Snowflake database/schema and passes them to Lakebridge.
    """
    try:
        req = req or LakebridgeAssessRequest()
        svc = LakebridgeService()
        av = svc.status()
        if not av.get("available"):
            raise HTTPException(
                status_code=503,
                detail=f"Lakebridge is not available: {av.get('reason', 'Check LAKEBRIDGE_ENABLED and LAKEBRIDGE_PATH.')}",
            )
        source_dir = req.source_directory
        if not source_dir:
            sf_config = resolve_snowflake_config(creds=req.creds, profile_id=req.profile_id)
            append_log(
                f"Exporting Snowflake DDLs from "
                f"{sf_config.get('database')}.{sf_config.get('schema')} for Lakebridge assessment..."
            )
            source_dir = dump_snowflake_ddls_to_dir(sf_config)
            append_log(f"DDLs written to: {source_dir}")
        report_file = req.report_file or str(Path(source_dir) / "lakebridge_report.xlsx")
        append_log(f"Running Lakebridge assess on: {source_dir}")
        result = svc.assess_directory(source_dir, report_file, req.source_tech)
        level = "INFO" if result.status in ("SUCCEEDED", "SKIPPED") else "WARN"
        append_log(f"Lakebridge assessment status={result.status}", level=level)
        return {"status": "success", "result": asdict(result)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/connections/test-databricks")
def api_test_databricks(creds: Optional[CredentialsRequest] = None):
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
                "state": state,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ─── Saved Connection Profiles Endpoints ─────────────────────────────────────

@app.get("/api/connections/profiles")
def get_saved_profiles():
    """Returns all saved Snowflake connection profiles."""
    profiles = load_saved_profiles()
    # Mask passwords for UI security
    safe_profiles = []
    for p in profiles:
        cp = dict(p)
        cp["has_password"] = bool(cp.get("snowflake_password"))
        cp["snowflake_password"] = "********" if cp["has_password"] else ""
        safe_profiles.append(cp)
    return {"profiles": safe_profiles}

@app.post("/api/connections/profiles")
def save_profile(req: SavedProfileRequest):
    """Creates or updates a saved Snowflake connection profile."""
    try:
        saved = create_or_update_profile(req.model_dump())
        return {"status": "success", "profile": saved}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/connections/profiles/{profile_id}")
def update_profile(profile_id: str, req: SavedProfileRequest):
    """Updates an existing connection profile."""
    try:
        data = req.model_dump()
        data["id"] = profile_id
        saved = create_or_update_profile(data)
        return {"status": "success", "profile": saved}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/connections/profiles/{profile_id}")
def remove_profile(profile_id: str):
    """Deletes a saved connection profile."""
    if profile_id == "default_env":
        raise HTTPException(status_code=400, detail="Cannot delete default environment profile")
    success = delete_profile(profile_id)
    if not success:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"status": "success", "message": "Profile deleted"}

@app.post("/api/connections/profiles/{profile_id}/test")
def test_saved_profile(profile_id: str):
    """Tests connection for a specific saved profile."""
    profiles = load_saved_profiles()
    profile = next((p for p in profiles if p.get("id") == profile_id), None)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    try:
        config = {
            "user": profile["snowflake_user"],
            "password": profile["snowflake_password"],
            "account": profile["snowflake_account"],
            "warehouse": profile["snowflake_warehouse"],
            "database": profile["snowflake_database"],
            "schema": profile["snowflake_schema"],
            "role": profile.get("snowflake_role") or None,
        }
        result = test_snowflake_connection(config)
        return {"status": "success", "result": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ─── Tables & Schema Analysis ─────────────────────────────────────────────────

@app.get("/api/objects")
def get_all_objects(profile_id: Optional[str] = None):
    try:
        config = resolve_snowflake_config(profile_id=profile_id)
        return discover_snowflake_all_objects(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/objects")
def post_all_objects(req: Optional[ObjectDiscoveryRequest] = None):
    try:
        config = resolve_snowflake_config(creds=req.creds if req else None, profile_id=req.profile_id if req else None)
        return discover_snowflake_all_objects(config)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ─── DDL Generation via Lakebridge ───────────────────────────────────────────

@app.post("/api/generate-ddl")
def api_generate_ddl(req: GenerateDDLRequest):
    """Transpiles selected Snowflake DDL with Lakebridge and optionally deploys it.

    For each requested object:
      1. Fetches the original Snowflake DDL (GET_DDL or INFORMATION_SCHEMA).
      2. Passes it through the Lakebridge transpiler (Snowflake → Databricks).
    3. Optionally executes Lakebridge's output against the Databricks warehouse.
    """
    try:
        sf_config = resolve_snowflake_config(creds=req.creds, profile_id=req.profile_id)
        database = sf_config.get("database")
        schema = sf_config.get("schema")
        svc = LakebridgeService()
        availability = svc.status()
        if not availability.get("available"):
            raise HTTPException(
                status_code=503,
                detail=f"Lakebridge is not available: {availability.get('reason', 'Check Lakebridge configuration.')}",
            )

        results = []
        for obj_name in req.object_names:
            full_name = f"{database}.{schema}.{obj_name}"
            snowflake_ddl = ""
            generated_ddl = ""
            execution_result = None
            error = None

            # 1. Fetch source DDL from Snowflake
            try:
                from .migration_engine.snowflake_client import get_snowflake_connection
                conn = get_snowflake_connection(sf_config)
                cursor = conn.cursor()
                try:
                    if req.object_type == "table":
                        cursor.execute(f"SELECT GET_DDL('TABLE', '{full_name}')")
                        row = cursor.fetchone()
                        snowflake_ddl = row[0] if row else ""
                    elif req.object_type == "view":
                        cursor.execute(f"SELECT GET_DDL('VIEW', '{full_name}')")
                        row = cursor.fetchone()
                        snowflake_ddl = row[0] if row else ""
                    elif req.object_type == "procedure":
                        try:
                            cursor.execute(
                                "SELECT ARGUMENT_SIGNATURE, DATA_TYPE, PROCEDURE_DEFINITION "
                                "FROM INFORMATION_SCHEMA.PROCEDURES "
                                "WHERE UPPER(PROCEDURE_CATALOG) = UPPER(%s) AND UPPER(PROCEDURE_SCHEMA) = UPPER(%s) AND UPPER(PROCEDURE_NAME) = UPPER(%s)",
                                (database, schema, obj_name),
                            )
                            p_row = cursor.fetchone()
                            if p_row:
                                sig = p_row[0] or ""
                                ret_type = p_row[1] or ""
                                body = p_row[2] or ""
                                inner = sig.strip("()")
                                types = []
                                for part in inner.split(","):
                                    tokens = part.strip().split()
                                    if tokens:
                                        types.append(tokens[-1])
                                sig_types = f"({', '.join(types)})" if types else "()"
                                try:
                                    cursor.execute(f"SELECT GET_DDL('PROCEDURE', '{database}.{schema}.{obj_name}{sig_types}')")
                                    ddl_row = cursor.fetchone()
                                    snowflake_ddl = ddl_row[0] if ddl_row else ""
                                except Exception:
                                    snowflake_ddl = f"CREATE OR REPLACE PROCEDURE {obj_name}{sig}\nRETURNS {ret_type}\nLANGUAGE SQL\nAS $$\n{body}\n$$;"
                            else:
                                snowflake_ddl = ""
                        except Exception as pe:
                            error = f"Failed to get procedure definition: {pe}"
                finally:
                    cursor.close()
                    conn.close()
            except Exception as e:
                error = f"Failed to fetch Snowflake DDL: {e}"

            # 2. Convert with Lakebridge only; never substitute hand-written mappings.
            lakebridge_used = False
            if snowflake_ddl:
                try:
                    conversion = svc.convert_sql_text(snowflake_ddl, obj_name, req.object_type)
                    if conversion.status == "SUCCEEDED" and conversion.target_definition:
                        generated_ddl = conversion.target_definition
                        lakebridge_used = True
                    else:
                        error = "; ".join(conversion.errors or conversion.warnings) or "Lakebridge did not produce SQL output."
                except Exception as ex:
                    error = f"Lakebridge transpilation failed: {ex}"
            else:
                error = error or f"Could not retrieve DDL for {obj_name} from Snowflake."

            # 3. Optionally execute in Databricks
            if req.execute_in_databricks and generated_ddl and lakebridge_used:
                try:
                    from databricks.sdk import WorkspaceClient
                    from .migration_engine.config import DATABRICKS_WAREHOUSE_ID
                    from .migration_engine.databricks_client import (
                        execute_sql,
                        ensure_unity_catalog_hierarchy,
                        determine_target_catalog_and_schema,
                    )
                    w = WorkspaceClient()
                    ensure_unity_catalog_hierarchy(w, DATABRICKS_WAREHOUSE_ID, database, schema)
                    target_catalog, target_schema = determine_target_catalog_and_schema(database, schema)
                    exec_res = execute_sql(
                        w,
                        DATABRICKS_WAREHOUSE_ID,
                        generated_ddl,
                        catalog=target_catalog,
                        schema=target_schema,
                    )
                    state = exec_res.status.state.value if exec_res.status and exec_res.status.state else "UNKNOWN"
                    execution_result = {
                        "status": "SUCCEEDED" if state not in ("FAILED", "CANCELED") else "FAILED",
                        "state": state,
                        "error": exec_res.status.error.message if (exec_res.status and exec_res.status.error) else None,
                        "target_catalog": target_catalog,
                        "target_schema": target_schema,
                    }
                except Exception as ex:
                    execution_result = {"status": "FAILED", "state": "ERROR", "error": str(ex)}

            results.append({
                "object_name": obj_name,
                "object_type": req.object_type,
                "snowflake_ddl": snowflake_ddl,
                "generated_ddl": generated_ddl,
                "lakebridge_used": lakebridge_used,
                "execution_result": execution_result,
                "error": error,
            })

        return {"status": "success", "results": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Migration Execution ──────────────────────────────────────────────────────

@app.post("/api/migrate")
def start_migration(req: MigrationRequest, background_tasks: BackgroundTasks):
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
    background_tasks.add_task(run_migration_task, job_id, req.selected_tables, req.creds, req.profile_id)
    return {"message": "Migration started", "job_id": job_id, "status_url": "/api/status"}


def run_migration_task(job_id: str, selected_tables: List[str], creds: Optional[CredentialsRequest] = None, profile_id: Optional[str] = None):
    start_ts = time.time()
    try:
        migration_status["stage"] = "PREPARING_ENVIRONMENT"
        append_log("Validating Databricks & Snowflake environments...")
        validate_databricks_env_vars()
        databricks_config = build_databricks_config(creds)
        snowflake_config = resolve_snowflake_config(creds=creds, profile_id=profile_id)
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
        history_entry = dict(migration_status)
        history_entry["table_progress"] = dict(migration_status.get("table_progress", {}))
        history_entry["logs"] = list(migration_status.get("logs", []))
        migration_history.insert(0, history_entry)
        if len(migration_history) > 50:
            migration_history.pop()


@app.get("/api/status")
def get_status():
    if migration_status["status"] == "RUNNING" and migration_status.get("start_time"):
        try:
            start = datetime.fromisoformat(migration_status["start_time"])
            migration_status["duration_seconds"] = round((datetime.now() - start).total_seconds(), 1)
        except Exception:
            pass
    return migration_status

@app.get("/api/migrations/history")
def get_migrations_history():
    return {"history": migration_history}

# ─── Validation ───────────────────────────────────────────────────────────────

@app.post("/api/validate")
def api_validate_tables(req: ValidateRequest):
    try:
        sf_cfg = resolve_snowflake_config(creds=req.creds, profile_id=req.profile_id)
        tables = req.tables
        if not tables:
            if migration_status.get("selected_tables"):
                tables = migration_status["selected_tables"]
            else:
                tables = discover_snowflake_tables(sf_cfg)

        w = WorkspaceClient()
        validate_databricks_env_vars()
        report = validate_migrated_tables(w, tables, sf_cfg, DATABRICKS_WAREHOUSE_ID)
        return {"status": "success", "report": report}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ─── Static Files (Frontend dist) ─────────────────────────────────────────────

static_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
