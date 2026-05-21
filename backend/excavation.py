from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException

from .database import fetch_all


ELIGIBLE_PHOTO_WHERE = """
    decision IS NULL
    AND status = 'active'
    AND preview_path IS NOT NULL
    AND preview_path != ''
"""


def today_excavation(conn, *, limit: int = 20, date_value: str | None = None) -> dict[str, Any]:
    target_date = _target_date(date_value)
    month_day = target_date.strftime("%m-%d")
    limit = min(max(1, limit), 20)

    cross_year_rows = fetch_all(
        conn,
        f"""
        SELECT {_photo_columns()}
        FROM photos
        WHERE {ELIGIBLE_PHOTO_WHERE}
          AND shot_at IS NOT NULL
          AND strftime('%m-%d', shot_at) = ?
        ORDER BY year ASC, shot_at ASC, file_name ASC
        """,
        (month_day,),
    )
    cross_year_photos = _select_cross_year(cross_year_rows, limit)

    photos = list(cross_year_photos)
    supplemented = False
    if len(cross_year_photos) < 5 and len(photos) < limit:
        recent_photos = _recent_undecided(conn, limit - len(photos), {photo["id"] for photo in photos})
        supplemented = bool(recent_photos)
        photos.extend(recent_photos)

    return {
        "date_label": f"{target_date.month}月{target_date.day}日",
        "source": "supplemented" if supplemented else "cross_year",
        "photos": photos[:limit],
        "total": min(len(photos), limit),
        "cross_year_count": len(cross_year_photos),
        "supplemented": supplemented,
    }


def _target_date(date_value: str | None) -> datetime:
    if date_value is None:
        return datetime.now(UTC) + timedelta(hours=8)
    try:
        return datetime.strptime(date_value, "%Y-%m-%d").replace(tzinfo=UTC)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "date 参数格式必须是 YYYY-MM-DD", "code": "INVALID_DATE"},
        ) from exc


def _select_cross_year(rows: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    years = sorted({row["year"] for row in rows if row["year"] is not None})
    if not years:
        return []

    per_year_limit = limit // len(years) + 1
    selected_by_year: dict[int, int] = {year: 0 for year in years}
    selected: list[dict[str, Any]] = []
    for row in rows:
        year = row["year"]
        if year is None or selected_by_year.get(year, 0) >= per_year_limit:
            continue
        selected.append(_photo(row))
        selected_by_year[year] = selected_by_year.get(year, 0) + 1
        if len(selected) >= limit:
            break
    return selected


def _recent_undecided(conn, limit: int, excluded_photo_ids: set[str]) -> list[dict[str, Any]]:
    if limit <= 0:
        return []

    params: list[Any] = []
    excluded_clause = ""
    if excluded_photo_ids:
        placeholders = ",".join("?" for _ in excluded_photo_ids)
        excluded_clause = f"AND id NOT IN ({placeholders})"
        params.extend(sorted(excluded_photo_ids))
    params.append(limit)

    rows = fetch_all(
        conn,
        f"""
        SELECT {_photo_columns()}
        FROM photos
        WHERE {ELIGIBLE_PHOTO_WHERE}
          {excluded_clause}
        ORDER BY shot_at DESC, file_name DESC
        LIMIT ?
        """,
        tuple(params),
    )
    return [_photo(row) for row in rows]


def _photo_columns() -> str:
    return """
        id,
        file_path,
        file_name,
        file_type,
        file_size_bytes,
        shot_at,
        year,
        gps_city,
        gps_country,
        camera_model,
        decision,
        is_book_candidate,
        1 AS preview_ready,
        event_id
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
        "gps_city": row["gps_city"],
        "gps_country": row["gps_country"],
        "camera_model": row["camera_model"],
        "decision": row["decision"],
        "is_book_candidate": bool(row["is_book_candidate"]),
        "preview_ready": bool(row["preview_ready"]),
        "event_id": row["event_id"],
    }
