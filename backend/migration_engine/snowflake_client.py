import os
import tempfile
import concurrent.futures
from pathlib import Path
import snowflake.connector
import pandas as pd
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

def select_tables_interactively(available_tables):
    """Presents an interactive menu allowing the user to pick tables."""
    if not available_tables:
        print("No tables found in the specified Snowflake schema!")
        return []

    print("\nAvailable Tables in Snowflake:")
    for idx, table_name in enumerate(available_tables, 1):
        print(f"  [{idx}] {table_name}")
    print("  [A] All Tables")

    user_input = input("\nEnter table numbers to migrate (e.g., '1,3' or 'A' for all): ").strip().upper()

    if user_input == "A":
        return available_tables

    selected = []
    choices = [c.strip() for c in user_input.split(",") if c.strip()]
    for choice in choices:
        if choice.isdigit():
            idx = int(choice) - 1
            if 0 <= idx < len(available_tables):
                selected.append(available_tables[idx])
            else:
                print(f"Warning: Option {choice} is out of range. Skipping.")
        else:
            print(f"Warning: Invalid option '{choice}'. Skipping.")

    return selected

def extract_and_stage_parquet(table_name, config=None, local_staging_dir="./staging"):
    """Extracts Snowflake data, sanitizes PyArrow types/metadata, and stages Parquet file."""
    print(f"\n--- [1/3] EXTRACTING & STAGING PARQUET: {table_name} ---")
    os.makedirs(local_staging_dir, exist_ok=True)
    
    conn = get_snowflake_connection(config)
    cursor = conn.cursor()
    
    try:
        cursor.execute(f"SELECT * FROM {table_name};")
        df = cursor.fetch_pandas_all()
        df.columns = [col.lower() for col in df.columns]
        
        table = pa.Table.from_pandas(df, preserve_index=False)
        
        fields = []
        for field in table.schema:
            str_type = str(field.type).lower()
            
            if "int" in str_type:
                target_type = pa.int64()
            elif "float" in str_type or "double" in str_type or "decimal" in str_type:
                target_type = pa.float64()
            elif "bool" in str_type:
                target_type = pa.bool_()
            elif "date" in str_type:
                target_type = pa.date32()
            elif "timestamp" in str_type:
                target_type = pa.timestamp("ms")
            else:
                target_type = pa.string()
                
            fields.append(pa.field(field.name, target_type, nullable=True))
            
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

def extract_tables_in_parallel(selected_tables, config=None, max_workers=4):
    """Extracts and stages multiple tables in parallel using a thread pool."""
    print(f"\n--- Starting Parallel Extraction ({max_workers} Workers) ---")
    results = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_table = {
            executor.submit(extract_and_stage_parquet, table, config): table
            for table in selected_tables
        }
        
        for future in concurrent.futures.as_completed(future_to_table):
            table = future_to_table[future]
            try:
                data = future.result()
                results.append(data)
            except Exception as exc:
                print(f"\n[Error] Table '{table}' generated an exception during extraction: {exc}")
                raise exc
                
    return results

def map_snowflake_to_databricks_type(sf_type: str) -> tuple[str, str]:
    """Maps a Snowflake column data type to corresponding Databricks Delta type and compatibility status."""
    st = sf_type.upper().strip()
    if "INT" in st or "NUMBER" in st or "DECIMAL" in st or "NUMERIC" in st:
        if "INT" in st or "SMALLINT" in st or "TINYINT" in st:
            return "BIGINT", "HIGH"
        return "DECIMAL(38,18)", "HIGH"
    elif "FLOAT" in st or "DOUBLE" in st or "REAL" in st:
        return "DOUBLE", "HIGH"
    elif "BOOL" in st:
        return "BOOLEAN", "HIGH"
    elif "DATE" in st:
        return "DATE", "HIGH"
    elif "TIME" in st:
        return "TIMESTAMP", "HIGH"
    elif "VARIANT" in st or "OBJECT" in st or "ARRAY" in st:
        return "STRING (JSON)", "MEDIUM"
    elif "BINARY" in st:
        return "BINARY", "HIGH"
    else:
        return "STRING", "HIGH"

