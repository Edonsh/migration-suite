import os
import concurrent.futures
import teradatasql
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from .config import TERADATA_CONFIG

# Teradata ColumnType codes -> human readable SQL type names
TERADATA_TYPE_MAP = {
    "I": "INTEGER", "I1": "BYTEINT", "I2": "SMALLINT", "I8": "BIGINT",
    "D": "DECIMAL", "N": "NUMBER", "F": "FLOAT", "BF": "BYTE",
    "BV": "VARBYTE", "CF": "CHAR", "CV": "VARCHAR", "DA": "DATE",
    "AT": "TIME", "TS": "TIMESTAMP", "BO": "BLOB", "CO": "CLOB",
    "JN": "JSON", "XM": "XML", "SZ": "TIMESTAMP WITH TIME ZONE",
    "PM": "PERIOD(DATE)", "PS": "PERIOD(TIMESTAMP)",
}


def get_teradata_connection(config=None):
    """Establishes a connection to Teradata."""
    cfg = config or TERADATA_CONFIG
    return teradatasql.connect(
        host=cfg["host"],
        user=cfg["user"],
        password=cfg["password"],
        database=cfg.get("database", ""),
        logmech=cfg.get("logmech", "TD2"),
    )


def discover_teradata_tables(config=None):
    """Queries Teradata DBC metadata to get a list of all base tables in the database."""
    config = config or TERADATA_CONFIG
    if not config.get("database"):
        raise ValueError("Teradata database is required.")

    database = config["database"]
    print(f"\n--- Discovering tables in {database} ---")
    conn = get_teradata_connection(config)
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT TableName FROM DBC.TablesV WHERE DatabaseName = ? AND TableKind = 'T' ORDER BY TableName;",
            (database,),
        )
        results = cursor.fetchall()
        tables = [row[0].strip() for row in results]
        return tables
    finally:
        cursor.close()
        conn.close()


def discover_teradata_all_objects(config=None):
    """Queries Teradata DBC metadata to discover tables, views, and stored procedures."""
    config = config or TERADATA_CONFIG
    if not config.get("database"):
        raise ValueError("Teradata database is required.")

    database = config["database"]
    print(f"\n--- Discovering all objects in {database} ---")
    conn = get_teradata_connection(config)
    cursor = conn.cursor()

    try:
        # Base Tables
        cursor.execute(
            "SELECT TableName FROM DBC.TablesV WHERE DatabaseName = ? AND TableKind = 'T' ORDER BY TableName;",
            (database,),
        )
        tables = [row[0].strip() for row in cursor.fetchall()]

        # Views
        cursor.execute(
            "SELECT TableName FROM DBC.TablesV WHERE DatabaseName = ? AND TableKind = 'V' ORDER BY TableName;",
            (database,),
        )
        views = [row[0].strip() for row in cursor.fetchall()]

        # Stored Procedures
        cursor.execute(
            "SELECT TableName FROM DBC.TablesV WHERE DatabaseName = ? AND TableKind = 'P' ORDER BY TableName;",
            (database,),
        )
        procedures = [row[0].strip() for row in cursor.fetchall()]

        return {
            "database": database,
            "tables": tables,
            "views": views,
            "procedures": procedures,
        }
    finally:
        cursor.close()
        conn.close()


def extract_and_stage_parquet(table_name, config=None, local_staging_dir="./staging"):
    """Extracts Teradata data, sanitizes PyArrow types/metadata, and stages a Parquet file."""
    print(f"\n--- [1/3] EXTRACTING & STAGING PARQUET: {table_name} ---")
    os.makedirs(local_staging_dir, exist_ok=True)

    config = config or TERADATA_CONFIG
    database = config.get("database", "")
    full_table = f"{database}.{table_name}" if database else table_name

    conn = get_teradata_connection(config)
    cursor = conn.cursor()

    try:
        cursor.execute(f"SELECT * FROM {full_table};")
        columns = [desc[0].lower() for desc in cursor.description]
        rows = cursor.fetchall()
        df = pd.DataFrame(rows, columns=columns)

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
            elif "timestamp" in str_type or "time" in str_type:
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
            "row_count": row_count,
        }
    finally:
        cursor.close()
        conn.close()


def extract_tables_in_parallel(selected_tables, config=None, max_workers=4):
    """Extracts and stages multiple Teradata tables in parallel using a thread pool."""
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


