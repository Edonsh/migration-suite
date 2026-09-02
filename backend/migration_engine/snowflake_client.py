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
        
        print(f"Staged {len(df)} rows into local Parquet file: {parquet_file_path}")
        return {"table_name": table_name.lower(), "local_parquet_path": parquet_file_path}
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
