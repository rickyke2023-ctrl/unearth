from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .audit import append_audit, utc_now_iso
from .config import EVENT_GAP_MINUTES, IMAGE_EXTENSIONS, SIDECAR_EXTENSIONS
from .database import fetch_all, transaction
from .errors import DiskNotMountedError


@dataclass(frozen=True)
class ScanProgress:
    scanned: int
    total_estimated: int
    current_file: str | None
    phase: str


class ScanProgressStore:
    def __init__(self) -> None:
        self.current = ScanProgress(0, 0, None, "done")
        self.task_id: str | None = None

    def start(self) -> str:
        self.task_id = f"scan-{uuid.uuid4()}"
        self.current = ScanProgress(0, 0, None, "indexing")
        return self.task_id

    def update(self, **kwargs: Any) -> None:
        data = self.current.__dict__.copy()
        data.update(kwargs)
        self.current = ScanProgress(**data)


progress_store = ScanProgressStore()


def photo_id_for_path(path: Path) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, str(path.resolve())))


def event_id_for(root_path: str, year: int, month: int, idx: int) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"unearth-event:{root_path}:{year}:{month}:{idx}"))


def parse_year_month(path: Path, shot_at: datetime | None) -> tuple[int, int]:
    parts = path.parts
    for idx, part in enumerate(parts[:-1]):
        if part.isdigit() and len(part) == 4 and idx + 1 < len(parts):
            maybe_month = parts[idx + 1]
            if maybe_month.isdigit() and 1 <= int(maybe_month) <= 12:
                return int(part), int(maybe_month)
    if shot_at:
        return shot_at.year, shot_at.month
    modified = datetime.fromtimestamp(path.stat().st_mtime, UTC)
    return modified.year, modified.month


def read_metadata(path: Path) -> dict[str, Any]:
    shot_at: datetime | None = None
    camera_model: str | None = None
    gps_lat: float | None = None
    gps_lng: float | None = None

    try:
        from PIL import ExifTags, Image

        with Image.open(path) as image:
            exif = image.getexif()
            if exif:
                tags = {ExifTags.TAGS.get(k, k): v for k, v in exif.items()}
                camera_model = tags.get("Model") or tags.get("Make")
                raw_dt = tags.get("DateTimeOriginal") or tags.get("DateTime")
                if raw_dt:
                    shot_at = datetime.strptime(str(raw_dt), "%Y:%m:%d %H:%M:%S").replace(tzinfo=UTC)
    except Exception:
        pass

    if shot_at is None:
        try:
            import exifread

            with path.open("rb") as fh:
                tags = exifread.process_file(fh, stop_tag="GPS GPSLongitude", details=False)
            raw_dt = tags.get("EXIF DateTimeOriginal") or tags.get("Image DateTime")
            if raw_dt:
                shot_at = datetime.strptime(str(raw_dt), "%Y:%m:%d %H:%M:%S").replace(tzinfo=UTC)
            if not camera_model and tags.get("Image Model"):
                camera_model = str(tags["Image Model"])
            gps_lat, gps_lng = _gps_from_exifread(tags)
        except Exception:
            pass

    if shot_at is None:
        shot_at = datetime.fromtimestamp(path.stat().st_mtime, UTC)

    year, month = parse_year_month(path, shot_at)
    return {
        "shot_at": shot_at.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "year": year,
        "month": month,
        "gps_lat": gps_lat,
        "gps_lng": gps_lng,
        "gps_city": None,
        "gps_country": None,
        "camera_model": camera_model,
    }


def _gps_from_exifread(tags: dict[str, Any]) -> tuple[float | None, float | None]:
    lat = tags.get("GPS GPSLatitude")
    lat_ref = tags.get("GPS GPSLatitudeRef")
    lng = tags.get("GPS GPSLongitude")
    lng_ref = tags.get("GPS GPSLongitudeRef")
    if not (lat and lat_ref and lng and lng_ref):
        return None, None
    try:
        lat_value = _ratio_triplet_to_float(lat.values)
        lng_value = _ratio_triplet_to_float(lng.values)
        if str(lat_ref) == "S":
            lat_value *= -1
        if str(lng_ref) == "W":
            lng_value *= -1
        return lat_value, lng_value
    except Exception:
        return None, None


def _ratio_triplet_to_float(values: Any) -> float:
    nums = []
    for value in values:
        nums.append(float(value.num) / float(value.den))
    return nums[0] + nums[1] / 60 + nums[2] / 3600


