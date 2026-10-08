from .config import STAGING_VOLUME_PATH, VOLUME_CATALOG, VOLUME_SCHEMA, VOLUME_NAME


TERMINAL_FAILURE_STATES = {"FAILED", "CANCELED", "CLOSED"}


def quote_identifier(identifier):
    return f"`{str(identifier).replace('`', '``')}`"


def qualified_name(*parts):
    return ".".join(quote_identifier(part) for part in parts if part)


def determine_target_catalog_and_schema(sf_database=None, sf_schema=None):
    catalog = (sf_database or VOLUME_CATALOG).lower()
    schema = (sf_schema or VOLUME_SCHEMA).lower()
    return catalog, schema


def execute_sql(workspace_client, warehouse_id, sql_statement, catalog=None, schema=None):
    """Execute SQL and fail fast on Databricks SQL errors."""
    kwargs = {
        "statement": sql_statement,
        "warehouse_id": warehouse_id,
        "wait_timeout": "50s",
    }
    if catalog:
        kwargs["catalog"] = catalog
    if schema:
        kwargs["schema"] = schema

    response = workspace_client.statement_execution.execute_statement(**kwargs)
    state = response.status.state.value if response.status and response.status.state else "UNKNOWN"
    if state in TERMINAL_FAILURE_STATES:
        error_msg = response.status.error.message if response.status and response.status.error else "Unknown SQL error"
        raise RuntimeError(f"Databricks SQL {state}: {error_msg}")
    return response


def ensure_unity_catalog_hierarchy(workspace_client, warehouse_id, sf_database=None, sf_schema=None):
    """Ensures that the target catalog, schema, and staging volume exist in Databricks Unity Catalog."""
    target_catalog, target_schema = determine_target_catalog_and_schema(sf_database, sf_schema)
    print(f"\n--- Verifying Unity Catalog Hierarchy for {target_catalog}.{target_schema} ---")

    create_catalog_sql = f"CREATE CATALOG IF NOT EXISTS {quote_identifier(target_catalog)};"
    res_catalog = execute_sql(workspace_client, warehouse_id, create_catalog_sql)
    if res_catalog.status.state.value == "SUCCEEDED":
        print(f"Catalog '{target_catalog}' verified/created successfully!")

    create_schema_sql = f"CREATE SCHEMA IF NOT EXISTS {qualified_name(target_catalog, target_schema)};"
    res_schema = execute_sql(workspace_client, warehouse_id, create_schema_sql)
    if res_schema.status.state.value == "SUCCEEDED":
        print(f"Schema '{target_catalog}.{target_schema}' verified/created successfully!")

    create_volume_sql = f"CREATE VOLUME IF NOT EXISTS {qualified_name(target_catalog, target_schema, VOLUME_NAME)};"
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


def get_delta_table_columns(workspace_client, warehouse_id, sf_database, sf_schema, table_name):
    """Return the existing target Delta table's column names and Spark SQL types."""
    target_catalog, target_schema = determine_target_catalog_and_schema(sf_database, sf_schema)
    table_path = qualified_name(target_catalog, target_schema, table_name)
    response = execute_sql(
        workspace_client,
        warehouse_id,
        f"DESCRIBE TABLE {table_path}",
        catalog=target_catalog,
        schema=target_schema,
    )
    rows = response.result.data_array if response.result else []
    columns = [
        {"name": row[0], "type": row[1]}
        for row in rows
        if len(row) >= 2 and row[0] and not str(row[0]).startswith("#")
    ]
    if not columns:
        raise RuntimeError(f"Target Delta table {table_path} has no readable columns.")
    return columns


def load_via_copy_into(workspace_client, warehouse_id, sf_database, sf_schema, payload, volume_file_path):
    """Load Parquet into a Lakebridge-created Databricks Delta table."""
    target_catalog, target_schema = determine_target_catalog_and_schema(sf_database, sf_schema)
    target_table = payload["table_name"]
    full_table_path = qualified_name(target_catalog, target_schema, target_table)

    print(f"\n--- [3/3] BULK LOADING VIA COPY INTO: {full_table_path} ---")

    copy_into_sql = f"""
    COPY INTO {full_table_path}
    FROM '{volume_file_path}'
    FILEFORMAT = PARQUET
    COPY_OPTIONS ('force' = 'true');
    """
    
    res = execute_sql(workspace_client, warehouse_id, copy_into_sql)
    if res.status.state.value == "SUCCEEDED":
        print(f"Bulk ingestion completed successfully for {full_table_path}!")
