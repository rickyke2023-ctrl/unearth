from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from .audit import append_audit, utc_now_iso
from .config import DATA_DIR, RAW_TYPES, STAGING_LIMIT_BYTES
from .database import fetch_all, fetch_one, transaction
from .errors import DiskNotMountedError, PhotoNotFoundError, StagingError


def staging_path_for_root(root_path: str) -> Path:
    root = Path(root_path)
    if not root.exists():
        raise DiskNotMountedError(f"外置硬盘未挂载或不可访问：{root}")
    staging = root / "_unearth_staging"
    staging.mkdir(parents=True, exist_ok=True)
    return staging


def staging_total_bytes(root_path: str) -> int:
    staging = staging_path_for_root(root_path)
    return sum(path.stat().st_size for path in staging.rglob("*") if path.is_file())


def assert_staging_limit(root_path: str) -> None:
    if staging_total_bytes(root_path) > STAGING_LIMIT_BYTES:
        raise StagingError("Staging 文件夹已超过 200GB，请先确认清空后再继续")


def get_photo(conn, photo_id: str) -> dict[str, Any]:
    photo = fetch_one(conn, "SELECT * FROM photos WHERE id = ?", (photo_id,))
    if not photo:
        raise PhotoNotFoundError(f"photo_id 不存在：{photo_id}")
    return photo


def choose_leave_target(conn, photo: dict[str, Any]) -> dict[str, Any]:
    paired_id = photo.get("paired_photo_id")
    if paired_id:
        paired = get_photo(conn, paired_id)
        if photo["file_type"] in RAW_TYPES:
            return photo
        if paired["file_type"] in RAW_TYPES:
            return paired
    return photo


def collect_move_sources(photo: dict[str, Any]) -> list[Path]:
    sources = [Path(photo["file_path"])]
    sidecars = json.loads(photo.get("sidecar_paths") or "[]")
    sources.extend(Path(path) for path in sidecars)
    return [path for path in sources if path.exists()]


def move_to_staging(conn, requested_photo_id: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    requested = get_photo(conn, requested_photo_id)
    target = choose_leave_target(conn, requested)
    if target["status"] == "staged":
        return target, []
    assert_staging_limit(target["root_path"])

    root = Path(target["root_path"])
    staging = staging_path_for_root(target["root_path"])
    sources = collect_move_sources(target)
    if not sources:
        raise StagingError(f"文件不存在，无法移动：{target['file_path']}")

    moved: list[dict[str, Any]] = []
    try:
        for source in sources:
            rel = source.relative_to(root)
            destination = staging / rel
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                destination = destination.with_name(f"{destination.stem}.{target['id']}{destination.suffix}")
            shutil.move(str(source), str(destination))
            moved.append({"original_path": str(source), "staged_path": str(destination), "size": destination.stat().st_size})
    except Exception as exc:
        for item in reversed(moved):
            staged = Path(item["staged_path"])
            original = Path(item["original_path"])
            if staged.exists():
                original.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(staged), str(original))
        append_audit(
            "error",
            photo_id=target["id"],
            file_path=target["file_path"],
            result="error",
            error=str(exc),
        )
        raise StagingError(f"移动到 staging 失败：{exc}") from exc

    return target, moved