def scan_root(conn, root_path: str) -> dict[str, Any]:
    try:
        root = Path(root_path).expanduser().resolve()
        if not root.exists() or not root.is_dir():
            raise DiskNotMountedError(f"照片根目录不可用：{root}")
        root_path_is_writable = os.access(root, os.W_OK)

        append_audit("scan_start", extra={"root_path": str(root), "root_path_is_writable": root_path_is_writable})
        progress_store.update(scanned=0, total_estimated=0, current_file=None, phase="indexing")

        image_paths = [
            path
            for path in root.rglob("*")
            if path.is_file()
            and path.suffix.lower() in IMAGE_EXTENSIONS
            and "_unearth_staging" not in path.parts
        ]
        total = len(image_paths)
        progress_store.update(total_estimated=total)

        now = utc_now_iso()
        rows: list[dict[str, Any]] = []
        for idx, path in enumerate(image_paths, start=1):
            rel = str(path.relative_to(root))
            progress_store.update(scanned=idx, current_file=rel, phase="indexing")
            stat = path.stat()
            metadata = read_metadata(path)
            sidecars = find_sidecars(path)
            rows.append(
                {
                    "id": photo_id_for_path(path),
                    "root_path": str(root),
                    "file_path": str(path),
                    "original_path": str(path),
                    "file_name": path.name,
                    "dir_path": str(path.parent),
                    "stem": path.stem,
                    "file_type": IMAGE_EXTENSIONS[path.suffix.lower()],
                    "file_size_bytes": stat.st_size,
                    "sidecar_paths": json.dumps([str(p) for p in sidecars], ensure_ascii=False),
                    "created_at": now,
                    "updated_at": now,
                    **metadata,
                }
            )

        with transaction(conn):
            for row in rows:
                conn.execute(
                    """
                    INSERT INTO photos (
                        id, root_path, file_path, original_path, file_name, dir_path, stem,
                        file_type, file_size_bytes, shot_at, year, month, gps_lat, gps_lng,
                        gps_city, gps_country, camera_model, sidecar_paths, created_at, updated_at
                    ) VALUES (
                        :id, :root_path, :file_path, :original_path, :file_name, :dir_path, :stem,
                        :file_type, :file_size_bytes, :shot_at, :year, :month, :gps_lat, :gps_lng,
                        :gps_city, :gps_country, :camera_model, :sidecar_paths, :created_at, :updated_at
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        root_path = excluded.root_path,
                        file_path = CASE
                            WHEN photos.status = 'staged' THEN photos.file_path
                            ELSE excluded.file_path
                        END,
                        original_path = excluded.original_path,
                        file_name = excluded.file_name,
                        dir_path = excluded.dir_path,
                        stem = excluded.stem,
                        file_type = excluded.file_type,
                        file_size_bytes = excluded.file_size_bytes,
                        shot_at = excluded.shot_at,
                        year = excluded.year,
                        month = excluded.month,
                        gps_lat = excluded.gps_lat,
                        gps_lng = excluded.gps_lng,
                        gps_city = excluded.gps_city,
                        gps_country = excluded.gps_country,
                        camera_model = excluded.camera_model,
                        sidecar_paths = excluded.sidecar_paths,
                        updated_at = excluded.updated_at
                    """,
                    row,
                )

        progress_store.update(phase="pairing")
        pair_photos(conn, str(root))
        progress_store.update(phase="clustering")
        cluster_events(conn, str(root))
        total_state = conn.execute(
            "SELECT COUNT(*) AS count, COALESCE(SUM(file_size_bytes), 0) AS size FROM photos"
        ).fetchone()
        conn.execute(
            """
            UPDATE scan_state
            SET root_path = ?, scan_completed = 1, last_scan_at = ?,
                total_photos = ?, total_size_bytes = ?
            WHERE id = 1
            """,
            (str(root), utc_now_iso(), total_state["count"], total_state["size"]),
        )
        conn.commit()
        progress_store.update(scanned=total, total_estimated=total, current_file=None, phase="done")
        append_audit("scan_complete", result="ok", extra={"root_path": str(root), "total": total})
        return {"total_photos": total, "total_size_bytes": sum(row["file_size_bytes"] for row in rows)}
    except Exception:
        progress_store.update(phase="done")
        raise


def find_sidecars(path: Path) -> list[Path]:
    return [
        path.with_suffix(ext)
        for ext in SIDECAR_EXTENSIONS
        if path.with_suffix(ext).exists()
    ] + [
        path.with_suffix(ext.upper())
        for ext in SIDECAR_EXTENSIONS
        if path.with_suffix(ext.upper()).exists()
    ]


