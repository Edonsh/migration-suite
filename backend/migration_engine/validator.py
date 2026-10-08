from .config import SNOWFLAKE_CONFIG, DATABRICKS_WAREHOUSE_ID
from .snowflake_client import get_snowflake_connection


def validate_migrated_tables(workspace_client, selected_tables, snowflake_config=None, databricks_warehouse_id=None):
    """Compares row counts between Snowflake source tables and Databricks target tables.
    Returns structured results dictionary suitable for UI rendering.
    """
    sf_cfg = snowflake_config or SNOWFLAKE_CONFIG
    wh_id = databricks_warehouse_id or DATABRICKS_WAREHOUSE_ID

    database = sf_cfg.get("database", "")
    schema = sf_cfg.get("schema", "")
    sf_conn = get_snowflake_connection(sf_cfg)
    sf_cursor = sf_conn.cursor()

    target_catalog = (database or "migration_db").lower()
    target_schema = (schema or "source_data").lower()

    table_results = []
    total_td_rows = 0
    total_dbx_rows = 0
    all_passed = True

    try:
        for original_table_name in selected_tables:
            table_name_lower = original_table_name.lower()
            full_dbx_table = f"`{target_catalog}`.`{target_schema}`.`{table_name_lower}`"
            full_source_table = f"{database}.{schema}.{original_table_name}" if database and schema else original_table_name

            # 1. Source row count (Snowflake)
            source_count = -1
            try:
                sf_cursor.execute(f"SELECT COUNT(*) FROM {full_source_table};")
                source_count = sf_cursor.fetchone()[0]
            except Exception as e:
                pass  # source_count stays -1

            # 2. Target row count (Databricks)
            dbx_count = 0
            dbx_error = None
            try:
                dbx_sql = f"SELECT COUNT(*) FROM {full_dbx_table};"
                dbx_response = workspace_client.statement_execution.execute_statement(
                    statement=dbx_sql,
                    warehouse_id=wh_id,
                    wait_timeout="30s",
                )
                if dbx_response.status.state.value == "SUCCEEDED":
                    result_data = dbx_response.result.data_array
                    if result_data and len(result_data) > 0:
                        dbx_count = int(result_data[0][0])
                else:
                    dbx_error = dbx_response.status.error.message if dbx_response.status.error else "Execution failed"
            except Exception as e:
                dbx_error = str(e)

            diff = abs(source_count - dbx_count) if (source_count >= 0 and dbx_error is None) else -1
            is_passed = (diff == 0 and dbx_error is None and source_count >= 0)
            if not is_passed:
                all_passed = False

            if source_count > 0:
                total_td_rows += source_count
            if dbx_count > 0:
                total_dbx_rows += dbx_count

            match_pct = (
                100.0 if is_passed
                else (round((min(source_count, dbx_count) / max(source_count, dbx_count, 1)) * 100, 1)
                      if (source_count > 0 and dbx_count > 0) else 0.0)
            )

            table_results.append({
                "table_name": original_table_name,
                "target_table": full_dbx_table,
                "source_rows": source_count,
                "databricks_rows": dbx_count,
                "difference": diff,
                "status": "PASSED" if is_passed else "FAILED",
                "match_percentage": match_pct,
                "error": dbx_error,
            })

    finally:
        sf_cursor.close()
        sf_conn.close()

    total_diff = abs(total_td_rows - total_dbx_rows)
    overall_match_rate = (
        100.0 if all_passed
        else (round((min(total_td_rows, total_dbx_rows) / max(total_td_rows, total_dbx_rows, 1)) * 100, 1)
              if total_td_rows > 0 else 0.0)
    )

    return {
        "status": "PASSED" if all_passed else "FAILED",
        "overall_match_rate": overall_match_rate,
        "total_tables": len(selected_tables),
        "passed_tables": sum(1 for t in table_results if t["status"] == "PASSED"),
        "failed_tables": sum(1 for t in table_results if t["status"] == "FAILED"),
        "total_source_rows": total_td_rows,
        "total_target_rows": total_dbx_rows,
        "total_difference": total_diff,
        "tables": table_results,
    }
