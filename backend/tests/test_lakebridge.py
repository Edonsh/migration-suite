"""
Lakebridge integration tests for GMigrate.

Test layers
-----------
* No mark       unit tests, always runnable (no external connections required).
* @pytest.mark.integration  require live Snowflake credentials AND Lakebridge CLI.
  These tests are skipped gracefully when either is unavailable.

Running
-------
Unit only (fast, always passes in CI):
    pytest backend/tests/test_lakebridge.py -m "not integration" -v

Full integration (requires credentials in backend/.env):
    pytest backend/tests/test_lakebridge.py -v
"""
import os
import sys
import pytest

# Make the workspace root importable
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[2]))

# ---------- helpers -----------------------------------------------------------

def _bootstrap_env():
    os.environ.setdefault("DATABRICKS_HOST", "https://fake.databricks.com")
    os.environ.setdefault("DATABRICKS_TOKEN", "fake-token")


def _reload_config():
    import importlib
    import backend.migration_engine.config as cfg
    importlib.reload(cfg)


def _gmigrate_test_config() -> dict:
    _bootstrap_env()
    _reload_config()
    import backend.migration_engine.config as cfg
    base = dict(cfg.SNOWFLAKE_CONFIG)
    base["database"] = os.environ.get("INTEGRATION_SNOWFLAKE_DATABASE", "GMIGRATE_TEST")
    base["schema"] = os.environ.get("INTEGRATION_SNOWFLAKE_SCHEMA", "TEST_SCHEMA")
    return {k: v for k, v in base.items() if v}


def _snowflake_reachable(config: dict) -> bool:
    try:
        from backend.migration_engine.snowflake_client import test_snowflake_connection
        test_snowflake_connection(config)
        return True
    except Exception:
        return False


def _lakebridge_available() -> bool:
    _bootstrap_env()
    from backend.migration_engine.lakebridge.client import LakebridgeClient
    return LakebridgeClient().availability().available


# ---------- unit: secret safety -----------------------------------------------

class TestSecretSafety:

    def setup_method(self):
        _bootstrap_env()

    def test_safe_env_removes_snowflake_password(self):
        os.environ["SNOWFLAKE_PASSWORD"] = "hunter2_supersecret"
        try:
            from backend.migration_engine.lakebridge.client import LakebridgeClient
            env = LakebridgeClient()._safe_env()
            assert "SNOWFLAKE_PASSWORD" not in env
        finally:
            os.environ.pop("SNOWFLAKE_PASSWORD", None)

    def test_safe_env_removes_snowflake_token(self):
        os.environ["SNOWFLAKE_TOKEN"] = "oauth_super_secret_token"
        try:
            from backend.migration_engine.lakebridge.client import LakebridgeClient
            env = LakebridgeClient()._safe_env()
            assert "SNOWFLAKE_TOKEN" not in env
        finally:
            os.environ.pop("SNOWFLAKE_TOKEN", None)

    def test_safe_env_removes_snowflake_authenticator(self):
        os.environ["SNOWFLAKE_AUTHENTICATOR"] = "externalbrowser"
        try:
            from backend.migration_engine.lakebridge.client import LakebridgeClient
            env = LakebridgeClient()._safe_env()
            assert "SNOWFLAKE_AUTHENTICATOR" not in env
        finally:
            os.environ.pop("SNOWFLAKE_AUTHENTICATOR", None)

    def test_safe_env_preserves_databricks_host(self):
        os.environ["DATABRICKS_HOST"] = "https://my-workspace.azuredatabricks.net"
        from backend.migration_engine.lakebridge.client import LakebridgeClient
        env = LakebridgeClient()._safe_env()
        assert "DATABRICKS_HOST" in env

    def test_safe_env_preserves_databricks_token(self):
        os.environ["DATABRICKS_TOKEN"] = "fake_pat"
        from backend.migration_engine.lakebridge.client import LakebridgeClient
        env = LakebridgeClient()._safe_env()
        assert "DATABRICKS_TOKEN" in env

    def test_redact_strips_secret_from_stdout(self):
        os.environ["SNOWFLAKE_PASSWORD"] = "my_secret_pw_99"
        try:
            from backend.migration_engine.lakebridge.client import LakebridgeClient
            dirty = "Error: connection failed with password=my_secret_pw_99"
            cleaned = LakebridgeClient._redact(dirty)
            assert "my_secret_pw_99" not in cleaned
            assert "<redacted>" in cleaned
        finally:
            os.environ.pop("SNOWFLAKE_PASSWORD", None)

    def test_migration_result_repr_no_credentials(self):
        from backend.migration_engine.lakebridge.models import MigrationResult
        r = MigrationResult(source_object="V", object_type="view", status="SKIPPED",
                            lakebridge_used=False, warnings=["not available"])
        result_repr = repr(r)
        for bad in ("password", "token", "secret", "credential", "private_key"):
            assert bad not in result_repr.lower()


