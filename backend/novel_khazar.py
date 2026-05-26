from __future__ import annotations

import uuid
from typing import Any

from .database import fetch_all, fetch_one


ACTIVE_PHOTO_WHERE = "status NOT IN ('staged', 'deleted')"
HOUR_EXPR = "CAST(substr(shot_at, 12, 2) AS INTEGER)"
MONTH_EXPR = "CAST(substr(shot_at, 6, 2) AS INTEGER)"

TIME_BUCKETS = [
    ("清晨", "hour BETWEEN 4 AND 6"),
    ("上午", "hour BETWEEN 7 AND 11"),
    ("午后", "hour BETWEEN 12 AND 16"),
    ("傍晚", "hour BETWEEN 17 AND 19"),
    ("夜晚", "(hour BETWEEN 20 AND 23 OR hour BETWEEN 0 AND 3)"),
]

SEASON_BUCKETS = [
    ("春", "month BETWEEN 3 AND 5"),
    ("夏", "month BETWEEN 6 AND 8"),
    ("秋", "month BETWEEN 9 AND 11"),
    ("冬", "(month = 12 OR month BETWEEN 1 AND 2)"),
]

MEDIUM_TITLES = {
    "RAW_SONY": "索尼 RAW",
    "RAW_FUJI": "富士 RAW",
    "JPEG": "JPEG",
    "HEIF": "HEIF",
}


def khazar_entries(conn) -> list[dict[str, Any]]:
    entries = []
    entries.extend(_time_entries(conn))
    entries.extend(_camera_entries(conn))
    entries.extend(_medium_entries(conn))
    entries.extend(_season_entries(conn))
    return sorted(entries, key=lambda entry: (entry["type"], -entry["photo_count"]))


def khazar_entry_photos(conn, entry_id: str, limit: int = 50, offset: int = 0) -> dict[str, Any]:
    entry = _find_entry(conn, entry_id)
    limit = min(max(1, limit), 200)
    offset = max(0, offset)

    count_row = fetch_one(
        conn,
        f"""
        SELECT COUNT(*) AS total
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND {_entry_where(entry)}
        """,
        _entry_params(entry),
    ) or {"total": 0}

    rows = fetch_all(
        conn,
        f"""
        SELECT {_photo_columns()}
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND {_entry_where(entry)}
        ORDER BY shot_at ASC, file_name ASC
        LIMIT :limit OFFSET :offset
        """,
        {**_entry_params(entry), "limit": limit, "offset": offset},
    )

    return {
        "entry_id": entry_id,
        "photos": [_photo(row) for row in rows],
        "total": count_row["total"] or 0,
    }


def khazar_entry_stats(conn, entry_id: str) -> dict[str, Any]:
    entry = _find_entry(conn, entry_id)
    photo_ids = _entry_photo_ids(conn, entry)
    cross_refs = []

    for other in khazar_entries(conn):
        if other["entry_id"] == entry_id:
            continue
        overlap_count = len(photo_ids & _entry_photo_ids(conn, other))
        if overlap_count > 0:
            cross_refs.append(
                {
                    "entry_id": other["entry_id"],
                    "title": other["title"],
                    "type": other["type"],
                    "overlap_count": overlap_count,
                }
            )

    cross_refs.sort(key=lambda ref: (-ref["overlap_count"], ref["type"], ref["title"]))
    return {
        "entry_id": entry["entry_id"],
        "title": entry["title"],
        "type": entry["type"],
        "photo_count": entry["photo_count"],
        "cross_refs": cross_refs,
    }


def _time_entries(conn) -> list[dict[str, Any]]:
    entries = []
    for label, condition in TIME_BUCKETS:
        row = fetch_one(
            conn,
            f"""
            WITH typed AS (
                SELECT id, shot_at, file_name, CAST(substr(shot_at, 12, 2) AS INTEGER) AS hour
                FROM photos
                WHERE {ACTIVE_PHOTO_WHERE}
                  AND shot_at IS NOT NULL
                  AND length(shot_at) >= 13
            )
            SELECT COUNT(*) AS photo_count,
                   (
                       SELECT id
                       FROM typed
                       WHERE {condition}
                       ORDER BY shot_at ASC, file_name ASC
                       LIMIT 1
                   ) AS cover_photo_id
            FROM typed
            WHERE {condition}
            """,
        ) or {"photo_count": 0, "cover_photo_id": None}
        if row["photo_count"]:
            entries.append(_entry("time", label, int(row["photo_count"]), row["cover_photo_id"]))
    return entries


def _camera_entries(conn) -> list[dict[str, Any]]:
    rows = fetch_all(
        conn,
        f"""
        SELECT camera_model AS title,
               COUNT(*) AS photo_count,
               (
                   SELECT p2.id
                   FROM photos p2
                   WHERE {ACTIVE_PHOTO_WHERE.replace("status", "p2.status")}
                     AND p2.camera_model = photos.camera_model
                   ORDER BY p2.shot_at ASC, p2.file_name ASC
                   LIMIT 1
               ) AS cover_photo_id
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND camera_model IS NOT NULL
          AND trim(camera_model) != ''
        GROUP BY camera_model
        """,
    )
    return [_entry("camera", row["title"], int(row["photo_count"]), row["cover_photo_id"]) for row in rows]


