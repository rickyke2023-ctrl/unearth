from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from threading import Lock, Thread

from fastapi import Response
from fastapi.responses import FileResponse

from .config import PREVIEW_DIR, PREVIEW_MAX_EDGE, RAW_TYPES, ensure_runtime_dirs
from .database import fetch_all, fetch_one, get_connection, init_db
from .errors import PreviewNotReadyError
from .staging import get_photo


def preview_path(photo_id: str) -> Path:
    ensure_runtime_dirs()
    return PREVIEW_DIR / f"{photo_id}.jpg"


@dataclass
class PreviewGenerationState:
    running: bool = False
    total: int = 0
    processed: int = 0
    errors: int = 0


preview_state = PreviewGenerationState()
preview_state_lock = Lock()


def get_or_create_preview(conn, photo_id: str):
    photo = get_photo(conn, photo_id)
    target = ensure_preview_for_photo(conn, photo)
    return FileResponse(target, media_type="image/jpeg")


def ensure_preview_for_photo(conn, photo: dict) -> Path:
    photo_id = photo["id"]
    target = preview_path(photo_id)
    if target.exists():
        if not photo.get("preview_path"):
            conn.execute("UPDATE photos SET preview_path = ? WHERE id = ?", (str(target), photo_id))
            conn.commit()
        return target
    source = Path(photo["file_path"])
    if not source.exists():
        source = Path(photo["original_path"])
    if not source.exists():
        raise PreviewNotReadyError("原始文件不可用，无法生成预览")

    try:
        if photo["file_type"] in RAW_TYPES:
            _create_raw_preview(source, target)
        else:
            _create_image_preview(source, target)
    except Exception as exc:
        raise PreviewNotReadyError(f"预览图生成中或当前格式暂不可预览：{exc}") from exc
    conn.execute("UPDATE photos SET preview_path = ? WHERE id = ?", (str(target), photo_id))
    conn.commit()
    return target


def start_preview_generation(conn) -> None:
    db_info = conn.execute("PRAGMA database_list").fetchone()
    db_path = db_info["file"] if db_info else ""
    if not db_path:
        return
    with preview_state_lock:
        if preview_state.running:
            return
        preview_state.running = True
        preview_state.processed = 0
        preview_state.errors = 0
    thread = Thread(target=generate_missing_previews, args=(db_path,), daemon=True)
    thread.start()


def generate_missing_previews(db_path: str) -> None:
    conn = get_connection(db_path)
    init_db(conn)
    rows = fetch_all(
        conn,
        """
        SELECT *
        FROM photos
        WHERE preview_path IS NULL OR preview_path = ''
        ORDER BY shot_at, file_name
        """,
    )
    with preview_state_lock:
        preview_state.total = len(rows)
    for row in rows:
        try:
            ensure_preview_for_photo(conn, row)
        except Exception:
            with preview_state_lock:
                preview_state.errors += 1
        finally:
            with preview_state_lock:
                preview_state.processed += 1
    with preview_state_lock:
        preview_state.running = False
    conn.close()


def preview_status(conn) -> dict[str, int]:
    total_row = fetch_one(conn, "SELECT COUNT(*) AS count FROM photos") or {"count": 0}
    ready_row = fetch_one(
        conn,
        "SELECT COUNT(*) AS count FROM photos WHERE preview_path IS NOT NULL AND preview_path != ''",
    ) or {"count": 0}
    total = total_row["count"] or 0
    ready = ready_row["count"] or 0
    return {"total": total, "ready": ready, "pending": max(total - ready, 0)}


def _create_image_preview(source: Path, target: Path) -> None:
    from PIL import Image, ImageOps

    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        image.thumbnail((PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE))
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "JPEG", quality=85, optimize=True)


def _create_raw_preview(source: Path, target: Path) -> None:
    try:
        import rawpy

        with rawpy.imread(str(source)) as raw:
            try:
                thumb = raw.extract_thumb()
                if thumb.format == rawpy.ThumbFormat.JPEG:
                    target.write_bytes(thumb.data)
                    return
            except Exception:
                pass
            rgb = raw.postprocess(use_camera_wb=True, half_size=True)
        from PIL import Image

        image = Image.fromarray(rgb)
        image.thumbnail((PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE))
        image.save(target, "JPEG", quality=85, optimize=True)
    except ImportError as exc:
        raise RuntimeError("rawpy 未安装") from exc


def accepted_preview_response(message: str) -> Response:
    return Response(content=message, status_code=202, media_type="text/plain")
