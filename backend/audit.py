from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import AUDIT_LOG_PATH, ensure_runtime_dirs


def utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def append_audit(
    action: str,
    *,
    photo_id: str | None = None,
    file_path: str | None = None,
    staged_path: str | None = None,
    paired_files: list[str] | None = None,
    result: str = "ok",
    error: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    ensure_runtime_dirs()
    record: dict[str, Any] = {
        "ts": utc_now_iso(),
        "action": action,
        "photo_id": photo_id,
        "file_path": file_path,
        "staged_path": staged_path,
        "paired_files": paired_files or [],
        "result": result,
        "error": error,
    }
    if extra:
        record.update(extra)
    Path(AUDIT_LOG_PATH).parent.mkdir(parents=True, exist_ok=True)
    with Path(AUDIT_LOG_PATH).open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")