def _medium_entries(conn) -> list[dict[str, Any]]:
    rows = fetch_all(
        conn,
        f"""
        SELECT file_type,
               COUNT(*) AS photo_count,
               (
                   SELECT p2.id
                   FROM photos p2
                   WHERE {ACTIVE_PHOTO_WHERE.replace("status", "p2.status")}
                     AND p2.file_type = photos.file_type
                   ORDER BY p2.shot_at ASC, p2.file_name ASC
                   LIMIT 1
               ) AS cover_photo_id
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
        GROUP BY file_type
        """,
    )
    return [
        _entry(
            "medium",
            MEDIUM_TITLES.get(row["file_type"], row["file_type"]),
            int(row["photo_count"]),
            row["cover_photo_id"],
            row["file_type"],
        )
        for row in rows
    ]


def _season_entries(conn) -> list[dict[str, Any]]:
    entries = []
    for label, condition in SEASON_BUCKETS:
        row = fetch_one(
            conn,
            f"""
            WITH typed AS (
                SELECT id, shot_at, file_name, CAST(substr(shot_at, 6, 2) AS INTEGER) AS month
                FROM photos
                WHERE {ACTIVE_PHOTO_WHERE}
                  AND shot_at IS NOT NULL
                  AND length(shot_at) >= 7
            )
            SELECT COUNT(*) AS photo_count,
                   (
                       SELECT id
                       FROM typed
                       WHERE {condition}
                       ORDER BY shot_at ASC, file_name ASC
                       LIMIT 1
                   ) AS cover_photo_id
            FROM typed
            WHERE {condition}
            """,
        ) or {"photo_count": 0, "cover_photo_id": None}
        if row["photo_count"]:
            entries.append(_entry("season", label, int(row["photo_count"]), row["cover_photo_id"]))
    return entries


def _entry(
    kind: str,
    title: str,
    photo_count: int,
    cover_photo_id: str | None,
    value: str | None = None,
) -> dict[str, Any]:
    raw_value = value if value is not None else title
    return {
        "entry_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"khazar-{kind}:{raw_value}")),
        "title": title,
        "type": kind,
        "photo_count": photo_count,
        "cover_photo_id": cover_photo_id,
    }


def _find_entry(conn, entry_id: str) -> dict[str, Any]:
    for entry in khazar_entries(conn):
        if entry["entry_id"] == entry_id:
            return entry
    raise ValueError("Khazar entry not found")


def _entry_where(entry: dict[str, Any]) -> str:
    if entry["type"] == "time":
        condition = dict(TIME_BUCKETS)[entry["title"]]
        return (
            "shot_at IS NOT NULL AND length(shot_at) >= 13 "
            f"AND {condition.replace('hour', HOUR_EXPR)}"
        )
    if entry["type"] == "camera":
        return "camera_model = :title"
    if entry["type"] == "medium":
        return "file_type = :file_type"
    if entry["type"] == "season":
        condition = dict(SEASON_BUCKETS)[entry["title"]]
        return (
            "shot_at IS NOT NULL AND length(shot_at) >= 7 "
            f"AND {condition.replace('month', MONTH_EXPR)}"
        )
    raise ValueError("Unsupported Khazar entry type")


def _entry_params(entry: dict[str, Any]) -> dict[str, Any]:
    if entry["type"] == "camera":
        return {"title": entry["title"]}
    if entry["type"] == "medium":
        title_to_file_type = {title: file_type for file_type, title in MEDIUM_TITLES.items()}
        return {"file_type": title_to_file_type.get(entry["title"], entry["title"])}
    return {}


def _entry_photo_ids(conn, entry: dict[str, Any]) -> set[str]:
    rows = fetch_all(
        conn,
        f"""
        SELECT id
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND {_entry_where(entry)}
        """,
        _entry_params(entry),
    )
    return {row["id"] for row in rows}


def _photo_columns() -> str:
    return """
        id,
        file_path,
        file_name,
        file_type,
        file_size_bytes,
        shot_at,
        year,
        month,
        gps_city,
        gps_country,
        camera_model,
        decision,
        is_book_candidate,
        CASE WHEN preview_path IS NOT NULL AND preview_path != '' THEN 1 ELSE 0 END AS preview_ready,
        event_id,
        CASE WHEN sidecar_paths != '[]' THEN 1 ELSE 0 END AS has_xmp_sidecar,
        paired_photo_id
    """


def _photo(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "file_path": row["file_path"],
        "file_name": row["file_name"],
        "file_type": row["file_type"],
        "file_size_bytes": row["file_size_bytes"],
        "shot_at": row["shot_at"],
        "year": row["year"],
        "month": row["month"],
        "gps_city": row["gps_city"],
        "gps_country": row["gps_country"],
        "camera_model": row["camera_model"],
        "decision": row["decision"],
        "is_book_candidate": bool(row["is_book_candidate"]),
        "preview_ready": bool(row["preview_ready"]),
        "event_id": row["event_id"],
        "has_xmp_sidecar": bool(row["has_xmp_sidecar"]),
        "paired_photo_id": row["paired_photo_id"],
    }
