"""Tests for GET /api/identity endpoint."""
import pytest
from fastapi.testclient import TestClient
import os
import sys

# Ensure backend package is importable
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[2]))


def _get_client(environment: str = "local"):
    """Import the app fresh with a given ENVIRONMENT setting."""
    os.environ["ENVIRONMENT"] = environment
    os.environ["LOCAL_DEV_USER_EMAIL"] = "dev@localhost"
    os.environ["LOCAL_DEV_DISPLAY_NAME"] = "Dev User"
    # Patch DB SDK to avoid real connection attempts
    os.environ.setdefault("DATABRICKS_HOST", "https://fake.databricks.com")
    os.environ.setdefault("DATABRICKS_TOKEN", "fake-token")

    # Re-import after setting env
    import importlib
    import backend.migration_engine.config as cfg
    importlib.reload(cfg)
    import backend.main as main_module
    importlib.reload(main_module)

    return TestClient(main_module.app)


def test_identity_returns_forwarded_headers():
    """When Databricks forwards user headers, they are returned as-is."""
    client = _get_client(environment="production")
    response = client.get(
        "/api/identity",
        headers={
            "x-forwarded-email": "alice@company.com",
            "x-forwarded-preferred-username": "Alice Smith",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "alice@company.com"
    assert data["display_name"] == "Alice Smith"


def test_identity_fallback_in_local_env():
    """Without headers in local environment, returns the configured dev fallback."""
    client = _get_client(environment="local")
    response = client.get("/api/identity")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "dev@localhost"
    assert data["display_name"] == "Dev User"


def test_identity_no_fallback_in_production():
    """Without headers in production, returns empty strings (no fallback activated)."""
    client = _get_client(environment="production")
    response = client.get("/api/identity")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == ""
    assert data["display_name"] == ""