# ---------- unit: availability ------------------------------------------------

class TestAvailability:

    def setup_method(self):
        _bootstrap_env()

    def test_disabled_by_env_var(self):
        from backend.migration_engine.lakebridge.config import LakebridgeConfig
        from backend.migration_engine.lakebridge.client import LakebridgeClient
        cfg = LakebridgeConfig(enabled=False)
        av = LakebridgeClient(cfg).availability()
        assert av.enabled is False
        assert av.available is False
        assert av.reason

    def test_service_status_returns_dict(self):
        from backend.migration_engine.lakebridge.service import LakebridgeService
        s = LakebridgeService().status()
        assert isinstance(s, dict)
        assert "enabled" in s
        assert "available" in s

    def test_unavailable_returns_skipped(self):
        from backend.migration_engine.lakebridge.config import LakebridgeConfig
        from backend.migration_engine.lakebridge.client import LakebridgeClient
        from backend.migration_engine.lakebridge.service import LakebridgeService
        cfg = LakebridgeConfig(enabled=False)
        svc = LakebridgeService(config=cfg, client=LakebridgeClient(cfg))
        result = svc.convert_sql_text("SELECT 1", "my_view", "view")
        assert result.status == "SKIPPED"
        assert result.lakebridge_used is False
        assert result.warnings

    def test_unavailable_preserves_source_definition(self):
        from backend.migration_engine.lakebridge.config import LakebridgeConfig
        from backend.migration_engine.lakebridge.client import LakebridgeClient
        from backend.migration_engine.lakebridge.service import LakebridgeService
        cfg = LakebridgeConfig(enabled=False)
        svc = LakebridgeService(config=cfg, client=LakebridgeClient(cfg))
        sql = "CREATE VIEW MY_V AS SELECT 1 AS col"
        result = svc.convert_sql_text(sql, "MY_V", "view")
        assert result.source_definition == sql


# ---------- unit: MigrationResult contract ------------------------------------

class TestMigrationResultModel:

    REQUIRED_FIELDS = [
        "source_object", "object_type", "status",
        "source_definition", "target_definition",
        "lakebridge_used", "warnings", "errors", "output_location", "raw",
    ]

    def test_all_required_fields_present(self):
        from backend.migration_engine.lakebridge.models import MigrationResult
        r = MigrationResult(source_object="T", object_type="table", status="SUCCEEDED")
        for field in self.REQUIRED_FIELDS:
            assert hasattr(r, field), f"Missing required field: {field}"

    def test_default_list_and_dict_not_none(self):
        from backend.migration_engine.lakebridge.models import MigrationResult
        r = MigrationResult(source_object="X", object_type="view", status="SUCCEEDED")
        assert isinstance(r.warnings, list)
        assert isinstance(r.errors, list)
        assert isinstance(r.raw, dict)

    def test_lakebridge_used_defaults_false(self):
        from backend.migration_engine.lakebridge.models import MigrationResult
        r = MigrationResult(source_object="X", object_type="view", status="SUCCEEDED")
        assert r.lakebridge_used is False


# ---------- integration: Snowflake connection ---------------------------------