def record_staged_files(conn, target_photo: dict[str, Any], moved: list[dict[str, Any]]) -> None:
    now = utc_now_iso()
    with transaction(conn):
        if moved:
            first_staged = moved[0]["staged_path"]
            conn.execute(
                """
                UPDATE photos
                SET status = 'staged', staged_path = ?, file_path = ?, decision = 'leave', updated_at = ?
                WHERE id = ?
                """,
                (first_staged, first_staged, now, target_photo["id"]),
            )
            for item in moved:
                conn.execute(
                    """
                    INSERT INTO staging_files (photo_id, original_path, staged_path, file_size_bytes, left_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (target_photo["id"], item["original_path"], item["staged_path"], item["size"], now),
                )


def restore_photo(conn, photo_id: str) -> dict[str, Any]:
    photo = get_photo(conn, photo_id)
    staged_rows = fetch_all(
        conn,
        """
        SELECT * FROM staging_files
        WHERE photo_id = ? AND restored_at IS NULL AND confirmed_deleted_at IS NULL
        ORDER BY id
        """,
        (photo["id"],),
    )
    if not staged_rows and photo.get("paired_photo_id"):
        target = choose_leave_target(conn, photo)
        if target["id"] != photo["id"]:
            return restore_photo(conn, target["id"])
    if not staged_rows:
        raise StagingError("没有可恢复的 staging 文件")

    restored: list[dict[str, str]] = []
    try:
        for row in staged_rows:
            staged = Path(row["staged_path"])
            original = Path(row["original_path"])
            if not staged.exists():
                raise StagingError(f"staging 文件不存在：{staged}")
            if original.exists():
                raise StagingError(f"原位置已有同名文件，拒绝覆盖：{original}")
            original.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(staged), str(original))
            restored.append({"staged_path": str(staged), "original_path": str(original)})
    except Exception:
        for item in reversed(restored):
            original = Path(item["original_path"])
            staged = Path(item["staged_path"])
            if original.exists():
                staged.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(original), str(staged))
        raise

    now = utc_now_iso()
    with transaction(conn):
        conn.execute(
            """
            UPDATE staging_files SET restored_at = ?
            WHERE photo_id = ? AND restored_at IS NULL AND confirmed_deleted_at IS NULL
            """,
            (now, photo["id"]),
        )
        conn.execute(
            """
            UPDATE photos
            SET status = 'active', file_path = original_path, staged_path = NULL, decision = NULL, updated_at = ?
            WHERE id = ?
            """,
            (now, photo["id"]),
        )

    append_audit(
        "staging_restore",
        photo_id=photo["id"],
        file_path=photo["original_path"],
        paired_files=[Path(item["original_path"]).name for item in restored[1:]],
    )
    return {"success": True, "photo_id": photo["id"], "restored_path": photo["original_path"]}


def resolve_staging_root(conn, root_path: str | None = None, all_roots: bool = False) -> str | None:
    if all_roots:
        return None
    if root_path:
        return str(Path(root_path).expanduser().resolve())
    state = fetch_one(conn, "SELECT root_path FROM scan_state WHERE id = 1")
    return state["root_path"] if state and state["root_path"] else None


def list_staging(conn, root_path: str | None = None, all_roots: bool = False) -> dict[str, Any]:
    resolved_root = resolve_staging_root(conn, root_path, all_roots)
    staging_path = (
        str(staging_path_for_root(resolved_root))
        if resolved_root
        else str((DATA_DIR / "_unearth_staging").resolve())
    )
    root_filter = "" if all_roots or not resolved_root else "AND p.root_path = ?"
    params = () if all_roots or not resolved_root else (resolved_root,)
    rows = fetch_all(
        conn,
        f"""
        SELECT sf.photo_id, p.file_name, sf.file_size_bytes, sf.left_at
        FROM staging_files sf
        JOIN photos p ON p.id = sf.photo_id
        WHERE sf.restored_at IS NULL AND sf.confirmed_deleted_at IS NULL
        {root_filter}
        ORDER BY sf.left_at DESC
        """,
        params,
    )
    return {
        "staging_path": staging_path,
        "files": rows,
        "total_count": len(rows),
        "total_size_bytes": sum(row["file_size_bytes"] for row in rows),
    }


def confirm_staging(conn, confirm: bool, root_path: str | None = None, all_roots: bool = False) -> dict[str, Any]:
    if not confirm:
        raise StagingError("需要 confirm=true 才能清空 staging")
    resolved_root = resolve_staging_root(conn, root_path, all_roots)
    root_filter = "" if all_roots or not resolved_root else "AND p.root_path = ?"
    params = () if all_roots or not resolved_root else (resolved_root,)
    rows = fetch_all(
        conn,
        f"""
        SELECT sf.*
        FROM staging_files sf
        JOIN photos p ON p.id = sf.photo_id
        WHERE sf.restored_at IS NULL AND sf.confirmed_deleted_at IS NULL
        {root_filter}
        ORDER BY id
        """,
        params,
    )
    deleted_count = 0
    freed_bytes = 0
    for row in rows:
        staged = Path(row["staged_path"])
        if staged.exists():
            staged.unlink()
        deleted_count += 1
        freed_bytes += row["file_size_bytes"]
    now = utc_now_iso()
    row_ids = [row["id"] for row in rows]
    if row_ids:
        placeholders = ",".join("?" for _ in row_ids)
        with transaction(conn):
            conn.execute(
                f"UPDATE staging_files SET confirmed_deleted_at = ? WHERE id IN ({placeholders})",
                (now, *row_ids),
            )
    append_audit("staging_confirm", extra={"deleted_count": deleted_count, "freed_bytes": freed_bytes})
    return {"deleted_count": deleted_count, "freed_bytes": freed_bytes}