def get_table_details(table_name: str, config=None, sample_limit: int = 5, lakebridge_service=None):
    """Fetches column schema, row counts, and sample data for a given Snowflake table."""
    conn = get_snowflake_connection(config)
    cursor = conn.cursor()
    try:
        # Row count
        cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
        row_count = cursor.fetchone()[0]

        # Column metadata
        cursor.execute(f"DESCRIBE TABLE {table_name};")
        desc_rows = cursor.fetchall()
        
        columns = []
        ddl_columns = []
        for col in desc_rows:
            col_name = str(col[0]).lower()
            sf_type = str(col[1])
            is_nullable = str(col[3]).upper() == "Y" if len(col) > 3 else True
            dbx_type, compat = map_snowflake_to_databricks_type(sf_type)
            
            columns.append({
                "name": col_name,
                "snowflake_type": sf_type,
                "databricks_type": dbx_type,
                "nullable": is_nullable,
                "compatibility": compat
            })
            ddl_columns.append(f"  `{col_name}` {dbx_type}")

        # Sample rows
        cursor.execute(f"SELECT * FROM {table_name} LIMIT {sample_limit};")
        sample_df = cursor.fetch_pandas_all()
        sample_df.columns = [c.lower() for c in sample_df.columns]
        sample_data = sample_df.fillna("").astype(str).to_dict(orient="records")

        target_db = (config.get("database") if config else "migration_db").lower()
        target_schema = (config.get("schema") if config else "source_data").lower()
        fallback_ddl = (
            f"CREATE TABLE IF NOT EXISTS `{target_db}`.`{target_schema}`.`{table_name.lower()}` (\n"
            + ",\n".join(ddl_columns)
            + "\n)\nUSING DELTA\nTBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');"
        )

        # Fetch the original Snowflake DDL so Lakebridge can transpile it
        snowflake_ddl = ""
        try:
            full_name = _full_name(config or SNOWFLAKE_CONFIG, table_name)
            cursor.execute(f"SELECT GET_DDL('TABLE', '{full_name}')")
            ddl_row = cursor.fetchone()
            snowflake_ddl = ddl_row[0] if ddl_row else ""
        except Exception:
            snowflake_ddl = ""

        # Lakebridge DDL conversion — falls back to the type-mapper DDL if unavailable
        lakebridge_result = None
        generated_ddl = fallback_ddl
        if lakebridge_service and snowflake_ddl:
            lakebridge_result = lakebridge_service.convert_sql_text(snowflake_ddl, table_name, "table")
            if lakebridge_result.target_definition:
                generated_ddl = lakebridge_result.target_definition

        return {
            "table_name": table_name,
            "row_count": row_count,
            "column_count": len(columns),
            "columns": columns,
            "sample_rows": sample_data,
            "snowflake_ddl": snowflake_ddl,
            "generated_ddl": generated_ddl,
            "target_table": f"`{target_db}`.`{target_schema}`.`{table_name.lower()}`",
            "lakebridge": lakebridge_result.__dict__ if lakebridge_result else None,
        }
    finally:
        cursor.close()
        conn.close()


