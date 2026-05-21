from __future__ import annotations

from typing import Any

from .database import fetch_all, fetch_one


KEPT_ACTIVE_WHERE = "decision = 'keep' AND status = 'active'"


def kept_photos(conn, *, limit: int = 50, offset: int = 0, year: int | None = None) -> dict[str, Any]:
    limit = min(max(1, limit), 200)
    offset = max(0, offset)

    count_row = fetch_one(
        conn,
        f"""
        SELECT COUNT(*) AS total_count
        FROM photos
        WHERE {KEPT_ACTIVE_WHERE}
          AND (:year IS NULL OR year = :year)
        """,
        {"year": year},
    ) or {"total_count": 0}

    by_year_rows = fetch_all(
        conn,
        f"""
        SELECT year, COUNT(*) AS photo_count
        FROM photos
        WHERE {KEPT_ACTIVE_WHERE}
        GROUP BY year
        ORDER BY year DESC
        """,
    )

    rows = fetch_all(
        conn,
        f"""
        SELECT {_photo_columns()}
        FROM photos
        WHERE {KEPT_ACTIVE_WHERE}
          AND (:year IS NULL OR year = :year)
        ORDER BY shot_at DESC
        LIMIT :limit OFFSET :offset
        """,
        {"year": year, "limit": limit, "offset": offset},
    )

    return {
        "total_count": count_row["total_count"] or 0,
        "by_year": {str(row["year"]): row["photo_count"] for row in by_year_rows if row["year"] is not None},
        "photos": [_photo(row) for row in rows],
    }


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
