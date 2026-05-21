from __future__ import annotations

from datetime import date
from typing import Any

from .database import fetch_all, fetch_one


ACTIVE_PHOTO_WHERE = """
    (decision IS NULL OR decision != 'leave')
    AND status NOT IN ('staged', 'deleted')
"""


def today_story(conn, month: int | None = None, day: int | None = None, limit: int = 20) -> dict[str, Any]:
    today = date.today()
    month = month or today.month
    day = day or today.day
    limit = max(1, limit)

    return {
        "date_label": f"{month}月{day}日",
        "cross_year": cross_year_story(conn, month, day, limit),
        "full_day": full_day_story(conn, month, day, limit),
    }


def cross_year_story(conn, month: int, day: int, limit: int = 20) -> dict[str, Any] | None:
    month_day = f"{month:02d}-{day:02d}"
    rows = fetch_all(
        conn,
        f"""
        SELECT
            id AS photo_id,
            shot_at,
            CAST(strftime('%Y', shot_at) AS INTEGER) AS year,
            file_name AS filename,
            CASE WHEN preview_path IS NOT NULL AND preview_path != '' THEN 1 ELSE 0 END AS thumbnail_available,
            gps_city,
            file_path
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND shot_at IS NOT NULL
          AND strftime('%m-%d', shot_at) = ?
        ORDER BY shot_at ASC, file_name ASC
        """,
        (month_day,),
    )
    if not rows:
        return None

    years = sorted({row["year"] for row in rows if row["year"] is not None})
    per_year = max(1, limit // max(1, len(years)))
    selected: list[dict[str, Any]] = []
    selected_by_year: dict[int, int] = {year: 0 for year in years}
    for row in rows:
        year = row["year"]
        if year is None or selected_by_year.get(year, 0) >= per_year:
            continue
        selected.append(_photo(row))
        selected_by_year[year] = selected_by_year.get(year, 0) + 1
        if len(selected) >= limit:
            break

    return {
        "type": "cross_year",
        "title": "同一天，不同年份",
        "subtitle": f"{month}月{day}日，你拍过这些",
        "years": years,
        "photos": selected,
        "total_count": len(rows),
    }


def full_day_story(conn, month: int, day: int, limit: int = 20) -> dict[str, Any] | None:
    month_day = f"{month:02d}-{day:02d}"
    best_day = fetch_one(
        conn,
        f"""
        SELECT date(shot_at) AS shot_date, COUNT(*) AS photo_count
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND shot_at IS NOT NULL
          AND strftime('%m-%d', shot_at) = ?
        GROUP BY date(shot_at)
        ORDER BY photo_count DESC, shot_date DESC
        LIMIT 1
        """,
        (month_day,),
    )
    if not best_day or not best_day.get("shot_date"):
        return None

    rows = fetch_all(
        conn,
        f"""
        SELECT
            id AS photo_id,
            shot_at,
            CAST(strftime('%Y', shot_at) AS INTEGER) AS year,
            file_name AS filename,
            CASE WHEN preview_path IS NOT NULL AND preview_path != '' THEN 1 ELSE 0 END AS thumbnail_available,
            gps_city,
            file_path
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND shot_at IS NOT NULL
          AND date(shot_at) = ?
        ORDER BY shot_at ASC, file_name ASC
        """,
        (best_day["shot_date"],),
    )
    if not rows:
        return None

    year = rows[0]["year"]
    return {
        "type": "full_day",
        "title": "一天的故事",
        "subtitle": f"{year}年{month}月{day}日，从早到晚",
        "year": year,
        "photos": [_photo(row) for row in rows[:limit]],
        "time_segments": _time_segments(rows),
        "total_count": len(rows),
    }


def themes(conn, min_photos: int = 3, limit: int = 20) -> dict[str, Any]:
    min_photos = max(1, min_photos)
    limit = max(1, limit)
    photos_with_gps = _count_photos_with_gps(conn)
    photos_without_gps = _count_photos_without_gps(conn)

    city_themes = _city_themes(conn, min_photos)
    grid_themes = _grid_themes(conn, min_photos)
    all_themes = sorted(city_themes + grid_themes, key=lambda item: item["photo_count"], reverse=True)

    return {
        "themes": all_themes[:limit],
        "total_themes": len(all_themes),
        "photos_with_gps": photos_with_gps,
        "photos_without_gps": photos_without_gps,
    }


def theme_story(conn, theme_id: str, limit: int = 200) -> dict[str, Any]:
    limit = max(1, limit)
    if theme_id.startswith("city_"):
        label = theme_id[len("city_") :]
        if not label:
            raise ValueError("city theme_id 缺少城市名")
        total_count = _city_total_count(conn, label)
        rows = fetch_all(
            conn,
            f"""
            SELECT
                id AS photo_id,
                shot_at,
                year,
                file_name AS filename,
                CASE WHEN preview_path IS NOT NULL AND preview_path != '' THEN 1 ELSE 0 END AS thumbnail_available,
                gps_city,
                file_path
            FROM photos
            WHERE {ACTIVE_PHOTO_WHERE}
              AND gps_city = ?
            ORDER BY year ASC, shot_at ASC, file_name ASC
            LIMIT ?
            """,
            (label, limit),
        )
    elif theme_id.startswith("grid_"):
        lat, lng = _parse_grid_theme_id(theme_id)
        label = _grid_label(lat, lng)
        total_count = _grid_total_count(conn, lat, lng)
        rows = fetch_all(
            conn,
            f"""
            SELECT
                id AS photo_id,
                shot_at,
                year,
                file_name AS filename,
                CASE WHEN preview_path IS NOT NULL AND preview_path != '' THEN 1 ELSE 0 END AS thumbnail_available,
                gps_city,
                file_path
            FROM photos
            WHERE {ACTIVE_PHOTO_WHERE}
              AND (gps_city IS NULL OR gps_city = '')
              AND ROUND(gps_lat, 2) = ?
              AND ROUND(gps_lng, 2) = ?
            ORDER BY year ASC, shot_at ASC, file_name ASC
            LIMIT ?
            """,
            (lat, lng, limit),
        )
    else:
        raise ValueError("theme_id 必须以 city_ 或 grid_ 开头")

    photos_by_year: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        year_key = str(row["year"])
        photos_by_year.setdefault(year_key, []).append(_photo(row))

    return {
        "theme_id": theme_id,
        "label": label,
        "photos_by_year": photos_by_year,
        "total_count": total_count,
    }


def _city_themes(conn, min_photos: int) -> list[dict[str, Any]]:
    rows = fetch_all(
        conn,
        f"""
        SELECT
            gps_city AS label,
            COUNT(*) AS photo_count,
            MIN(year) AS first_year,
            MAX(year) AS last_year
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND gps_city IS NOT NULL
          AND gps_city != ''
        GROUP BY gps_city
        HAVING photo_count >= ?
        ORDER BY photo_count DESC
        """,
        (min_photos,),
    )
    result = []
    for row in rows:
        label = row["label"]
        result.append(
            {
                "theme_id": f"city_{label}",
                "label": label,
                "type": "city",
                "photo_count": row["photo_count"],
                "year_range": [row["first_year"], row["last_year"]],
                "cover_photo_id": _city_cover_photo_id(conn, label),
                "sample_photo_ids": _city_sample_photo_ids(conn, label),
            }
        )
    return result


def _grid_themes(conn, min_photos: int) -> list[dict[str, Any]]:
    rows = fetch_all(
        conn,
        f"""
        SELECT
            ROUND(gps_lat, 2) AS lat_key,
            ROUND(gps_lng, 2) AS lng_key,
            COUNT(*) AS photo_count,
            MIN(year) AS first_year,
            MAX(year) AS last_year
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND (gps_city IS NULL OR gps_city = '')
          AND gps_lat IS NOT NULL
          AND gps_lng IS NOT NULL
        GROUP BY lat_key, lng_key
        HAVING photo_count >= ?
        ORDER BY photo_count DESC
        """,
        (min_photos,),
    )
    result = []
    for row in rows:
        lat = float(row["lat_key"])
        lng = float(row["lng_key"])
        result.append(
            {
                "theme_id": f"grid_{lat:.2f}_{lng:.2f}",
                "label": _grid_label(lat, lng),
                "type": "grid",
                "photo_count": row["photo_count"],
                "year_range": [row["first_year"], row["last_year"]],
                "cover_photo_id": _grid_cover_photo_id(conn, lat, lng),
                "sample_photo_ids": _grid_sample_photo_ids(conn, lat, lng),
            }
        )
    return result


def _city_cover_photo_id(conn, city: str) -> str | None:
    row = fetch_one(
        conn,
        f"""
        SELECT id
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND gps_city = ?
          AND preview_path IS NOT NULL
          AND preview_path != ''
        ORDER BY shot_at DESC, file_name DESC
        LIMIT 1
        """,
        (city,),
    )
    return row["id"] if row else None


def _city_total_count(conn, city: str) -> int:
    row = fetch_one(
        conn,
        f"""
        SELECT COUNT(*) AS count
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND gps_city = ?
        """,
        (city,),
    )
    return int(row["count"] if row else 0)


def _grid_total_count(conn, lat: float, lng: float) -> int:
    row = fetch_one(
        conn,
        f"""
        SELECT COUNT(*) AS count
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND (gps_city IS NULL OR gps_city = '')
          AND ROUND(gps_lat, 2) = ?
          AND ROUND(gps_lng, 2) = ?
        """,
        (lat, lng),
    )
    return int(row["count"] if row else 0)


def _grid_cover_photo_id(conn, lat: float, lng: float) -> str | None:
    row = fetch_one(
        conn,
        f"""
        SELECT id
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND (gps_city IS NULL OR gps_city = '')
          AND ROUND(gps_lat, 2) = ?
          AND ROUND(gps_lng, 2) = ?
          AND preview_path IS NOT NULL
          AND preview_path != ''
        ORDER BY shot_at DESC, file_name DESC
        LIMIT 1
        """,
        (lat, lng),
    )
    return row["id"] if row else None


def _city_sample_photo_ids(conn, city: str) -> list[str]:
    rows = fetch_all(
        conn,
        f"""
        SELECT id
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND gps_city = ?
        ORDER BY shot_at DESC, file_name DESC
        LIMIT 3
        """,
        (city,),
    )
    return [row["id"] for row in rows]


def _grid_sample_photo_ids(conn, lat: float, lng: float) -> list[str]:
    rows = fetch_all(
        conn,
        f"""
        SELECT id
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND (gps_city IS NULL OR gps_city = '')
          AND ROUND(gps_lat, 2) = ?
          AND ROUND(gps_lng, 2) = ?
        ORDER BY shot_at DESC, file_name DESC
        LIMIT 3
        """,
        (lat, lng),
    )
    return [row["id"] for row in rows]


def _count_photos_with_gps(conn) -> int:
    row = fetch_one(
        conn,
        f"""
        SELECT COUNT(*) AS count
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND gps_lat IS NOT NULL
          AND gps_lng IS NOT NULL
        """,
    )
    return int(row["count"] if row else 0)


def _count_photos_without_gps(conn) -> int:
    row = fetch_one(
        conn,
        f"""
        SELECT COUNT(*) AS count
        FROM photos
        WHERE {ACTIVE_PHOTO_WHERE}
          AND (gps_lat IS NULL OR gps_lng IS NULL)
        """,
    )
    return int(row["count"] if row else 0)


def _photo(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "photo_id": row["photo_id"],
        "shot_at": row["shot_at"],
        "year": row["year"],
        "filename": row["filename"],
        "thumbnail_available": bool(row["thumbnail_available"]),
        "gps_city": row["gps_city"],
        "file_path": row["file_path"],
    }


def _time_segments(rows: list[dict[str, Any]]) -> dict[str, int]:
    segments = {"morning": 0, "afternoon": 0, "evening": 0, "night": 0}
    for row in rows:
        hour = _hour(row["shot_at"])
        if hour is None:
            continue
        if 6 <= hour < 12:
            segments["morning"] += 1
        elif 12 <= hour < 18:
            segments["afternoon"] += 1
        elif 18 <= hour < 22:
            segments["evening"] += 1
        else:
            segments["night"] += 1
    return segments


def _hour(shot_at: str | None) -> int | None:
    if not shot_at or len(shot_at) < 13:
        return None
    try:
        return int(shot_at[11:13])
    except ValueError:
        return None


def _parse_grid_theme_id(theme_id: str) -> tuple[float, float]:
    parts = theme_id[len("grid_") :].split("_")
    if len(parts) != 2:
        raise ValueError("grid theme_id 格式必须是 grid_{lat}_{lng}")
    try:
        return float(parts[0]), float(parts[1])
    except ValueError as exc:
        raise ValueError("grid theme_id 坐标必须是数字") from exc


def _grid_label(lat: float, lng: float) -> str:
    lat_suffix = "N" if lat >= 0 else "S"
    lng_suffix = "E" if lng >= 0 else "W"
    return f"{abs(lat):.2f}°{lat_suffix} {abs(lng):.2f}°{lng_suffix}"