@pytest.mark.integration
class TestSnowflakeConnection:

    def test_connect_to_gmigrate_test(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable with current credentials")
        from backend.migration_engine.snowflake_client import test_snowflake_connection
        r = test_snowflake_connection(config)
        assert r["status"] == "connected"
        assert r["latency_ms"] > 0

    def test_expected_tables_exist(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        from backend.migration_engine.snowflake_client import discover_snowflake_all_objects
        r = discover_snowflake_all_objects(config)
        expected = {"CUSTOMERS", "PRODUCTS", "ORDERS", "ORDER_ITEMS", "PAYMENTS"}
        found = {t.upper() for t in r["tables"]}
        assert expected.issubset(found), f"Missing: {expected - found}"

    def test_expected_views_exist(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        from backend.migration_engine.snowflake_client import discover_snowflake_all_objects
        r = discover_snowflake_all_objects(config)
        expected = {"CUSTOMER_ORDERS", "PRODUCT_SALES", "CUSTOMER_SPENDING", "PAYMENT_SUMMARY"}
        found = {v.upper() for v in r["views"]}
        assert expected.issubset(found), f"Missing: {expected - found}"

    def test_expected_procedures_exist(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        from backend.migration_engine.snowflake_client import discover_snowflake_all_objects
        r = discover_snowflake_all_objects(config)
        expected = {"GET_CUSTOMER_SPENDING", "COUNT_ORDERS_BY_STATUS", "UPDATE_PRODUCT_STOCK"}
        found = {p.upper() for p in r["procedures"]}
        assert expected.issubset(found), f"Missing: {expected - found}"


# ---------- integration: Lakebridge CLI ---------------------------------------

@pytest.mark.integration
class TestLakebridgeCLI:

    def test_cli_available(self):
        if not _lakebridge_available():
            pytest.skip("Lakebridge CLI not on PATH")
        from backend.migration_engine.lakebridge.client import LakebridgeClient
        assert LakebridgeClient().availability().available

    def test_version_detected(self):
        """After the _detect_version fix, version must not be None."""
        if not _lakebridge_available():
            pytest.skip("Lakebridge CLI not on PATH")
        from backend.migration_engine.lakebridge.client import LakebridgeClient
        av = LakebridgeClient().availability()
        assert av.version is not None, f"version is None — check _detect_version fix. av={av}"


# ---------- integration: view conversion --------------------------------------

@pytest.mark.integration
class TestViewConversion:

    def test_view_ddl_fetched(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        from backend.migration_engine.snowflake_client import get_view_details
        d = get_view_details("CUSTOMER_ORDERS", config)
        assert d["definition"]

    def test_view_converted_via_lakebridge(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        if not _lakebridge_available():
            pytest.skip("Lakebridge not available")
        from backend.migration_engine.snowflake_client import get_view_details
        from backend.migration_engine.lakebridge.service import LakebridgeService
        d = get_view_details("CUSTOMER_ORDERS", config, lakebridge_service=LakebridgeService())
        assert d["generated_view_ddl"]
        assert d["lakebridge"] is not None
        assert d["lakebridge"]["object_type"] == "view"

    def test_view_fallback_when_disabled(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        from backend.migration_engine.snowflake_client import get_view_details
        from backend.migration_engine.lakebridge.config import LakebridgeConfig
        from backend.migration_engine.lakebridge.client import LakebridgeClient
        from backend.migration_engine.lakebridge.service import LakebridgeService
        cfg = LakebridgeConfig(enabled=False)
        svc = LakebridgeService(config=cfg, client=LakebridgeClient(cfg))
        d = get_view_details("CUSTOMER_ORDERS", config, lakebridge_service=svc)
        assert d["generated_view_ddl"]
        assert d["lakebridge"]["lakebridge_used"] is False
        assert d["lakebridge"]["status"] == "SKIPPED"


# ---------- integration: procedure conversion ---------------------------------

@pytest.mark.integration
class TestProcedureConversion:

    def test_procedure_source_fetched(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        from backend.migration_engine.snowflake_client import get_procedure_details
        d = get_procedure_details("GET_CUSTOMER_SPENDING", config)
        assert d["recommendation"]

    def test_procedure_converted_via_lakebridge(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        if not _lakebridge_available():
            pytest.skip("Lakebridge not available")
        from backend.migration_engine.snowflake_client import get_procedure_details
        from backend.migration_engine.lakebridge.service import LakebridgeService
        d = get_procedure_details("GET_CUSTOMER_SPENDING", config, lakebridge_service=LakebridgeService())
        assert d["recommendation"]
        assert d["lakebridge"]["object_type"] == "procedure"

    def test_procedure_fallback_when_disabled(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        from backend.migration_engine.snowflake_client import get_procedure_details
        from backend.migration_engine.lakebridge.config import LakebridgeConfig
        from backend.migration_engine.lakebridge.client import LakebridgeClient
        from backend.migration_engine.lakebridge.service import LakebridgeService
        cfg = LakebridgeConfig(enabled=False)
        svc = LakebridgeService(config=cfg, client=LakebridgeClient(cfg))
        d = get_procedure_details("GET_CUSTOMER_SPENDING", config, lakebridge_service=svc)
        assert d["recommendation"]
        assert d["lakebridge"]["lakebridge_used"] is False
        assert d["lakebridge"]["status"] == "SKIPPED"


# ---------- integration: table DDL conversion ---------------------------------

@pytest.mark.integration
class TestTableDDLConversion:

    def test_existing_behavior_preserved_without_lakebridge(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        from backend.migration_engine.snowflake_client import get_table_details
        d = get_table_details("CUSTOMERS", config)
        assert d["table_name"] == "CUSTOMERS"
        assert d["generated_ddl"]
        assert d["lakebridge"] is None

    def test_snowflake_ddl_fetched(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        from backend.migration_engine.snowflake_client import get_table_details
        from backend.migration_engine.lakebridge.config import LakebridgeConfig
        from backend.migration_engine.lakebridge.client import LakebridgeClient
        from backend.migration_engine.lakebridge.service import LakebridgeService
        cfg = LakebridgeConfig(enabled=False)
        svc = LakebridgeService(config=cfg, client=LakebridgeClient(cfg))
        d = get_table_details("CUSTOMERS", config, lakebridge_service=svc)
        assert d["snowflake_ddl"], "snowflake_ddl field must be populated"
        assert "CUSTOMERS" in d["snowflake_ddl"].upper()

    def test_table_ddl_via_lakebridge(self):
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        if not _lakebridge_available():
            pytest.skip("Lakebridge not available")
        from backend.migration_engine.snowflake_client import get_table_details
        from backend.migration_engine.lakebridge.service import LakebridgeService
        d = get_table_details("CUSTOMERS", config, lakebridge_service=LakebridgeService())
        assert d["generated_ddl"]
        assert d["lakebridge"] is not None
        assert d["lakebridge"]["object_type"] == "table"


# ---------- integration: DDL export + assess ----------------------------------

@pytest.mark.integration
class TestDDLExportAndAssess:

    def test_dump_creates_sql_files(self):
        import tempfile
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        from backend.migration_engine.snowflake_client import dump_snowflake_ddls_to_dir
        with tempfile.TemporaryDirectory(prefix="gmigrate_test_") as tmp:
            out = dump_snowflake_ddls_to_dir(config, output_dir=tmp)
            sql_files = [f for f in os.listdir(out) if f.endswith(".sql")]
            assert sql_files, f"No .sql files in {out}"
            names = [f.lower() for f in sql_files]
            assert any("customers" in n for n in names)

    def test_assess_directory_end_to_end(self):
        import tempfile
        config = _gmigrate_test_config()
        if not _snowflake_reachable(config):
            pytest.skip("Snowflake not reachable")
        if not _lakebridge_available():
            pytest.skip("Lakebridge not available")
        from backend.migration_engine.snowflake_client import dump_snowflake_ddls_to_dir
        from backend.migration_engine.lakebridge.service import LakebridgeService
        with tempfile.TemporaryDirectory(prefix="gmigrate_assess_test_") as tmp:
            source_dir = dump_snowflake_ddls_to_dir(config, output_dir=tmp)
            report = tmp + "/report.xlsx"
            result = LakebridgeService().assess_directory(source_dir, report)
            assert result.source_object == source_dir
            assert result.object_type == "assessment"
            assert result.status in ("SUCCEEDED", "SKIPPED", "FAILED")