def get_view_details(view_name: str, config=None, sample_limit: int = 5, lakebridge_service=None):
    """Fetches Snowflake view metadata and uses Lakebridge for SQL conversion when available."""
    config = config or SNOWFLAKE_CONFIG
    conn = get_snowflake_connection(config)
    cursor = conn.cursor()
    full_view = _full_name(config, view_name)
    try:
        definition = ""
        try:
            cursor.execute(f"SELECT GET_DDL('VIEW', '{full_view}')")
            row = cursor.fetchone()
            definition = row[0] if row else ""
        except Exception as e:
            definition = f"-- Unable to retrieve view DDL: {e}"

        cursor.execute(f"DESCRIBE VIEW {full_view};")
        desc_rows = cursor.fetchall()
        columns = []
        for col in desc_rows:
            col_name = str(col[0]).lower()
            sf_type = str(col[1])
            is_nullable = str(col[3]).upper() == "Y" if len(col) > 3 else True
            dbx_type, compat = map_snowflake_to_databricks_type(sf_type)
            columns.append({
                "name": col_name,
                "source_type": sf_type,
                "snowflake_type": sf_type,
                "databricks_type": dbx_type,
                "nullable": is_nullable,
                "compatibility": compat,
            })

        sample_data = []
        try:
            cursor.execute(f"SELECT * FROM {full_view} LIMIT {sample_limit};")
            sample_df = cursor.fetch_pandas_all()
            sample_df.columns = [c.lower() for c in sample_df.columns]
            sample_data = sample_df.fillna("").astype(str).to_dict(orient="records")
        except Exception:
            sample_data = []

        target_db = config.get("database", "migration_db").lower()
        target_schema = config.get("schema", "source_data").lower()
        fallback_ddl = (
            f"-- Databricks SQL View Equivalent\n"
            f"CREATE OR REPLACE VIEW `{target_db}`.`{target_schema}`.`{view_name.lower()}` AS\n"
            f"-- Source Definition:\n{definition}"
        )
        conversion = None
        generated_view_ddl = fallback_ddl
        if lakebridge_service and definition and not definition.startswith("-- Unable"):
            conversion = lakebridge_service.convert_sql_text(definition, view_name, "view")
            if conversion.target_definition:
                generated_view_ddl = conversion.target_definition

        return {
            "view_name": view_name,
            "column_count": len(columns),
            "columns": columns,
            "sample_rows": sample_data,
            "definition": definition,
            "generated_view_ddl": generated_view_ddl,
            "target_view": f"`{target_db}`.`{target_schema}`.`{view_name.lower()}`",
            "lakebridge": conversion.__dict__ if conversion else None,
        }
    finally:
        cursor.close()
        conn.close()


def get_procedure_details(proc_name: str, config=None, lakebridge_service=None):
    """Fetches Snowflake procedure source and uses Lakebridge conversion when available."""
    config = config or SNOWFLAKE_CONFIG
    conn = get_snowflake_connection(config)
    cursor = conn.cursor()
    database = config.get("database")
    schema = config.get("schema")
    try:
        cursor.execute(
            "SELECT PROCEDURE_NAME, ARGUMENT_SIGNATURE, DATA_TYPE, PROCEDURE_DEFINITION "
            "FROM INFORMATION_SCHEMA.PROCEDURES "
            "WHERE PROCEDURE_CATALOG = %s AND PROCEDURE_SCHEMA = %s AND PROCEDURE_NAME = %s",
            (database, schema, proc_name),
        )
        rows = cursor.fetchall()
        source_code = rows[0][3] if rows else ""
        signature = rows[0][1] if rows else ""
        return_type = rows[0][2] if rows else ""
        if not source_code:
            source_code = "-- Snowflake did not return procedure source through INFORMATION_SCHEMA.PROCEDURES."

        fallback = (
            f"/* Databricks procedural translation recommendation for: {proc_name} */\n"
            f"-- Source signature: {proc_name}{signature}\n"
            f"-- Source return type: {return_type}\n"
            f"-- Review and convert this Snowflake procedure into Databricks SQL scripting, a Python task, or a notebook workflow.\n"
        )
        conversion = None
        recommendation = fallback
        if lakebridge_service and source_code and not source_code.startswith("-- Snowflake did not"):
            conversion = lakebridge_service.convert_sql_text(source_code, proc_name, "procedure")
            if conversion.target_definition:
                recommendation = conversion.target_definition

        return {
            "procedure_name": proc_name,
            "parameter_count": 0,
            "parameters": [],
            "source_code": source_code,
            "recommendation": recommendation,
            "lakebridge": conversion.__dict__ if conversion else None,
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