def map_teradata_to_databricks_type(td_type: str) -> tuple[str, str]:
    """Maps a Teradata column data type to corresponding Databricks Delta type and compatibility status."""
    st = td_type.upper().strip()
    if any(k in st for k in ("BYTEINT", "SMALLINT", "INTEGER", "BIGINT")):
        return "BIGINT", "HIGH"
    elif any(k in st for k in ("DECIMAL", "NUMERIC", "NUMBER")):
        return "DECIMAL(38,18)", "HIGH"
    elif any(k in st for k in ("FLOAT", "REAL", "DOUBLE")):
        return "DOUBLE", "HIGH"
    elif "BOOLEAN" in st:
        return "BOOLEAN", "HIGH"
    elif "DATE" == st:
        return "DATE", "HIGH"
    elif "TIME" in st or "TIMESTAMP" in st:
        return "TIMESTAMP", "HIGH"
    elif any(k in st for k in ("BLOB", "BYTE", "VARBYTE")):
        return "BINARY", "MEDIUM"
    elif any(k in st for k in ("CLOB", "JSON", "XML")):
        return "STRING", "MEDIUM"
    else:
        return "STRING", "HIGH"


def get_table_details(table_name: str, config=None, sample_limit: int = 5):
    """Fetches column schema, row counts, and sample data for a given Teradata table."""
    config = config or TERADATA_CONFIG
    database = config.get("database", "")
    full_table = f"{database}.{table_name}" if database else table_name

    conn = get_teradata_connection(config)
    cursor = conn.cursor()

    try:
        # Row count
        cursor.execute(f"SELECT COUNT(*) FROM {full_table};")
        row_count = cursor.fetchone()[0]

        # Column metadata via DBC
        cursor.execute(
            "SELECT ColumnName, ColumnType, Nullable FROM DBC.ColumnsV "
            "WHERE DatabaseName = ? AND TableName = ? ORDER BY ColumnId;",
            (database, table_name),
        )
        desc_rows = cursor.fetchall()

        columns = []
        ddl_columns = []
        for col in desc_rows:
            col_name = str(col[0]).strip().lower()
            raw_type = str(col[1]).strip()
            td_type = TERADATA_TYPE_MAP.get(raw_type, raw_type)
            is_nullable = str(col[2]).upper() == "Y" if len(col) > 2 else True
            dbx_type, compat = map_teradata_to_databricks_type(td_type)

            columns.append({
                "name": col_name,
                "source_type": td_type,
                "databricks_type": dbx_type,
                "nullable": is_nullable,
                "compatibility": compat,
            })
            ddl_columns.append(f"  `{col_name}` {dbx_type}")

        # Sample rows
        cursor.execute(f"SELECT TOP {sample_limit} * FROM {full_table};")
        col_names = [desc[0].lower() for desc in cursor.description]
        sample_rows_raw = cursor.fetchall()
        sample_data = [
            {col_names[i]: str(v) if v is not None else "" for i, v in enumerate(row)}
            for row in sample_rows_raw
        ]

        target_db = (config.get("database") or "migration_db").lower()
        target_schema = (config.get("schema") or "source_data").lower()
        generated_ddl = (
            f"CREATE TABLE IF NOT EXISTS `{target_db}`.`{target_schema}`.`{table_name.lower()}` (\n"
            + ",\n".join(ddl_columns)
            + "\n)\nUSING DELTA\nTBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');"
        )

        return {
            "table_name": table_name,
            "row_count": row_count,
            "column_count": len(columns),
            "columns": columns,
            "sample_rows": sample_data,
            "generated_ddl": generated_ddl,
            "target_table": f"`{target_db}`.`{target_schema}`.`{table_name.lower()}`",
        }
    finally:
        cursor.close()
        conn.close()


def get_view_details(view_name: str, config=None, sample_limit: int = 5):
    """Fetches SQL definition, column schema, and sample data for a given Teradata view (View-Only inspection)."""
    config = config or TERADATA_CONFIG
    database = config.get("database", "")
    full_view = f"{database}.{view_name}" if database else view_name

    conn = get_teradata_connection(config)
    cursor = conn.cursor()

    try:
        # 1. Fetch View Definition from SHOW VIEW
        definition = ""
        try:
            cursor.execute(f"SHOW VIEW {full_view};")
            definition = "\n".join(str(r[0]) for r in cursor.fetchall()).strip()
        except Exception as e:
            definition = f"-- Unable to retrieve view DDL: {e}"

        # 2. Fetch Columns metadata
        cursor.execute(
            "SELECT ColumnName, ColumnType, Nullable FROM DBC.ColumnsV "
            "WHERE DatabaseName = ? AND TableName = ? ORDER BY ColumnId;",
            (database, view_name),
        )
        desc_rows = cursor.fetchall()

        columns = []
        for col in desc_rows:
            col_name = str(col[0]).strip().lower()
            raw_type = str(col[1]).strip()
            td_type = TERADATA_TYPE_MAP.get(raw_type, raw_type)
            is_nullable = str(col[2]).upper() == "Y" if len(col) > 2 else True
            dbx_type, compat = map_teradata_to_databricks_type(td_type)

            columns.append({
                "name": col_name,
                "source_type": td_type,
                "databricks_type": dbx_type,
                "nullable": is_nullable,
                "compatibility": compat,
            })

        # 3. Sample rows
        sample_data = []
        try:
            cursor.execute(f"SELECT TOP {sample_limit} * FROM {full_view};")
            col_names = [desc[0].lower() for desc in cursor.description]
            sample_rows_raw = cursor.fetchall()
            sample_data = [
                {col_names[i]: str(v) if v is not None else "" for i, v in enumerate(row)}
                for row in sample_rows_raw
            ]
        except Exception:
            sample_data = []

        target_db = (config.get("database") or "migration_db").lower()
        target_schema = (config.get("schema") or "source_data").lower()

        # Clean definition for Databricks view equivalent
        databricks_view_ddl = (
            f"-- Databricks SQL View Equivalent\n"
            f"CREATE OR REPLACE VIEW `{target_db}`.`{target_schema}`.`{view_name.lower()}` AS\n"
            f"-- Source Definition:\n{definition}"
        )

        return {
            "view_name": view_name,
            "column_count": len(columns),
            "columns": columns,
            "sample_rows": sample_data,
            "definition": definition,
            "generated_view_ddl": databricks_view_ddl,
            "target_view": f"`{target_db}`.`{target_schema}`.`{view_name.lower()}`",
        }
    finally:
        cursor.close()
        conn.close()


