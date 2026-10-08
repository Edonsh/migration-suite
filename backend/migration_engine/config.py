import os
from pathlib import Path

from databricks.sdk import WorkspaceClient
from dotenv import load_dotenv

DOTENV_PATH = Path(__file__).resolve().parents[1] / ".env"
if DOTENV_PATH.exists():
    load_dotenv(DOTENV_PATH)

DATABRICKS_SECRET_SCOPE = os.environ.get("DATABRICKS_SECRET_SCOPE")

# Environment detection — controls local-dev fallback behavior
ENVIRONMENT = os.environ.get("ENVIRONMENT", "local")

# Local dev identity fallback (only active when ENVIRONMENT=local)
LOCAL_DEV_USER_EMAIL = os.environ.get("LOCAL_DEV_USER_EMAIL", "dev@localhost")
LOCAL_DEV_DISPLAY_NAME = os.environ.get("LOCAL_DEV_DISPLAY_NAME", "Dev User")


def get_databricks_warehouse_id():
    warehouse_id = os.environ.get("DATABRICKS_WAREHOUSE_ID")
    if warehouse_id:
        return warehouse_id

    try:
        client = WorkspaceClient()
        warehouses = list(client.warehouses.list())
        if warehouses:
            primary = next((w for w in warehouses if getattr(w, "state", None) in ("RUNNING", "IDLE", "STOPPED")), warehouses[0])
            warehouse_id = getattr(primary, "id", None) or getattr(primary, "warehouse_id", None)
            if warehouse_id:
                os.environ["DATABRICKS_WAREHOUSE_ID"] = warehouse_id
                return warehouse_id
    except Exception:
        pass

    return None


def get_env_or_secret(name, secret_scope=None):
    value = os.environ.get(name)
    if value:
        return value

    if not secret_scope:
        return None

    try:
        secret_value = WorkspaceClient().secrets.get_secret(scope=secret_scope, key=name)
        if secret_value:
            os.environ[name] = secret_value
            return secret_value
    except Exception:
        pass

    return None


TERADATA_CONFIG = {
    "host": get_env_or_secret("TD_HOST", DATABRICKS_SECRET_SCOPE),
    "user": get_env_or_secret("TD_USER", DATABRICKS_SECRET_SCOPE),
    "password": get_env_or_secret("TD_PASSWORD", DATABRICKS_SECRET_SCOPE),
    "database": get_env_or_secret("TD_DATABASE", DATABRICKS_SECRET_SCOPE),
    "logmech": get_env_or_secret("TD_LOGMECH", DATABRICKS_SECRET_SCOPE) or "TD2",
}

SNOWFLAKE_CONFIG = {
    "user": get_env_or_secret("SNOWFLAKE_USER", DATABRICKS_SECRET_SCOPE),
    "password": get_env_or_secret("SNOWFLAKE_PASSWORD", DATABRICKS_SECRET_SCOPE),
    "account": get_env_or_secret("SNOWFLAKE_ACCOUNT", DATABRICKS_SECRET_SCOPE),
    "warehouse": get_env_or_secret("SNOWFLAKE_WAREHOUSE", DATABRICKS_SECRET_SCOPE),
    "database": get_env_or_secret("SNOWFLAKE_DATABASE", DATABRICKS_SECRET_SCOPE),
    "schema": get_env_or_secret("SNOWFLAKE_SCHEMA", DATABRICKS_SECRET_SCOPE),
    "role": get_env_or_secret("SNOWFLAKE_ROLE", DATABRICKS_SECRET_SCOPE),
}

LAKEBRIDGE_ENABLED = os.environ.get("LAKEBRIDGE_ENABLED", "true").lower() in ("1", "true", "yes", "on")
LAKEBRIDGE_PATH = os.environ.get("LAKEBRIDGE_PATH", "databricks")
LAKEBRIDGE_PROFILE = os.environ.get("LAKEBRIDGE_PROFILE")
LAKEBRIDGE_TIMEOUT_SECONDS = int(os.environ.get("LAKEBRIDGE_TIMEOUT_SECONDS", "300"))

