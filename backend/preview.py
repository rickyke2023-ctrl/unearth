from __future__ import annotations

from pathlib import Path

from fastapi import Response
from fastapi.responses import FileResponse

from .config import PREVIEW_DIR, PREVIEW_MAX_EDGE, RAW_TYPES, ensure_runtime_dirs
from .errors import PreviewNotReadyError
from .staging import get_photo


def preview_path(photo_id: str) -> Path:
    ensure_runtime_dirs()
    return PREVIEW_DIR / f"{photo_id}.jpg"


def get_or_create_preview(conn, photo_id: str):
    photo = get_photo(conn, photo_id)
    target = preview_path(photo_id)
    if target.exists():
        return FileResponse(target, media_type="image/jpeg")
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
    return FileResponse(target, media_type="image/jpeg")


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

