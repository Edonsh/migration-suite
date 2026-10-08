import json
import logging
import tempfile
import time as _time
from dataclasses import asdict
from pathlib import Path
from typing import Optional, Sequence

from .client import LakebridgeClient
from .config import LakebridgeConfig, get_lakebridge_config
from .models import LakebridgeAvailability, MigrationResult

logger = logging.getLogger(__name__)


class LakebridgeService:
    """Normalized migration-service facade over the Lakebridge CLI."""

    def __init__(self, config: Optional[LakebridgeConfig] = None, client: Optional[LakebridgeClient] = None):
        self.config = config or get_lakebridge_config()
        self.client = client or LakebridgeClient(self.config)

    def status(self) -> dict:
        return asdict(self.client.availability())

    def _log_op(
        self,
        operation: str,
        source_object: str,
        object_type: str,
        lakebridge_op: str,
        start: float,
        status: str,
        errors: Optional[list] = None,
        warnings: Optional[list] = None,
    ) -> None:
        """Emits a structured log entry for a Lakebridge operation.  Never logs credentials."""
        logger.info(
            "[lakebridge] operation=%s source_object=%s object_type=%s "
            "lakebridge_op=%s status=%s duration_s=%.3f errors=%s warnings=%s",
            operation,
            source_object,
            object_type,
            lakebridge_op,
            status,
            _time.time() - start,
            errors or [],
            warnings or [],
        )

    def assess_directory(self, source_directory: str, report_file: str, source_tech: str = "snowflake") -> MigrationResult:
        start = _time.time()
        availability = self.client.availability()
        if not availability.available:
            result = self._unavailable_result("assessment", "directory", availability)
            self._log_op("assess_directory", source_directory, "assessment", "analyze", start, result.status, warnings=result.warnings)
            return result

        args = [
            "analyze",
            "--source-directory",
            source_directory,
            "--report-file",
            report_file,
            "--source-tech",
            source_tech,
            "--generate-json",
            "true",
        ]
        cmd_result = self.client.run(args, check=False)
        json_report = str(Path(report_file).with_suffix(".json"))
        raw = {}
        if Path(json_report).exists():
            try:
                raw = json.loads(Path(json_report).read_text(encoding="utf-8"))
            except Exception as exc:
                raw = {"parse_error": str(exc)}
        migration_result = MigrationResult(
            source_object=source_directory,
            object_type="assessment",
            status="SUCCEEDED" if cmd_result.returncode == 0 else "FAILED",
            lakebridge_used=cmd_result.returncode == 0,
            errors=[] if cmd_result.returncode == 0 else [cmd_result.stderr or cmd_result.stdout or "Lakebridge assessment failed."],
            warnings=[],
            output_location=report_file,
            raw={"stdout": cmd_result.stdout, "stderr": cmd_result.stderr, "json_report": raw},
        )
        self._log_op("assess_directory", source_directory, "assessment", "analyze", start, migration_result.status)
        return migration_result

    def convert_sql_text(self, sql_text: str, source_object: str, object_type: str = "sql") -> MigrationResult:
        start = _time.time()
        availability = self.client.availability()
        if not availability.available:
            result = self._unavailable_result(source_object, object_type, availability, sql_text)
            self._log_op("convert_sql_text", source_object, object_type, "transpile", start, result.status, warnings=result.warnings)
            return result

        with tempfile.TemporaryDirectory(prefix="gmigrate_lakebridge_") as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "input"
            output_dir = root / "output"
            input_dir.mkdir()
            output_dir.mkdir()
            safe_name = "".join(ch if ch.isalnum() or ch in ("_", "-") else "_" for ch in source_object)
            input_file = input_dir / f"{safe_name or 'source'}.sql"
            input_file.write_text(sql_text or "", encoding="utf-8")

            try:
                cmd_result = self.client.run([
                    "transpile",
                    "--source-dialect",
                    self.config.source_dialect,
                    "--input-source",
                    str(input_dir),
                    "--output-folder",
                    str(output_dir),
                    "--skip-validation",
                    "true",
                ], check=False)
                converted = self._read_first_sql(output_dir)
            except Exception as ex:
                converted = None
                from .models import LakebridgeCommandResult
                cmd_result = LakebridgeCommandResult(command=[], returncode=1, stdout="", stderr=str(ex))

            migration_result = MigrationResult(
                source_object=source_object,
                object_type=object_type,
                status="SUCCEEDED" if converted and cmd_result.returncode == 0 else "FAILED",
                source_definition=sql_text,
                target_definition=converted,
                lakebridge_used=bool(converted and cmd_result.returncode == 0),
                warnings=[] if converted and cmd_result.returncode == 0 else [],
                errors=[] if converted and cmd_result.returncode == 0 else [cmd_result.stderr or cmd_result.stdout or "Lakebridge failed or produced no SQL output."],
                output_location=str(output_dir),
                raw={"stdout": cmd_result.stdout, "stderr": cmd_result.stderr},
            )

        self._log_op(
            "convert_sql_text", source_object, object_type, "transpile",
            start, migration_result.status, migration_result.errors, migration_result.warnings,
        )
        return migration_result

    def convert_sql_sources(self, sources: Sequence[tuple[str, str, str]]) -> list[MigrationResult]:
        """Transpile multiple (source object, object type, SQL) items in one CLI call."""
        if not sources:
            return []

        start = _time.time()
        availability = self.client.availability()
        if not availability.available:
            return [
                self._unavailable_result(source_object, object_type, availability, sql_text)
                for source_object, object_type, sql_text in sources
            ]

        with tempfile.TemporaryDirectory(prefix="gmigrate_lakebridge_batch_") as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "input"
            output_dir = root / "output"
            input_dir.mkdir()
            output_dir.mkdir()

            source_files: dict[str, tuple[str, str, str]] = {}
            for index, (source_object, object_type, sql_text) in enumerate(sources):
                safe_name = "".join(ch if ch.isalnum() or ch in ("_", "-") else "_" for ch in source_object)
                file_stem = f"{index:04d}_{safe_name or 'source'}"
                (input_dir / f"{file_stem}.sql").write_text(sql_text or "", encoding="utf-8")
                source_files[file_stem.lower()] = (source_object, object_type, sql_text)

            try:
                cmd_result = self.client.run([
                    "transpile",
                    "--source-dialect",
                    self.config.source_dialect,
                    "--input-source",
                    str(input_dir),
                    "--output-folder",
                    str(output_dir),
                    "--skip-validation",
                    "true",
                ], check=False)
                output_by_stem = {path.stem.lower(): path for path in output_dir.rglob("*.sql")}
                batch_error = cmd_result.stderr or cmd_result.stdout or "Lakebridge failed or produced no SQL output."
            except Exception as ex:
                from .models import LakebridgeCommandResult
                cmd_result = LakebridgeCommandResult(command=[], returncode=1, stderr=str(ex))
                output_by_stem = {}
                batch_error = str(ex)

            results = []
            for file_stem, (source_object, object_type, sql_text) in source_files.items():
                output_path = output_by_stem.get(file_stem)
                converted = output_path.read_text(encoding="utf-8") if output_path else None
                succeeded = bool(converted and cmd_result.returncode == 0)
                result = MigrationResult(
                    source_object=source_object,
                    object_type=object_type,
                    status="SUCCEEDED" if succeeded else "FAILED",
                    source_definition=sql_text,
                    target_definition=converted,
                    lakebridge_used=succeeded,
                    errors=[] if succeeded else [batch_error],
                    output_location=str(output_path) if output_path else str(output_dir),
                    raw={"stdout": cmd_result.stdout, "stderr": cmd_result.stderr},
                )
                results.append(result)
                self._log_op(
                    "convert_sql_sources", source_object, object_type, "transpile",
                    start, result.status, result.errors, result.warnings,
                )

        return results

    def _read_first_sql(self, output_dir: Path) -> Optional[str]:
        for path in sorted(output_dir.rglob("*.sql")):
            return path.read_text(encoding="utf-8")
        return None

    def _unavailable_result(
        self,
        source_object: str,
        object_type: str,
        availability: LakebridgeAvailability,
        source_definition: Optional[str] = None,
    ) -> MigrationResult:
        return MigrationResult(
            source_object=source_object,
            object_type=object_type,
            status="SKIPPED",
            source_definition=source_definition,
            lakebridge_used=False,
            warnings=[availability.reason or "Lakebridge is not available."],
            raw={"availability": asdict(availability)},
        )
