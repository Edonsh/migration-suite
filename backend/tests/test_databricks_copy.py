from types import SimpleNamespace

from backend.migration_engine.databricks_client import load_via_copy_into


class FakeStatementExecution:
    def __init__(self):
        self.kwargs = None
        self.rows = []

    def execute_statement(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(
            status=SimpleNamespace(
                state=SimpleNamespace(value="SUCCEEDED"),
                error=None,
            ),
            result=SimpleNamespace(data_array=self.rows),
        )


class FakeWorkspaceClient:
    def __init__(self):
        self.statement_execution = FakeStatementExecution()


def test_copy_into_uses_target_schema_without_parquet_schema_evolution():
    workspace = FakeWorkspaceClient()

    load_via_copy_into(
        workspace,
        "warehouse-id",
        "GMIGRATE_TEST",
        "TEST_SCHEMA",
        {"table_name": "customers"},
        "/Volumes/gmigrate_test/test_schema/staging_volume/customers.parquet",
    )

    sql = workspace.statement_execution.kwargs["statement"]
    assert "COPY INTO `gmigrate_test`.`test_schema`.`customers`" in sql
    assert "FILEFORMAT = PARQUET" in sql
    assert "mergeSchema" not in sql
    assert "COPY_OPTIONS ('force' = 'true')" in sql


def test_get_delta_table_columns_reads_target_names_and_types():
    from backend.migration_engine.databricks_client import get_delta_table_columns

    workspace = FakeWorkspaceClient()
    workspace.statement_execution.rows = [
        ["CUSTOMER_ID", "decimal(38,0)", None],
        ["FIRST_NAME", "varchar(100)", None],
        ["# Partition Information", "", ""],
    ]

    columns = get_delta_table_columns(
        workspace,
        "warehouse-id",
        "GMIGRATE_TEST",
        "TEST_SCHEMA",
        "CUSTOMERS",
    )

    assert columns == [
        {"name": "CUSTOMER_ID", "type": "decimal(38,0)"},
        {"name": "FIRST_NAME", "type": "varchar(100)"},
    ]
    assert workspace.statement_execution.kwargs["statement"] == (
        "DESCRIBE TABLE `gmigrate_test`.`test_schema`.`CUSTOMERS`"
    )
