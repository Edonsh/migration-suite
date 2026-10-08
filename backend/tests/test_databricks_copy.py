from types import SimpleNamespace

from backend.migration_engine.databricks_client import load_via_copy_into


class FakeStatementExecution:
    def __init__(self):
        self.kwargs = None

    def execute_statement(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(
            status=SimpleNamespace(
                state=SimpleNamespace(value="SUCCEEDED"),
                error=None,
            )
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
