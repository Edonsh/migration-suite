import os
import tempfile
from pathlib import Path
import snowflake.connector
import pyarrow as pa
import pyarrow.parquet as pq
from .config import SNOWFLAKE_CONFIG

def get_snowflake_connection(config=None):
    """Establishes a connection to Snowflake with sanitized authentication options."""
    cfg = dict(config or SNOWFLAKE_CONFIG)
    auth = cfg.get("authenticator")
    if auth:
        auth_str = str(auth).strip()
        # If a JWT token was mistakenly passed as the authenticator
        if auth_str.startswith("eyJ"):
            if not cfg.get("token"):
                cfg["token"] = auth_str
            cfg["authenticator"] = "oauth"
        elif auth_str.lower() not in ("snowflake", "oauth", "externalbrowser", "username_password_mfa") and not auth_str.startswith("http"):
            # Unknown authenticator string: remove it so it doesn't cause 251007 error
            cfg.pop("authenticator", None)

    # If authenticator is 'oauth' but token is invalid/empty and password exists, fallback to password
    if cfg.get("password") and cfg.get("authenticator") == "oauth" and (not cfg.get("token") or cfg.get("token") == "your_new_pat_here"):
        cfg.pop("authenticator", None)
        cfg.pop("token", None)

    # Filter out None and empty strings
    clean_cfg = {k: v for k, v in cfg.items() if v is not None and v != ""}
    return snowflake.connector.connect(**clean_cfg)

def discover_snowflake_tables(config=None):
    """Queries Snowflake metadata to get a list of all tables in the database/schema."""
    config = config or SNOWFLAKE_CONFIG
    if not config.get("database") or not config.get("schema"):
        raise ValueError("Snowflake database and schema are required.")

    print(f"\n--- Discovering tables in {config['database']}.{config['schema']} ---")
    conn = get_snowflake_connection(config)
    cursor = conn.cursor()
    
    try:
        cursor.execute(f"SHOW TABLES IN SCHEMA {config['database']}.{config['schema']};")
        results = cursor.fetchall()
        tables = [row[1] for row in results]
        return tables
    finally:
        cursor.close()
        conn.close()

def discover_snowflake_all_objects(config=None):
    """Discovers Snowflake tables, views, and stored procedures for the configured schema."""
    config = config or SNOWFLAKE_CONFIG
    if not config.get("database") or not config.get("schema"):
        raise ValueError("Snowflake database and schema are required.")

    database = config["database"]
    schema = config["schema"]
    conn = get_snowflake_connection(config)
    cursor = conn.cursor()

    try:
        cursor.execute(f"SHOW TABLES IN SCHEMA {database}.{schema};")
        tables = [row[1] for row in cursor.fetchall()]

        try:
            cursor.execute(f"SHOW VIEWS IN SCHEMA {database}.{schema};")
            views = [row[1] for row in cursor.fetchall()]
        except Exception:
            cursor.execute(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS "
                "WHERE TABLE_CATALOG = %s AND TABLE_SCHEMA = %s ORDER BY TABLE_NAME",
                (database, schema),
            )
            views = [row[0] for row in cursor.fetchall()]

        # Use INFORMATION_SCHEMA.PROCEDURES to get ONLY user-defined procedures.
        # SHOW PROCEDURES returns both user-defined AND Snowflake built-in system
        # procedures (30+ entries), which is misleading in the UI.
        try:
            cursor.execute(
                "SELECT DISTINCT PROCEDURE_NAME "
                "FROM INFORMATION_SCHEMA.PROCEDURES "
                "WHERE PROCEDURE_CATALOG = %s AND PROCEDURE_SCHEMA = %s "
                "ORDER BY PROCEDURE_NAME",
                (database, schema),
            )
            procedures = [row[0] for row in cursor.fetchall()]
        except Exception:
            procedures = []

        return {
            "database": database,
            "schema": schema,
            "tables": tables,
            "views": views,
            "procedures": procedures,
        }
    finally:
        cursor.close()
        conn.close()


