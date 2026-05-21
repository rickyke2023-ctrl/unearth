from __future__ import annotations

import json
import os
import shutil
from datetime import UTC, datetime, timedelta
from math import ceil
from pathlib import Path
from typing import Any

from .audit import append_audit, utc_now_iso
from .config import PREVIEW_DIR, RAW_TYPES, STAGING_LIMIT_BYTES
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


def _thumbnail_path(photo_id: str) -> Path:
    return PREVIEW_DIR / f"{photo_id}.jpg"


def _path_is_inside(path: Path, directory: Path) -> bool:
    try:
        path.resolve(strict=False).relative_to(directory.resolve(strict=False))
        return True
    except ValueError:
        return False


def _path_is_in_staging(path: Path, expected_root: str | None = None) -> bool:
    if expected_root and _path_is_inside(path, Path(expected_root) / "_unearth_staging"):
        return True
    return "_unearth_staging" in path.resolve(strict=False).parts


def _file_size_or_zero(path: Path, *, photo_id: str | None = None) -> int:
    try:
        return os.path.getsize(path)
    except OSError as exc:
        append_audit(
            "error",
            photo_id=photo_id,
            staged_path=str(path),
            result="error",
            error=str(exc),
        )
        return 0


def _latest_leave_at(conn, photo_id: str, fallback_path: Path, fallback_left_at: str | None = None) -> str | None:
    row = fetch_one(
        conn,
        """
        SELECT created_at
        FROM decision_history
        WHERE photo_id = ? AND new_decision = 'leave'
        ORDER BY id DESC
        LIMIT 1
        """,
        (photo_id,),
    )
    if row and row["created_at"]:
        return row["created_at"]
    try:
        if fallback_path.exists():
            return datetime_from_timestamp(os.path.getmtime(fallback_path))
    except OSError as exc:
        append_audit(
            "error",
            photo_id=photo_id,
            staged_path=str(fallback_path),
            result="error",
            error=str(exc),
        )
    return fallback_left_at


