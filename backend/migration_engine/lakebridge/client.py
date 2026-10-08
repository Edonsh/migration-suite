import os
import shlex
import shutil
import subprocess
from typing import Iterable, List, Optional

from .config import LakebridgeConfig, get_lakebridge_config
from .models import LakebridgeAvailability, LakebridgeCommandResult


SECRET_ENV_MARKERS = ("PASSWORD", "TOKEN", "SECRET", "KEY", "PAT")

# Snowflake credentials that Lakebridge does NOT need and must not receive via subprocess env.
# Databricks credentials (DATABRICKS_HOST / DATABRICKS_TOKEN) are intentionally preserved
# because Lakebridge requires them to authenticate against the workspace.
_SNOWFLAKE_SECRET_KEYS: frozenset = frozenset({
    "SNOWFLAKE_PASSWORD",
    "SNOWFLAKE_TOKEN",
    "SNOWFLAKE_PRIVATE_KEY",
    "SNOWFLAKE_PRIVATE_KEY_PASSPHRASE",
    "SNOWFLAKE_AUTHENTICATOR",
})


class LakebridgeClient:
    """Thin wrapper around the installed Databricks Lakebridge CLI."""

    def __init__(self, config: Optional[LakebridgeConfig] = None):
        self.config = config or get_lakebridge_config()
        self._availability_cache: Optional[LakebridgeAvailability] = None

    def base_command(self) -> List[str]:
        return shlex.split(self.config.executable) + ["labs", "lakebridge"]

    def availability(self) -> LakebridgeAvailability:
        if self._availability_cache is not None:
            return self._availability_cache

        if not self.config.enabled:
            self._availability_cache = LakebridgeAvailability(
                enabled=False,
                available=False,
                reason="Lakebridge is disabled by LAKEBRIDGE_ENABLED.",
                command=self.base_command(),
            )
            return self._availability_cache

        executable = shlex.split(self.config.executable)[0]
        if not shutil.which(executable):
            self._availability_cache = LakebridgeAvailability(
                enabled=True,
                available=False,
                reason=f"Lakebridge CLI executable '{executable}' was not found on PATH.",
                command=self.base_command(),
            )
            return self._availability_cache

        result = self.run(["--help"], timeout_seconds=30, check=False)
        if result.returncode != 0:
            self._availability_cache = LakebridgeAvailability(
                enabled=True,
                available=False,
                reason=(result.stderr or result.stdout or "Lakebridge help command failed.").strip(),
                command=result.command,
            )
            return self._availability_cache

        version = self._detect_version()
        self._availability_cache = LakebridgeAvailability(
            enabled=True,
            available=True,
            version=version,
            command=self.base_command(),
        )
        return self._availability_cache

    def run(
        self,
        args: Iterable[str],
        timeout_seconds: Optional[int] = None,
        check: bool = True,
    ) -> LakebridgeCommandResult:
        command = self.base_command() + list(args)
        if self.config.profile:
            command.extend(["--profile", self.config.profile])

        env = self._safe_env()
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout_seconds or self.config.timeout_seconds,
            stdin=subprocess.DEVNULL,
            env=env,
            check=False,
        )
        result = LakebridgeCommandResult(
            command=command,
            returncode=completed.returncode,
            stdout=self._redact(completed.stdout),
            stderr=self._redact(completed.stderr),
        )
        if check and result.returncode != 0:
            raise RuntimeError(result.stderr or result.stdout or "Lakebridge command failed.")
        return result

    def _detect_version(self) -> Optional[str]:
        """Detect the installed Databricks CLI version.

        ``databricks labs lakebridge --version`` is not a valid sub-command;
        the version flag lives at the top-level ``databricks --version``.
        """
        executable = shlex.split(self.config.executable)[0]
        try:
            completed = subprocess.run(
                [executable, "--version"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if completed.returncode == 0:
                return (completed.stdout or completed.stderr).strip() or None
        except Exception:
            pass
        return None

    def _safe_env(self) -> dict:
        """Return a copy of the process environment with Snowflake secrets stripped.

        Lakebridge requires Databricks credentials (DATABRICKS_HOST / DATABRICKS_TOKEN)
        to authenticate, so those are intentionally preserved.  Snowflake credentials
        are removed because Lakebridge (transpile / analyze) does not connect to
        Snowflake directly and those secrets must not be forwarded to child processes.
        """
        env = os.environ.copy()
        for key in _SNOWFLAKE_SECRET_KEYS:
            env.pop(key, None)
        return env

    @staticmethod
    def _redact(value: str) -> str:
        redacted = value or ""
        for key, secret in os.environ.items():
            if secret and any(marker in key.upper() for marker in SECRET_ENV_MARKERS):
                redacted = redacted.replace(secret, "<redacted>")
        return redacted
