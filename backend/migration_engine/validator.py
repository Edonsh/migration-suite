from .config import SNOWFLAKE_CONFIG, DATABRICKS_WAREHOUSE_ID
from .snowflake_client import get_snowflake_connection

def validate_migrated_tables(workspace_client, selected_tables):
    """Compares row counts between Snowflake source tables and Databricks target tables."""
    print("\n==================================================")
    print("      POST-MIGRATION RECONCILIATION REPORT        ")
    print("==================================================")

    sf_conn = get_snowflake_connection()
    sf_cursor = sf_conn.cursor()

    target_catalog = SNOWFLAKE_CONFIG["database"].lower()
    target_schema = SNOWFLAKE_CONFIG["schema"].lower()

    all_passed = True

    try:
        for original_table_name in selected_tables:
            table_name_lower = original_table_name.lower()
            full_dbx_table = f"{target_catalog}.{target_schema}.{table_name_lower}"

            sf_cursor.execute(f"SELECT COUNT(*) FROM {original_table_name};")
            sf_count = sf_cursor.fetchone()[0]

            dbx_sql = f"SELECT COUNT(*) FROM {full_dbx_table};"
            dbx_response = workspace_client.statement_execution.execute_statement(
                statement=dbx_sql,
                warehouse_id=DATABRICKS_WAREHOUSE_ID,
                wait_timeout="30s"
            )

            dbx_count = 0
            if dbx_response.status.state.value == "SUCCEEDED":
                result_data = dbx_response.result.data_array
                if result_data and len(result_data) > 0:
                    dbx_count = int(result_data[0][0])

            diff = abs(sf_count - dbx_count)
            status = "PASSED" if diff == 0 else "FAILED"
            if status == "FAILED":
                all_passed = False

            status_flag = "[✓]" if status == "PASSED" else "[X]"
            print(f"\n{status_flag} Table: {original_table_name}")
            print(f"    ├─ Snowflake Rows:  {sf_count:,}")
            print(f"    ├─ Databricks Rows: {dbx_count:,}")
            print(f"    └─ Difference:      {diff:,} rows (Status: {status})")

    finally:
        sf_cursor.close()
        sf_conn.close()

    print("\n==================================================")
    if all_passed:
        print(" ALL TABLES VALIDATED WITH 100% MATCH! ")
    else:
        print(" WARNING: ONE OR MORE TABLES HAD ROW COUNT MISMATCHES! ")
    print("==================================================")