def datetime_from_timestamp(timestamp: float) -> str:
    from datetime import UTC, datetime

    return datetime.fromtimestamp(timestamp, UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _parse_utc_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def _utc_iso(value: datetime) -> str:
    return value.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _trash_expiry(trashed_at: str, grace_days: int = 30) -> tuple[str, int]:
    expires = _parse_utc_iso(trashed_at) + timedelta(days=grace_days)
    seconds_remaining = (expires - datetime.now(UTC)).total_seconds()
    days_remaining = max(0, ceil(seconds_remaining / 86400))
    return _utc_iso(expires), days_remaining


def _record_decision_history(
    conn,
    *,
    photo: dict[str, Any],
    new_decision: str,
    previous_decision: str | None = None,
    previous_status: str | None = None,
    moved_files: list[dict[str, Any]] | None = None,
    now: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO decision_history (
            photo_id, previous_decision, new_decision, previous_status, new_status,
            moved_files_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            photo["id"],
            photo["decision"] if previous_decision is None else previous_decision,
            new_decision,
            photo["status"] if previous_status is None else previous_status,
            "active" if new_decision == "restored" else new_decision,
            json.dumps(moved_files or [], ensure_ascii=False),
            now or utc_now_iso(),
        ),
    )


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
            if not _path_is_in_staging(staged, photo["root_path"]):
                raise StagingError(f"文件不在 staging 目录中：{staged}")
            if original.exists():
                raise StagingError(f"原位置已有同名文件，拒绝覆盖：{original}")
            original.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(staged), str(original))
            restored.append({"staged_path": str(staged), "original_path": str(original)})
    except Exception as exc:
        for item in reversed(restored):
            original = Path(item["original_path"])
            staged = Path(item["staged_path"])
            if original.exists():
                staged.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(original), str(staged))
        append_audit(
            "error",
            photo_id=photo["id"],
            file_path=photo["original_path"],
            result="error",
            error=str(exc),
        )
        if isinstance(exc, StagingError):
            raise
        raise StagingError(f"恢复 staging 文件失败：{exc}") from exc

    now = utc_now_iso()
    with transaction(conn):
        conn.execute(
            """
            UPDATE staging_files SET restored_at = ?, trashed_at = NULL
            WHERE photo_id = ? AND restored_at IS NULL AND confirmed_deleted_at IS NULL
            """,
            (now, photo["id"]),
        )
        latest_leave = fetch_one(
            conn,
            """
            SELECT id FROM decision_history
            WHERE photo_id = ? AND new_decision = 'leave'
            ORDER BY id DESC
            LIMIT 1
            """,
            (photo["id"],),
        )
        if latest_leave:
            conn.execute(
                """
                UPDATE decision_history
                SET new_decision = 'restored', new_status = 'active', created_at = ?
                WHERE id = ?
                """,
                (now, latest_leave["id"]),
            )
        else:
            _record_decision_history(
                conn,
                photo=photo,
                new_decision="restored",
                moved_files=[{"staged_path": item["staged_path"], "original_path": item["original_path"]} for item in restored],
                now=now,
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
    return {"photo_id": photo["id"], "restored_to": photo["original_path"]}


def resolve_staging_root(conn, root_path: str | None = None, all_roots: bool = False) -> str | None:
    if all_roots:
        return None
    if root_path:
        return str(Path(root_path).expanduser().resolve())
    state = fetch_one(conn, "SELECT root_path FROM scan_state WHERE id = 1")
    return state["root_path"] if state and state["root_path"] else None


def list_staging(conn, root_path: str | None = None, all_roots: bool = False) -> dict[str, Any]:
    auto_purge_expired(conn)
    resolved_root = resolve_staging_root(conn, root_path, all_roots)
    root_filter = "" if all_roots or not resolved_root else "AND p.root_path = ?"
    params = () if all_roots or not resolved_root else (resolved_root,)
    rows = fetch_all(
        conn,
        f"""
        SELECT
            sf.id AS staging_file_id,
            sf.photo_id,
            sf.original_path,
            sf.staged_path,
            sf.file_size_bytes,
            sf.left_at,
            p.file_name,
            p.shot_at,
            p.gps_city,
            p.gps_country,
            p.root_path
        FROM staging_files sf
        JOIN photos p ON p.id = sf.photo_id
        WHERE sf.restored_at IS NULL
          AND sf.confirmed_deleted_at IS NULL
          AND sf.trashed_at IS NULL
        {root_filter}
        ORDER BY sf.left_at DESC, sf.id
        """,
        params,
    )
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row["photo_id"]), []).append(row)

    photos: list[dict[str, Any]] = []
    total_size_bytes = 0
    for photo_id, staged_files in grouped.items():
        primary = min(staged_files, key=lambda item: item["staging_file_id"])
        primary_staged = Path(primary["staged_path"])
        file_size_bytes = sum(_file_size_or_zero(Path(item["staged_path"]), photo_id=photo_id) for item in staged_files)
        total_size_bytes += file_size_bytes
        photos.append(
            {
                "photo_id": primary["photo_id"],
                "original_path": primary["original_path"],
                "filename": Path(primary["original_path"]).name or primary["file_name"],
                "staging_path": primary["staged_path"],
                "file_size_bytes": file_size_bytes,
                "date_taken": primary["shot_at"],
                "location": primary["gps_city"] or primary["gps_country"],
                "left_at": _latest_leave_at(conn, photo_id, primary_staged, primary["left_at"]),
                "thumbnail_available": _thumbnail_path(photo_id).exists(),
            }
        )
    photos.sort(key=lambda item: item["left_at"] or "", reverse=True)
    return {
        "total_count": len(photos),
        "total_size_mb": round(total_size_bytes / (1024 * 1024), 1) if total_size_bytes else 0,
        "photos": photos,
        "trash_summary": trash_summary(conn, root_path=root_path, all_roots=all_roots, auto_purge=False),
    }


