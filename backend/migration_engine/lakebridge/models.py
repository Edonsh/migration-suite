from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class LakebridgeCommandResult:
    command: List[str]
    returncode: int
    stdout: str = ""
    stderr: str = ""
    output_location: Optional[str] = None


@dataclass
class LakebridgeAvailability:
    enabled: bool
    available: bool
    version: Optional[str] = None
    reason: Optional[str] = None
    command: List[str] = field(default_factory=list)


@dataclass
class MigrationResult:
    source_object: str
    object_type: str
    status: str
    source_definition: Optional[str] = None
    target_definition: Optional[str] = None
    lakebridge_used: bool = False
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    output_location: Optional[str] = None
    raw: Dict[str, Any] = field(default_factory=dict)
