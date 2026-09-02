from .config import STAGING_VOLUME_PATH, VOLUME_CATALOG, VOLUME_SCHEMA, VOLUME_NAME


def determine_target_catalog_and_schema(sf_database=None, sf_schema=None):
    catalog = (sf_database or VOLUME_CATALOG).lower()
    schema = (sf_schema or VOLUME_SCHEMA).lower()
    return catalog, schema


def execute_sql(workspace_client, warehouse_id, sql_statement):
    """Executes a SQL statement on the Databricks SQL Warehouse and logs details on error."""
    response = workspace_client.statement_execution.execute_statement(
        statement=sql_statement,
        warehouse_id=warehouse_id,
        wait_timeout="50s"
    )
    if response.status.state.value == "FAILED":
        error_msg = response.status.error.message if response.status.error else "Unknown SQL error"
        print(f"\n[SQL Execution Failed]: {error_msg}")
    return response


def ensure_unity_catalog_hierarchy(workspace_client, warehouse_id, sf_database=None, sf_schema=None):
    """Ensures that the target catalog, schema, and staging volume exist in Databricks Unity Catalog."""
    target_catalog, target_schema = determine_target_catalog_and_schema(sf_database, sf_schema)
    print(f"\n--- Verifying Unity Catalog Hierarchy for {target_catalog}.{target_schema} ---")

    create_catalog_sql = f"CREATE CATALOG IF NOT EXISTS {target_catalog};"
    res_catalog = execute_sql(workspace_client, warehouse_id, create_catalog_sql)
    if res_catalog.status.state.value == "SUCCEEDED":
        print(f"Catalog '{target_catalog}' verified/created successfully!")

    create_schema_sql = f"CREATE SCHEMA IF NOT EXISTS {target_catalog}.{target_schema};"
    res_schema = execute_sql(workspace_client, warehouse_id, create_schema_sql)
    if res_schema.status.state.value == "SUCCEEDED":
        print(f"Schema '{target_catalog}.{target_schema}' verified/created successfully!")

    create_volume_sql = f"CREATE VOLUME IF NOT EXISTS {target_catalog}.{target_schema}.{VOLUME_NAME};"
    res_vol = execute_sql(workspace_client, warehouse_id, create_volume_sql)
    if res_vol.status.state.value == "SUCCEEDED":
        print(f"Volume '{target_catalog}.{target_schema}.{VOLUME_NAME}' verified/created successfully!")

    volume_root = f"/Volumes/{target_catalog}/{target_schema}/{VOLUME_NAME}"
    return volume_root


def upload_parquet_to_volume(workspace_client, local_file_path, table_name, volume_root=None):
    """Uploads the local Parquet file directly to Unity Catalog Volume via Databricks Files API."""
    volume_root = volume_root or STAGING_VOLUME_PATH
    volume_file_path = f"{volume_root}/{table_name}.parquet"
    print(f"\n--- [2/3] UPLOADING TO DATABRICKS VOLUME: {volume_file_path} ---")

    with open(local_file_path, "rb") as f:
        workspace_client.files.upload(file_path=volume_file_path, contents=f, overwrite=True)

    print("File uploaded successfully to Unity Catalog Volume!")
    return volume_file_path

def load_via_copy_into(workspace_client, warehouse_id, sf_database, sf_schema, payload, volume_file_path):
    """Loads Parquet into Databricks Delta using dynamic COPY INTO with auto-derived schema."""
    target_catalog = sf_database.lower()
    target_schema = sf_schema.lower()
    target_table = payload["table_name"]
    full_table_path = f"{target_catalog}.{target_schema}.{target_table}"

    print(f"\n--- [3/3] BULK LOADING VIA COPY INTO: {full_table_path} ---")

    execute_sql(workspace_client, warehouse_id, f"DROP TABLE IF EXISTS {full_table_path};")

    create_table_sql = f"""
    CREATE TABLE {full_table_path}
    USING DELTA
    AS SELECT * FROM parquet.`{volume_file_path}` WHERE 1=0;
    """
    execute_sql(workspace_client, warehouse_id, create_table_sql)

    copy_into_sql = f"""
    COPY INTO {full_table_path}
    FROM '{volume_file_path}'
    FILEFORMAT = PARQUET
    FORMAT_OPTIONS ('mergeSchema' = 'true')
    COPY_OPTIONS ('force' = 'true');
    """
    
    res = execute_sql(workspace_client, warehouse_id, copy_into_sql)
    if res.status.state.value == "SUCCEEDED":
        print(f"Bulk ingestion completed successfully for {full_table_path}!")