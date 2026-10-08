import sys
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


class FakeCursor:
    def __init__(self):
        self.query = None
        self.description = [("CUSTOMER_ID",), ("FIRST_NAME",)]
        self.closed = False

    def execute(self, query):
        self.query = query

    def fetch_pandas_all(self):
        return pd.DataFrame({"customer_id": [101, 102], "first_name": ["Ada", "Lin"]})

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self):
        self.fake_cursor = FakeCursor()
        self.closed = False

    def cursor(self):
        return self.fake_cursor

    def close(self):
        self.closed = True


def test_extract_preserves_snowflake_column_case_in_parquet(tmp_path, monkeypatch):
    from backend.migration_engine import snowflake_client

    connection = FakeConnection()
    monkeypatch.setattr(snowflake_client, "get_snowflake_connection", lambda config: connection)

    payload = snowflake_client.extract_and_stage_parquet(
        "CUSTOMERS",
        {"database": "GMIGRATE_TEST", "schema": "TEST_SCHEMA"},
        local_staging_dir=str(tmp_path),
        target_columns=[
            {"name": "CUSTOMER_ID", "type": "decimal(38,0)"},
            {"name": "FIRST_NAME", "type": "varchar(100)"},
        ],
    )

    parquet = pq.read_table(payload["local_parquet_path"])
    assert payload["row_count"] == 2
    assert parquet.column_names == ["CUSTOMER_ID", "FIRST_NAME"]
    assert str(parquet.schema.field("CUSTOMER_ID").type) == "decimal128(38, 0)"
    assert connection.fake_cursor.query == "SELECT * FROM GMIGRATE_TEST.TEST_SCHEMA.CUSTOMERS;"
    assert connection.fake_cursor.closed
    assert connection.closed