def trash_summary(
    conn,
    root_path: str | None = None,
    all_roots: bool = False,
    auto_purge: bool = True,
) -> dict[str, Any]:
    if auto_purge:
        auto_purge_expired(conn)
    resolved_root = resolve_staging_root(conn, root_path, all_roots)
    root_filter = "" if all_roots or not resolved_root else "AND p.root_path = ?"
    params = () if all_roots or not resolved_root else (resolved_root,)
    rows = fetch_all(
        conn,
        f"""
        SELECT sf.photo_id, sf.staged_path, sf.trashed_at
        FROM staging_files sf
        JOIN photos p ON p.id = sf.photo_id
        WHERE sf.restored_at IS NULL
          AND sf.confirmed_deleted_at IS NULL
          AND sf.trashed_at IS NOT NULL
        {root_filter}
        """,
        params,
    )
    photo_ids = {str(row["photo_id"]) for row in rows}
    total_size_bytes = sum(_file_size_or_zero(Path(row["staged_path"]), photo_id=str(row["photo_id"])) for row in rows)
    expires_at_values = [_trash_expiry(row["trashed_at"])[0] for row in rows if row.get("trashed_at")]
    return {
        "count": len(photo_ids),
        "size_mb": round(total_size_bytes / (1024 * 1024), 1) if total_size_bytes else 0,
        "oldest_expires_at": min(expires_at_values) if expires_at_values else None,
    }


def list_trash(conn, root_path: str | None = None, all_roots: bool = False) -> dict[str, Any]:
    auto_purge_expired(conn)
    resolved_root = resolve_staging_root(conn, root_path, all_roots)
    root_filter = "" if all_roots or not resolved_root else "AND p.root_path = ?"
    params = () if all_roots or not resolved_root else (resolved_root,)
    rows = fetch_all(
        conn,
        f"""
        SELECT
            sf.id AS staging_file_id,
            sf.photo_id,
            sf.original_path,
            sf.staged_path,
            sf.file_size_bytes,
            sf.left_at,
            sf.trashed_at,
            p.file_name,
            p.shot_at,
            p.gps_city,
            p.gps_country,
            p.root_path
        FROM staging_files sf
        JOIN photos p ON p.id = sf.photo_id
        WHERE sf.restored_at IS NULL
          AND sf.confirmed_deleted_at IS NULL
          AND sf.trashed_at IS NOT NULL
        {root_filter}
        ORDER BY sf.trashed_at DESC, sf.id
        """,
        params,
    )
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row["photo_id"]), []).append(row)

    photos: list[dict[str, Any]] = []
    total_size_bytes = 0
    for photo_id, staged_files in grouped.items():
        primary = min(staged_files, key=lambda item: item["staging_file_id"])
        file_size_bytes = sum(_file_size_or_zero(Path(item["staged_path"]), photo_id=photo_id) for item in staged_files)
        total_size_bytes += file_size_bytes
        expires_at, days_remaining = _trash_expiry(primary["trashed_at"])
        photos.append(
            {
                "photo_id": primary["photo_id"],
                "original_path": primary["original_path"],
                "filename": Path(primary["original_path"]).name or primary["file_name"],
                "staging_path": primary["staged_path"],
                "file_size_bytes": file_size_bytes,
                "date_taken": primary["shot_at"],
                "location": primary["gps_city"] or primary["gps_country"],
                "left_at": primary["left_at"],
                "thumbnail_available": _thumbnail_path(photo_id).exists(),
                "trashed_at": primary["trashed_at"],
                "expires_at": expires_at,
                "days_remaining": days_remaining,
            }
        )
    photos.sort(key=lambda item: item["trashed_at"] or "", reverse=True)
    return {
        "total_count": len(photos),
        "total_size_mb": round(total_size_bytes / (1024 * 1024), 1) if total_size_bytes else 0,
        "photos": photos,
    }


