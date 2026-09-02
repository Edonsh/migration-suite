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

def test_saved_connection_profiles_crud():
    client = get_test_client()
    # 1. List profiles
    res = client.get("/api/connections/profiles")
    assert res.status_code == 200
    data = res.json()
    assert "profiles" in data

    # 2. Create new profile
    new_profile = {
        "name": "Test Analytics DW",
        "snowflake_user": "TEST_USER",
        "snowflake_password": "TestPassword123!",
        "snowflake_account": "ACC-12345",
        "snowflake_warehouse": "TEST_WH",
        "snowflake_database": "ANALYTICS_DB",
        "snowflake_schema": "PUBLIC",
        "snowflake_role": "ANALYST"
    }
    create_res = client.post("/api/connections/profiles", json=new_profile)
    assert create_res.status_code == 200
    created = create_res.json()["profile"]
    profile_id = created["id"]
    assert created["name"] == "Test Analytics DW"

    # 3. Update profile
    updated_profile = dict(new_profile)
    updated_profile["name"] = "Updated Analytics DW"
    update_res = client.put(f"/api/connections/profiles/{profile_id}", json=updated_profile)
    assert update_res.status_code == 200
    assert update_res.json()["profile"]["name"] == "Updated Analytics DW"

    # 4. Delete profile
    del_res = client.delete(f"/api/connections/profiles/{profile_id}")
    assert del_res.status_code == 200

