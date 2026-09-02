import os
import concurrent.futures
import snowflake.connector
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from .config import SNOWFLAKE_CONFIG

def get_snowflake_connection(config=None):
    """Establishes a connection to Snowflake."""
    return snowflake.connector.connect(**(config or SNOWFLAKE_CONFIG))

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

def get_table_details(table_name: str, config=None, sample_limit: int = 5):
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
            "target_table": f"`{target_db}`.`{target_schema}`.`{table_name.lower()}`"
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