def confirm_staging(
    conn,
    confirm: bool,
    photo_ids: list[str | int] | None = None,
    root_path: str | None = None,
    all_roots: bool = False,
) -> dict[str, Any]:
    if not confirm:
        raise StagingError("需要 confirm=true 才能清空 staging")
    resolved_root = resolve_staging_root(conn, root_path, all_roots)
    root_filter = "" if all_roots or not resolved_root else "AND p.root_path = ?"
    params: tuple[Any, ...] = () if all_roots or not resolved_root else (resolved_root,)
    id_filter = ""
    normalized_photo_ids = [str(photo_id) for photo_id in photo_ids] if photo_ids is not None else None
    if normalized_photo_ids:
        id_filter = f"AND sf.photo_id IN ({','.join('?' for _ in normalized_photo_ids)})"
        params = (*params, *normalized_photo_ids)
    rows = fetch_all(
        conn,
        f"""
        SELECT
            sf.*,
            p.root_path,
            p.file_path,
            p.original_path AS photo_original_path,
            p.decision,
            p.status
        FROM staging_files sf
        JOIN photos p ON p.id = sf.photo_id
        WHERE sf.restored_at IS NULL
          AND sf.confirmed_deleted_at IS NULL
          AND sf.trashed_at IS NULL
        {root_filter}
        {id_filter}
        ORDER BY id
        """,
        params,
    )
    if normalized_photo_ids == []:
        rows = []

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row["photo_id"]), []).append(row)

    errors: list[dict[str, str]] = []
    deleted_count = 0
    now = utc_now_iso()
    for requested_id in normalized_photo_ids or []:
        if requested_id not in grouped:
            errors.append({"photo_id": requested_id, "error": "没有可删除的 staging 文件"})

    for photo_id, staged_rows in grouped.items():
        invalid_reason = None
        for row in staged_rows:
            staged = Path(row["staged_path"])
            if not _path_is_in_staging(staged, row["root_path"]):
                invalid_reason = f"文件不在 staging 目录中：{staged}"
                break
            if not staged.exists():
                invalid_reason = f"staging 文件不存在：{staged}"
                break
        if invalid_reason:
            append_audit(
                "error",
                photo_id=photo_id,
                staged_path=staged_rows[0]["staged_path"],
                result="error",
                error=invalid_reason,
            )
            errors.append({"photo_id": photo_id, "error": invalid_reason})
            continue

        row_ids = [row["id"] for row in staged_rows]
        placeholders = ",".join("?" for _ in row_ids)
        with transaction(conn):
            conn.execute(
                f"UPDATE staging_files SET trashed_at = ? WHERE id IN ({placeholders})",
                (now, *row_ids),
            )
            photo = get_photo(conn, photo_id)
            _record_decision_history(
                conn,
                photo=photo,
                new_decision="trash",
                moved_files=[{"staged_path": row["staged_path"], "original_path": row["original_path"]} for row in staged_rows],
                now=now,
            )
            conn.execute(
                """
                UPDATE photos
                SET status = 'trash', decision = 'deleted', updated_at = ?
                WHERE id = ?
                """,
                (now, photo_id),
            )
        deleted_count += 1

    append_audit(
        "staging_confirm",
        extra={
            "details": {"action": "moved_to_trash"},
            "trash_action": "moved_to_trash",
            "deleted_count": deleted_count,
            "trashed_count": deleted_count,
            "freed_bytes": 0,
            "errors": errors,
        },
    )
    return {"deleted_count": deleted_count, "trashed_count": deleted_count, "freed_bytes": 0, "errors": errors}


