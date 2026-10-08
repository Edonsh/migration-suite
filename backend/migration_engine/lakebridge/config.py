from dataclasses import dataclass
from typing import Optional

from ..config import (
    LAKEBRIDGE_ENABLED,
    LAKEBRIDGE_PATH,
    LAKEBRIDGE_PROFILE,
    LAKEBRIDGE_TIMEOUT_SECONDS,
)


@dataclass(frozen=True)
class LakebridgeConfig:
    enabled: bool = LAKEBRIDGE_ENABLED
    executable: str = LAKEBRIDGE_PATH
    profile: Optional[str] = LAKEBRIDGE_PROFILE
    timeout_seconds: int = LAKEBRIDGE_TIMEOUT_SECONDS
    source_dialect: str = "snowflake"


def get_lakebridge_config() -> LakebridgeConfig:
    return LakebridgeConfig()
