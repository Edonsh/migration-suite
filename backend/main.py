from pathlib import Path
from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from .migration_engine.snowflake_client import discover_snowflake_tables, extract_tables_in_parallel
from .migration_engine.databricks_client import ensure_unity_catalog_hierarchy, upload_parquet_to_volume, load_via_copy_into
from .migration_engine.config import (
    build_databricks_config,
    build_snowflake_config,
    validate_databricks_env_vars,
    validate_snowflake_env_vars,
    ENVIRONMENT,
    LOCAL_DEV_USER_EMAIL,
    LOCAL_DEV_DISPLAY_NAME,
)
from databricks.sdk import WorkspaceClient

app = FastAPI(title="Migration Engine API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

migration_status = {"status": "IDLE", "progress": {}}

@app.on_event("startup")
async def startup_event():
    try:
        validate_snowflake_env_vars()
    except ValueError as exc:
        migration_status["status"] = f"CONFIG_WARNING: {exc}"

@app.post("/api/connect")
async def connect_sources(creds: CredentialsRequest):
    try:
        tables = discover_snowflake_tables(build_snowflake_config(creds))
        return {"status": "success", "tables": tables}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/identity")
async def get_identity(request: Request):
    """Returns the Databricks-forwarded identity of the currently logged-in user.

    In production (Databricks Apps), headers X-Forwarded-Email and
    X-Forwarded-Preferred-Username are injected by the platform per-request.
    In local development (ENVIRONMENT=local) these headers are absent, so we
    fall back to LOCAL_DEV_USER_EMAIL / LOCAL_DEV_DISPLAY_NAME.
    """
    email = request.headers.get("x-forwarded-email")
    display_name = request.headers.get("x-forwarded-preferred-username")

    if not email and ENVIRONMENT == "local":
        email = LOCAL_DEV_USER_EMAIL
        display_name = LOCAL_DEV_DISPLAY_NAME

    return {"email": email or "", "display_name": display_name or email or ""}

@app.get("/api/tables")
async def get_tables():
    try:
        validate_snowflake_env_vars()
        tables = discover_snowflake_tables()
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/migrate")
async def start_migration(req: MigrationRequest, background_tasks: BackgroundTasks):
    migration_status["status"] = "RUNNING"
    background_tasks.add_task(run_migration_task, req.selected_tables, req.creds)
    return {"message": "Migration started", "status_url": "/api/status"}

def run_migration_task(selected_tables, creds=None):
    try:
        validate_databricks_env_vars()
        databricks_config = build_databricks_config(creds)
        snowflake_config = build_snowflake_config(creds)
        w = WorkspaceClient()
        volume_root = ensure_unity_catalog_hierarchy(
            w,
            databricks_config["warehouse_id"],
            snowflake_config["database"],
            snowflake_config["schema"],
        )

        staged_payloads = extract_tables_in_parallel(selected_tables, snowflake_config, max_workers=4)

        for payload in staged_payloads:
            volume_path = upload_parquet_to_volume(w, payload["local_parquet_path"], payload["table_name"], volume_root)
            load_via_copy_into(w, databricks_config["warehouse_id"], snowflake_config["database"], snowflake_config["schema"], payload, volume_path)

        migration_status["status"] = "COMPLETED"
    except Exception as e:
        migration_status["status"] = f"FAILED: {str(e)}"

@app.get("/api/status")
async def get_status():
    return migration_status

static_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