def get_procedure_details(proc_name: str, config=None):
    """Fetches SPL source code and parameter metadata for a Teradata stored procedure (View-Only inspection)."""
    config = config or TERADATA_CONFIG
    database = config.get("database", "")
    full_proc = f"{database}.{proc_name}" if database else proc_name

    conn = get_teradata_connection(config)
    cursor = conn.cursor()

    try:
        # 1. Fetch Source Code from SHOW PROCEDURE
        source_code = ""
        try:
            cursor.execute(f"SHOW PROCEDURE {full_proc};")
            source_code = "\n".join(str(r[0]) for r in cursor.fetchall()).strip()
        except Exception as e:
            source_code = f"-- Unable to retrieve procedure source code: {e}"

        # 2. Fetch Parameters via HELP PROCEDURE
        parameters = []
        try:
            cursor.execute(f"HELP PROCEDURE {full_proc};")
            desc = [d[0].lower() for d in cursor.description]
            for r in cursor.fetchall():
                row_dict = dict(zip(desc, r))
                ptype = str(row_dict.get('parameter type', '')).strip().upper()
                direction = {"I": "IN", "O": "OUT", "B": "INOUT"}.get(ptype, ptype or "IN")
                pname = (
                    str(row_dict.get('parameter sql name', '')).strip()
                    or str(row_dict.get('parameter name', '')).strip()
                )
                raw_type = str(row_dict.get('type', '')).strip()
                td_type = TERADATA_TYPE_MAP.get(raw_type, raw_type)
                dbx_type, _ = map_teradata_to_databricks_type(td_type)

                parameters.append({
                    "name": pname,
                    "direction": direction,
                    "source_type": td_type,
                    "databricks_type": dbx_type,
                })
        except Exception as e:
            print(f"Warning: HELP PROCEDURE failed for {proc_name}: {e}")

        # Databricks Migration recommendation
        dbx_recommendation = (
            f"/* Databricks Procedural Translation Recommendation for: {proc_name} */\n"
            f"-- Teradata Stored Procedures are procedural logic (SPL).\n"
            f"-- On Databricks, convert this logic into:\n"
            f"-- 1) Databricks SQL Scripting / Stored Procedure (CREATE OR REPLACE PROCEDURE)\n"
            f"-- 2) A PySpark Notebook / Python Task in Databricks Workflows\n"
            f"-- 3) A Databricks SQL Python UDF if returning computed values\n\n"
            f"-- Suggested Databricks SQL Procedure stub:\n"
            f"CREATE OR REPLACE PROCEDURE `{proc_name.lower()}`("
            + ", ".join(f"{p['direction']} {p['name']} {p['databricks_type']}" for p in parameters)
            + ")\nLANGUAGE SQL\nBEGIN\n"
            f"  -- Translate SPL logic here\n"
            f"END;\n"
        )

        return {
            "procedure_name": proc_name,
            "parameter_count": len(parameters),
            "parameters": parameters,
            "source_code": source_code,
            "recommendation": dbx_recommendation,
        }
    finally:
        cursor.close()
        conn.close()


def test_teradata_connection(config=None):
    """Tests connection to Teradata and returns latency, version, and session info."""
    import time
    start_time = time.time()
    conn = get_teradata_connection(config)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT InfoData FROM DBC.DBCInfo WHERE InfoKey = 'VERSION';")
        row = cursor.fetchone()
        latency_ms = round((time.time() - start_time) * 1000, 2)
        return {
            "status": "connected",
            "latency_ms": latency_ms,
            "version": row[0].strip() if row else "Unknown",
            "host": (config or TERADATA_CONFIG).get("host", ""),
            "database": (config or TERADATA_CONFIG).get("database", ""),
        }
    finally:
        cursor.close()
        conn.close()
