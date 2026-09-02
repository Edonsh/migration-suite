import os
from pathlib import Path

from databricks.sdk import WorkspaceClient
from dotenv import load_dotenv

DOTENV_PATH = Path(__file__).resolve().parents[1] / ".env"
if DOTENV_PATH.exists():
    load_dotenv(DOTENV_PATH)

DATABRICKS_SECRET_SCOPE = os.environ.get("DATABRICKS_SECRET_SCOPE")


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


SNOWFLAKE_CONFIG = {
    "user": get_env_or_secret("SF_USER", DATABRICKS_SECRET_SCOPE),
    "password": get_env_or_secret("SF_PASSWORD", DATABRICKS_SECRET_SCOPE),
    "account": get_env_or_secret("SF_ACCOUNT", DATABRICKS_SECRET_SCOPE),
    "warehouse": get_env_or_secret("SF_WAREHOUSE", DATABRICKS_SECRET_SCOPE),
    "database": get_env_or_secret("SF_DATABASE", DATABRICKS_SECRET_SCOPE),
    "schema": get_env_or_secret("SF_SCHEMA", DATABRICKS_SECRET_SCOPE),
    "role": get_env_or_secret("SF_ROLE", DATABRICKS_SECRET_SCOPE)
}

DATABRICKS_WAREHOUSE_ID = get_databricks_warehouse_id() or get_env_or_secret("DATABRICKS_WAREHOUSE_ID", DATABRICKS_SECRET_SCOPE)

VOLUME_CATALOG = "migration_db"
VOLUME_SCHEMA = "source_data"
VOLUME_NAME = "staging_volume"
STAGING_VOLUME_PATH = f"/Volumes/{VOLUME_CATALOG}/{VOLUME_SCHEMA}/{VOLUME_NAME}"

def validate_snowflake_env_vars():
    required_keys = [
        ("SF_USER", SNOWFLAKE_CONFIG["user"]),
        ("SF_PASSWORD", SNOWFLAKE_CONFIG["password"]),
        ("SF_ACCOUNT", SNOWFLAKE_CONFIG["account"]),
        ("SF_WAREHOUSE", SNOWFLAKE_CONFIG["warehouse"]),
        ("SF_DATABASE", SNOWFLAKE_CONFIG["database"]),
        ("SF_SCHEMA", SNOWFLAKE_CONFIG["schema"]),
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

def build_snowflake_config(creds=None):
    if not creds:
        validate_snowflake_env_vars()
        return SNOWFLAKE_CONFIG

    config = {
        **SNOWFLAKE_CONFIG,
        "user": creds.snowflake_user,
        "password": creds.snowflake_password,
        "account": creds.snowflake_account,
        "warehouse": creds.snowflake_warehouse,
        "database": creds.snowflake_database,
        "schema": creds.snowflake_schema,
    }
    if creds.snowflake_role:
        config["role"] = creds.snowflake_role

    return {key: value for key, value in config.items() if value}

def build_databricks_config(creds=None):
    validate_databricks_env_vars()

    return {
        "warehouse_id": DATABRICKS_WAREHOUSE_ID,
    }