def _full_name(config, object_name: str) -> str:
    database = config.get("database")
    schema = config.get("schema")
    return f"{database}.{schema}.{object_name}" if database and schema else object_name

def extract_and_stage_parquet(table_name, config=None, local_staging_dir="./staging", target_columns=None):
    """Extract Snowflake rows and stage Parquet using the target table's schema when supplied."""
    print(f"\n--- [1/3] EXTRACTING & STAGING PARQUET: {table_name} ---")
    os.makedirs(local_staging_dir, exist_ok=True)
    
    conn = get_snowflake_connection(config)
    cursor = conn.cursor()
    
    try:
        cursor.execute(f"SELECT * FROM {_full_name(config or SNOWFLAKE_CONFIG, table_name)};")
        source_columns = [
            column.name if hasattr(column, "name") else column[0]
            for column in (cursor.description or [])
        ]
        df = cursor.fetch_pandas_all()
        if len(source_columns) == len(df.columns):
            df.columns = source_columns

        if target_columns:
            target_by_name = {column["name"].casefold(): column for column in target_columns}
            missing_columns = [name for name in df.columns if name.casefold() not in target_by_name]
            if missing_columns:
                raise ValueError(
                    f"Target table {table_name} is missing source columns: {', '.join(missing_columns)}"
                )
            df.columns = [target_by_name[name.casefold()]["name"] for name in df.columns]

        table = pa.Table.from_pandas(df, preserve_index=False)

        fields = []
        for field in table.schema:
            str_type = str(field.type).lower()

            target_column = target_by_name.get(field.name.casefold()) if target_columns else None
            target_type = (target_column["type"].upper() if target_column else "")
            if target_type in {"BYTE", "TINYINT"}:
                arrow_type = pa.int8()
            elif target_type == "SMALLINT":
                arrow_type = pa.int16()
            elif target_type in {"INT", "INTEGER"}:
                arrow_type = pa.int32()
            elif target_type in {"BIGINT", "LONG"}:
                arrow_type = pa.int64()
            elif target_type.startswith("DECIMAL") or target_type.startswith("NUMERIC"):
                precision_scale = target_type[target_type.find("(") + 1:target_type.rfind(")")].split(",") if "(" in target_type else []
                precision = int(precision_scale[0]) if precision_scale else 38
                scale = int(precision_scale[1]) if len(precision_scale) > 1 else 18
                arrow_type = pa.decimal128(precision, scale)
            elif target_type in {"FLOAT", "REAL"}:
                arrow_type = pa.float32()
            elif target_type in {"DOUBLE"}:
                arrow_type = pa.float64()
            elif target_type in {"BOOLEAN", "BOOL"}:
                arrow_type = pa.bool_()
            elif target_type == "DATE":
                arrow_type = pa.date32()
            elif target_type.startswith("TIMESTAMP"):
                arrow_type = pa.timestamp("us")
            elif target_type in {"BINARY"}:
                arrow_type = pa.binary()
            elif target_type:
                arrow_type = pa.string()
            elif "int" in str_type:
                arrow_type = pa.int64()
            elif "float" in str_type or "double" in str_type or "decimal" in str_type:
                arrow_type = pa.float64()
            elif "bool" in str_type:
                arrow_type = pa.bool_()
            elif "date" in str_type:
                arrow_type = pa.date32()
            elif "timestamp" in str_type:
                arrow_type = pa.timestamp("us")
            else:
                arrow_type = pa.string()

            fields.append(pa.field(field.name, arrow_type, nullable=True))
            
        clean_schema = pa.schema(fields)
        clean_table = table.cast(clean_schema)
        
        parquet_file_path = os.path.join(local_staging_dir, f"{table_name.lower()}.parquet")
        pq.write_table(clean_table, parquet_file_path, compression="SNAPPY")
        
        row_count = len(df)
        print(f"Staged {row_count} rows into local Parquet file: {parquet_file_path}")
        return {
            "table_name": table_name.lower(),
            "local_parquet_path": parquet_file_path,
            "row_count": row_count
        }
    finally:
        cursor.close()
        conn.close()