DATABRICKS_WAREHOUSE_ID = get_databricks_warehouse_id() or get_env_or_secret("DATABRICKS_WAREHOUSE_ID", DATABRICKS_SECRET_SCOPE)

VOLUME_CATALOG = "migration_db"
VOLUME_SCHEMA = "source_data"
VOLUME_NAME = "staging_volume"
STAGING_VOLUME_PATH = f"/Volumes/{VOLUME_CATALOG}/{VOLUME_SCHEMA}/{VOLUME_NAME}"

def validate_teradata_env_vars():
    required_keys = [
        ("TD_HOST", TERADATA_CONFIG["host"]),
        ("TD_USER", TERADATA_CONFIG["user"]),
        ("TD_PASSWORD", TERADATA_CONFIG["password"]),
        ("TD_DATABASE", TERADATA_CONFIG["database"]),
    ]
    missing = [key for key, val in required_keys if not val]
    if missing:
        raise ValueError(f"Missing Teradata app environment variables: {', '.join(missing)}")

def validate_snowflake_env_vars():
    required_keys = [
        ("SNOWFLAKE_USER", SNOWFLAKE_CONFIG["user"]),
        ("SNOWFLAKE_PASSWORD", SNOWFLAKE_CONFIG["password"]),
        ("SNOWFLAKE_ACCOUNT", SNOWFLAKE_CONFIG["account"]),
        ("SNOWFLAKE_WAREHOUSE", SNOWFLAKE_CONFIG["warehouse"]),
        ("SNOWFLAKE_DATABASE", SNOWFLAKE_CONFIG["database"]),
        ("SNOWFLAKE_SCHEMA", SNOWFLAKE_CONFIG["schema"]),
    ]
    missing = [key for key, val in required_keys if not val]
    if missing:
        raise ValueError(f"Missing Snowflake app environment variables: {', '.join(missing)}")

def validate_databricks_env_vars():
    global DATABRICKS_WAREHOUSE_ID
    DATABRICKS_WAREHOUSE_ID = get_databricks_warehouse_id() or get_env_or_secret("DATABRICKS_WAREHOUSE_ID", DATABRICKS_SECRET_SCOPE)
    if not DATABRICKS_WAREHOUSE_ID:
        raise ValueError("Missing Databricks app environment variable: DATABRICKS_WAREHOUSE_ID")

def validate_env_vars():
    validate_snowflake_env_vars()
    validate_databricks_env_vars()

def build_teradata_config(creds=None):
    if not creds:
        validate_teradata_env_vars()
        return TERADATA_CONFIG

    config = {
        **TERADATA_CONFIG,
        "host": creds.teradata_host,
        "user": creds.teradata_user,
        "password": creds.teradata_password,
        "database": creds.teradata_database,
        "logmech": creds.teradata_logmech or "TD2",
    }
    return {key: value for key, value in config.items() if value}

def build_snowflake_config(creds=None):
    if not creds:
        validate_snowflake_env_vars()
        return {key: value for key, value in SNOWFLAKE_CONFIG.items() if value}

    config = {
        **SNOWFLAKE_CONFIG,
        "user": getattr(creds, "snowflake_user", None),
        "password": getattr(creds, "snowflake_password", None),
        "account": getattr(creds, "snowflake_account", None),
        "warehouse": getattr(creds, "snowflake_warehouse", None),
        "database": getattr(creds, "snowflake_database", None),
        "schema": getattr(creds, "snowflake_schema", None),
        "role": getattr(creds, "snowflake_role", None),
    }
    return {key: value for key, value in config.items() if value}

def build_databricks_config(creds=None):
    validate_databricks_env_vars()

    return {
        "warehouse_id": DATABRICKS_WAREHOUSE_ID,
    }