def purge_trash(
    conn,
    photo_ids: list[str | int] | None = None,
    force: bool = False,
    grace_days: int = 30,
) -> dict[str, Any]:
    normalized_photo_ids = [str(photo_id) for photo_id in photo_ids] if photo_ids else None
    params: tuple[Any, ...] = ()
    id_filter = ""
    expiry_filter = ""
    if normalized_photo_ids:
        id_filter = f"AND sf.photo_id IN ({','.join('?' for _ in normalized_photo_ids)})"
        params = (*params, *normalized_photo_ids)
    elif not force:
        cutoff = _utc_iso(datetime.now(UTC) - timedelta(days=grace_days))
        expiry_filter = "AND sf.trashed_at < ?"
        params = (*params, cutoff)

    rows = fetch_all(
        conn,
        f"""
        SELECT
            sf.*,
            p.root_path
        FROM staging_files sf
        JOIN photos p ON p.id = sf.photo_id
        WHERE sf.restored_at IS NULL
          AND sf.confirmed_deleted_at IS NULL
          AND sf.trashed_at IS NOT NULL
        {id_filter}
        {expiry_filter}
        ORDER BY sf.photo_id, sf.id
        """,
        params,
    )

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row["photo_id"]), []).append(row)

    errors: list[dict[str, str]] = []
    purged_photo_ids: set[str] = set()
    thumbnail_deleted_for: set[str] = set()
    freed_bytes = 0
    now = utc_now_iso()
    for requested_id in normalized_photo_ids or []:
        if requested_id not in grouped:
            errors.append({"photo_id": requested_id, "error": "没有可清除的 trash 文件"})

    for photo_id, staged_rows in grouped.items():
        for row in staged_rows:
            staged = Path(row["staged_path"])
            if not _path_is_in_staging(staged, row["root_path"]):
                error = f"文件不在 staging 目录中：{staged}"
                append_audit("error", photo_id=photo_id, staged_path=str(staged), result="error", error=error)
                errors.append({"photo_id": photo_id, "error": error})
                continue
            if not staged.exists():
                error = f"staging 文件不存在：{staged}"
                append_audit("error", photo_id=photo_id, staged_path=str(staged), result="error", error=error)
                errors.append({"photo_id": photo_id, "error": error})
                continue

            try:
                size = os.path.getsize(staged)
                os.remove(staged)
            except OSError as exc:
                append_audit("error", photo_id=photo_id, staged_path=str(staged), result="error", error=str(exc))
                errors.append({"photo_id": photo_id, "error": str(exc)})
                continue

            with transaction(conn):
                conn.execute(
                    "UPDATE staging_files SET confirmed_deleted_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
                conn.execute(
                    """
                    UPDATE photos
                    SET status = 'deleted', decision = 'deleted', staged_path = NULL, updated_at = ?
                    WHERE id = ?
                    """,
                    (now, photo_id),
                )
            freed_bytes += size
            purged_photo_ids.add(photo_id)

        if photo_id in purged_photo_ids and photo_id not in thumbnail_deleted_for:
            thumbnail = _thumbnail_path(photo_id)
            if thumbnail.exists():
                try:
                    size = os.path.getsize(thumbnail)
                    os.remove(thumbnail)
                    freed_bytes += size
                except OSError as exc:
                    append_audit("error", photo_id=photo_id, staged_path=str(thumbnail), result="error", error=str(exc))
                    errors.append({"photo_id": photo_id, "error": f"缩略图删除失败：{exc}"})
            thumbnail_deleted_for.add(photo_id)

        if photo_id in purged_photo_ids:
            append_audit(
                "purge_trash",
                photo_id=photo_id,
                extra={
                    "purged_files": len([row for row in staged_rows if row["photo_id"] == photo_id]),
                },
            )

    return {"purged_count": len(purged_photo_ids), "freed_bytes": freed_bytes, "errors": errors}


def auto_purge_expired(conn) -> None:
    try:
        result = purge_trash(conn, force=False, grace_days=30)
        if result.get("errors"):
            append_audit("auto_purge_expired", result="error", extra={"errors": result["errors"]})
    except Exception as exc:
        append_audit("auto_purge_expired", result="error", error=str(exc))
