from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "unearth.db"
PREVIEW_DIR = DATA_DIR / "previews"
AUDIT_LOG_PATH = DATA_DIR / "audit.jsonl"

IMAGE_EXTENSIONS = {
    ".arw": "RAW_SONY",
    ".raf": "RAW_FUJI",
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".heif": "HEIF",
    ".heic": "HEIC",
    ".png": "PNG",
}
RAW_TYPES = {"RAW_SONY", "RAW_FUJI"}
NON_RAW_TYPES = {"JPEG", "HEIF", "HEIC", "PNG"}
SIDECAR_EXTENSIONS = {".xmp", ".xml"}

EVENT_GAP_MINUTES = 30
PREVIEW_MAX_EDGE = 1200
STAGING_LIMIT_BYTES = 200 * 1024 * 1024 * 1024


def ensure_runtime_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

