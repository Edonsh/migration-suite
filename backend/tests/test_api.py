"""Tests for core API endpoints."""
import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[2]))

def get_test_client():
    os.environ["ENVIRONMENT"] = "local"
    os.environ.setdefault("DATABRICKS_HOST", "https://fake.databricks.com")
    os.environ.setdefault("DATABRICKS_TOKEN", "fake-token")
    
    import importlib
    import backend.migration_engine.config as cfg
    importlib.reload(cfg)
    import backend.main as main_module
    importlib.reload(main_module)
    return TestClient(main_module.app)

def test_health_check():
    client = get_test_client()
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

def test_connections_status():
    client = get_test_client()
    res = client.get("/api/connections/status")
    assert res.status_code == 200
    data = res.json()
    assert "snowflake" in data
    assert "databricks" in data
    assert data["environment"] == "local"

def test_migration_status():
    client = get_test_client()
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "logs" in data

def test_migrations_history():
    client = get_test_client()
    res = client.get("/api/migrations/history")
    assert res.status_code == 200
    data = res.json()
    assert "history" in data
    assert isinstance(data["history"], list)