def pair_photos(conn, root_path: str | None = None) -> None:
    if root_path:
        conn.execute("UPDATE photos SET paired_photo_id = NULL WHERE root_path = ?", (root_path,))
        photos = fetch_all(conn, "SELECT id, dir_path, stem, file_type FROM photos WHERE root_path = ?", (root_path,))
    else:
        conn.execute("UPDATE photos SET paired_photo_id = NULL")
        photos = fetch_all(conn, "SELECT id, dir_path, stem, file_type FROM photos")
    by_key: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for photo in photos:
        by_key.setdefault((photo["dir_path"], photo["stem"]), []).append(photo)
    for grouped in by_key.values():
        raws = [p for p in grouped if p["file_type"].startswith("RAW_")]
        jpgs = [p for p in grouped if p["file_type"] == "JPEG"]
        if not raws or not jpgs:
            continue
        raw = raws[0]
        jpg = jpgs[0]
        conn.execute("UPDATE photos SET paired_photo_id = ? WHERE id = ?", (jpg["id"], raw["id"]))
        conn.execute("UPDATE photos SET paired_photo_id = ? WHERE id = ?", (raw["id"], jpg["id"]))
    conn.commit()


def cluster_events(conn, root_path: str | None = None) -> None:
    if root_path:
        conn.execute("UPDATE photos SET event_id = NULL WHERE root_path = ?", (root_path,))
        conn.execute("DELETE FROM events WHERE root_path = ?", (root_path,))
        params = (root_path,)
        where = "WHERE root_path = ?"
    else:
        conn.execute("UPDATE photos SET event_id = NULL")
        conn.execute("DELETE FROM events")
        params = ()
        where = ""
    photos = fetch_all(
        conn,
        f"""
        SELECT id, root_path, file_path, year, month, shot_at, gps_city, gps_country
        FROM photos
        {where}
        ORDER BY year, month, shot_at, file_name
        """,
        params,
    )
    by_month: dict[tuple[str, int, int], list[dict[str, Any]]] = {}
    for photo in photos:
        by_month.setdefault((photo["root_path"], photo["year"], photo["month"]), []).append(photo)

    for (photo_root_path, year, month), month_photos in by_month.items():
        event_index = 0
        current: list[dict[str, Any]] = []
        last_dt: datetime | None = None
        for photo in month_photos:
            had_shot_at = bool(photo.get("shot_at"))
            shot_at = shot_at_or_file_mtime(photo)
            photo["shot_at"] = shot_at.replace(microsecond=0).isoformat().replace("+00:00", "Z")
            if not had_shot_at:
                conn.execute("UPDATE photos SET shot_at = ? WHERE id = ?", (photo["shot_at"], photo["id"]))
            if last_dt and shot_at - last_dt >= timedelta(minutes=EVENT_GAP_MINUTES):
                _insert_event(conn, photo_root_path, year, month, event_index, current)
                event_index += 1
                current = []
            current.append(photo)
            last_dt = shot_at
        if current:
            _insert_event(conn, photo_root_path, year, month, event_index, current)
    conn.commit()


def shot_at_or_file_mtime(photo: dict[str, Any]) -> datetime:
    raw_shot_at = photo.get("shot_at")
    if raw_shot_at:
        return datetime.fromisoformat(raw_shot_at.replace("Z", "+00:00"))
    path = Path(photo["file_path"])
    return datetime.fromtimestamp(path.stat().st_mtime, UTC)


def _insert_event(conn, root_path: str, year: int, month: int, event_index: int, photos: list[dict[str, Any]]) -> None:
    event_id = event_id_for(root_path, year, month, event_index)
    started_at = photos[0]["shot_at"]
    ended_at = photos[-1]["shot_at"]
    cover_photo_id = photos[0]["id"]
    primary_location = None
    for photo in photos:
        if photo["gps_city"] or photo["gps_country"]:
            primary_location = ", ".join(part for part in [photo["gps_city"], photo["gps_country"]] if part)
            break
    conn.execute(
        """
        INSERT INTO events (id, root_path, year, month, started_at, ended_at, photo_count, cover_photo_id, primary_location, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        """,
        (event_id, root_path, year, month, started_at, ended_at, len(photos), cover_photo_id, primary_location),
    )
    conn.executemany(
        "UPDATE photos SET event_id = ? WHERE id = ?",
        [(event_id, photo["id"]) for photo in photos],
    )
