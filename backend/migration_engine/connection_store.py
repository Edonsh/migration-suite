import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

STORAGE_FILE = Path(__file__).resolve().parent / "saved_connections.json"

def get_storage_path() -> Path:
    STORAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
    return STORAGE_FILE

def load_saved_profiles(default_env_config: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    path = get_storage_path()
    profiles = []
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                profiles = json.load(f)
        except Exception:
            profiles = []

    # Ensure default environment profile exists
    has_default = any(p.get("id") == "default_env" for p in profiles)
    if not has_default and default_env_config and default_env_config.get("user"):
        default_profile = {
            "id": "default_env",
            "name": "Default (.env / Secrets)",
            "snowflake_user": default_env_config.get("user") or "",
            "snowflake_password": default_env_config.get("password") or "",
            "snowflake_account": default_env_config.get("account") or "",
            "snowflake_warehouse": default_env_config.get("warehouse") or "",
            "snowflake_database": default_env_config.get("database") or "",
            "snowflake_schema": default_env_config.get("schema") or "",
            "snowflake_role": default_env_config.get("role") or "",
            "is_default": True,
            "created_at": datetime.now().isoformat()
        }
        profiles.insert(0, default_profile)
        save_profiles_to_disk(profiles)

    return profiles

def save_profiles_to_disk(profiles: List[Dict[str, Any]]) -> None:
    path = get_storage_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(profiles, f, indent=2)

def create_or_update_profile(profile_data: Dict[str, Any]) -> Dict[str, Any]:
    profiles = load_saved_profiles()
    profile_id = profile_data.get("id") or f"sf_{uuid.uuid4().hex[:8]}"
    
    existing_idx = next((i for i, p in enumerate(profiles) if p.get("id") == profile_id), None)
    
    new_entry = {
        "id": profile_id,
        "name": profile_data.get("name") or "Snowflake Connection",
        "snowflake_user": profile_data.get("snowflake_user") or "",
        "snowflake_password": profile_data.get("snowflake_password") or "",
        "snowflake_account": profile_data.get("snowflake_account") or "",
        "snowflake_warehouse": profile_data.get("snowflake_warehouse") or "",
        "snowflake_database": profile_data.get("snowflake_database") or "",
        "snowflake_schema": profile_data.get("snowflake_schema") or "",
        "snowflake_role": profile_data.get("snowflake_role") or "",
        "is_default": bool(profile_data.get("is_default", False)),
        "updated_at": datetime.now().isoformat()
    }
    
    if existing_idx is not None:
        # Preserve password if updated with empty string or masking
        if not new_entry["snowflake_password"] and profiles[existing_idx].get("snowflake_password"):
            new_entry["snowflake_password"] = profiles[existing_idx]["snowflake_password"]
        new_entry["created_at"] = profiles[existing_idx].get("created_at", new_entry["updated_at"])
        profiles[existing_idx] = new_entry
    else:
        new_entry["created_at"] = datetime.now().isoformat()
        profiles.append(new_entry)
        
    save_profiles_to_disk(profiles)
    return new_entry

def delete_profile(profile_id: str) -> bool:
    profiles = load_saved_profiles()
    filtered = [p for p in profiles if p.get("id") != profile_id]
    if len(filtered) < len(profiles):
        save_profiles_to_disk(filtered)
        return True
    return False