def test_snowflake_connection(config=None):
    """Tests connection to Snowflake and returns latency and discovered table count."""
    import time
    start_time = time.time()
    conn = get_snowflake_connection(config)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT CURRENT_VERSION(), CURRENT_WAREHOUSE(), CURRENT_DATABASE(), CURRENT_SCHEMA();")
        row = cursor.fetchone()
        latency_ms = round((time.time() - start_time) * 1000, 2)
        return {
            "status": "connected",
            "latency_ms": latency_ms,
            "version": row[0] if row else "Unknown",
            "warehouse": row[1] if row else "Unknown",
            "database": row[2] if row else "Unknown",
            "schema": row[3] if row else "Unknown"
        }
    finally:
        cursor.close()
        conn.close()


def dump_snowflake_ddls_to_dir(config=None, output_dir: str = None) -> str:
    """Exports Snowflake object DDLs (tables, views, procedures) to a local directory.

    Used to prepare a source directory for the Lakebridge ``analyze`` command.
    If *output_dir* is not supplied, a temporary directory is created; the caller
    is responsible for cleanup when no longer needed.

    Returns the path of the directory containing the exported ``.sql`` files.
    """
    config = config or SNOWFLAKE_CONFIG
    database = config.get("database")
    schema = config.get("schema")
    if not database or not schema:
        raise ValueError("Snowflake database and schema are required for DDL export.")

    root = Path(output_dir) if output_dir else Path(tempfile.mkdtemp(prefix="gmigrate_ddl_"))
    root.mkdir(parents=True, exist_ok=True)

    conn = get_snowflake_connection(config)
    cursor = conn.cursor()
    exported: dict = {"tables": [], "views": [], "procedures": []}
    try:
        # ── Tables ────────────────────────────────────────────────────────────
        cursor.execute(f"SHOW TABLES IN SCHEMA {database}.{schema};")
        for row in cursor.fetchall():
            table = row[1]
            try:
                cursor.execute(f"SELECT GET_DDL('TABLE', '{database}.{schema}.{table}')")
                ddl = cursor.fetchone()[0] or ""
                (root / f"{table.lower()}.sql").write_text(ddl, encoding="utf-8")
                exported["tables"].append(table)
            except Exception:
                pass

        # ── Views ─────────────────────────────────────────────────────────────
        cursor.execute(f"SHOW VIEWS IN SCHEMA {database}.{schema};")
        for row in cursor.fetchall():
            view = row[1]
            try:
                cursor.execute(f"SELECT GET_DDL('VIEW', '{database}.{schema}.{view}')")
                ddl = cursor.fetchone()[0] or ""
                (root / f"{view.lower()}_view.sql").write_text(ddl, encoding="utf-8")
                exported["views"].append(view)
            except Exception:
                pass

        # ── Procedures ────────────────────────────────────────────────────────
        # Query only user-defined procedures (INFORMATION_SCHEMA excludes built-ins)
        try:
            cursor.execute(
                "SELECT DISTINCT PROCEDURE_NAME, PROCEDURE_DEFINITION "
                "FROM INFORMATION_SCHEMA.PROCEDURES "
                "WHERE PROCEDURE_CATALOG = %s AND PROCEDURE_SCHEMA = %s "
                "ORDER BY PROCEDURE_NAME",
                (database, schema),
            )
            proc_rows = cursor.fetchall()
        except Exception:
            proc_rows = []
        for row in proc_rows:
            proc, definition = row[0], row[1]
            if definition:
                try:
                    (root / f"{proc.lower()}_proc.sql").write_text(definition, encoding="utf-8")
                    exported["procedures"].append(proc)
                except Exception:
                    pass
    finally:
        cursor.close()
        conn.close()

    print(
        f"DDL export complete \u2192 {root}  "
        f"(tables={len(exported['tables'])}, "
        f"views={len(exported['views'])}, "
        f"procedures={len(exported['procedures'])})"
    )
    return str(root)
