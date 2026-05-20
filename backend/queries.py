from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from fastapi.responses import Response

from .database import fetch_all, fetch_one


def status(conn) -> dict[str, Any]:
    state = fetch_one(conn, "SELECT * FROM scan_state WHERE id = 1") or {}
    return {
        "status": "ready",
        "db_exists": True,
        "total_photos": state.get("total_photos", 0),
        "total_size_bytes": state.get("total_size_bytes", 0),
        "scan_completed": bool(state.get("scan_completed", 0)),
        "last_scan_at": state.get("last_scan_at"),
    }


def strata(conn) -> dict[str, Any]:
    months = fetch_all(
        conn,
        """
        SELECT
            year, month,
            COUNT(*) AS photo_count,
            COUNT(DISTINCT event_id) AS event_count,
            SUM(CASE WHEN decision IS NOT NULL THEN 1 ELSE 0 END) AS decided_count,
            SUM(CASE WHEN decision = 'keep' THEN 1 ELSE 0 END) AS kept_count,
            SUM(CASE WHEN decision = 'leave' THEN 1 ELSE 0 END) AS left_count,
            SUM(file_size_bytes) AS size_bytes,
            SUM(CASE WHEN decision = 'leave' THEN file_size_bytes ELSE 0 END) AS freed_bytes
        FROM photos
        GROUP BY year, month
        ORDER BY year DESC, month DESC
        """,
    )
    years_map: dict[int, dict[str, Any]] = {}
    for month in months:
        month_status = _status_for_counts(month["decided_count"], month["photo_count"])
        summary = {
            **month,
            "status": month_status,
            "primary_locations": [],
            "strata_color": strata_color(month["year"]),
        }
        year = years_map.setdefault(
            month["year"],
            {
                "year": month["year"],
                "total_photos": 0,
                "total_size_bytes": 0,
                "decided_count": 0,
                "months": [],
            },
        )
        year["total_photos"] += month["photo_count"]
        year["total_size_bytes"] += month["size_bytes"] or 0
        year["decided_count"] += month["decided_count"] or 0
        year["months"].append(summary)

    stats = fetch_one(
        conn,
        """
        SELECT
            COUNT(*) AS total_photos,
            SUM(file_size_bytes) AS total_size_bytes,
            SUM(CASE WHEN decision IS NOT NULL THEN 1 ELSE 0 END) AS decided_count,
            SUM(CASE WHEN decision = 'keep' THEN 1 ELSE 0 END) AS kept_count,
            SUM(CASE WHEN decision = 'leave' THEN 1 ELSE 0 END) AS left_count,
            SUM(CASE WHEN decision = 'leave' THEN file_size_bytes ELSE 0 END) AS freed_bytes,
            SUM(CASE WHEN is_book_candidate = 1 THEN 1 ELSE 0 END) AS book_candidates_count
        FROM photos
        """,
    ) or {}
    return {"years": list(years_map.values()), "global_stats": {k: v or 0 for k, v in stats.items()}}


def events_for_month(conn, year: int, month: int) -> dict[str, Any]:
    rows = fetch_all(
        conn,
        """
        SELECT
            e.id, e.year, e.month, e.started_at, e.ended_at,
            COUNT(p.id) AS photo_count,
            SUM(CASE WHEN p.decision IS NOT NULL THEN 1 ELSE 0 END) AS decided_count,
            e.cover_photo_id, e.primary_location
        FROM events e
        LEFT JOIN photos p ON p.event_id = e.id
        WHERE e.year = ? AND e.month = ?
        GROUP BY e.id
        ORDER BY e.started_at
        """,
        (year, month),
    )
    for row in rows:
        row["status"] = _status_for_counts(row["decided_count"], row["photo_count"])
    return {"year": year, "month": month, "events": rows}


def event_photos(conn, event_id: str) -> dict[str, Any]:
    rows = fetch_all(
        conn,
        """
        SELECT
            id, file_path, file_name, file_type, file_size_bytes, shot_at,
            year, month, gps_lat, gps_lng, gps_city, gps_country, camera_model, event_id,
            paired_photo_id, CASE WHEN sidecar_paths != '[]' THEN 1 ELSE 0 END AS has_xmp_sidecar,
            decision, is_book_candidate, CASE WHEN preview_path IS NOT NULL THEN 1 ELSE 0 END AS preview_ready
        FROM photos
        WHERE event_id = ?
        ORDER BY shot_at, file_name
        """,
        (event_id,),
    )
    return {
        "event_id": event_id,
        "photos": [_boolize(row, ["has_xmp_sidecar", "is_book_candidate", "preview_ready"]) for row in rows],
        "total": len(rows),
        "decided": sum(1 for row in rows if row["decision"] is not None),
    }


def day_photo_count(conn, date: str) -> dict[str, Any]:
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "date 参数格式必须是 YYYY-MM-DD", "code": "INVALID_DATE"},
        ) from exc
    row = fetch_one(
        conn,
        "SELECT COUNT(*) AS count FROM photos WHERE shot_at LIKE ?",
        (f"{date}%",),
    ) or {"count": 0}
    return {"date": date, "count": row["count"] or 0}


def book_candidates(conn) -> dict[str, Any]:
    rows = fetch_all(
        conn,
        """
        SELECT id, file_path, file_name, shot_at, gps_city, gps_country
        FROM photos
        WHERE is_book_candidate = 1
        ORDER BY shot_at
        """,
    )
    return {"total": len(rows), "candidates": rows}


def export_book_candidates(conn, fmt: str) -> Response:
    data = book_candidates(conn)["candidates"]
    if fmt == "json":
        import json

        return Response(
            content=json.dumps(data, ensure_ascii=False, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=book_candidates.json"},
        )
    if fmt == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=["id", "file_path", "file_name", "shot_at", "gps_city", "gps_country"])
        writer.writeheader()
        writer.writerows(data)
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=book_candidates.csv"},
        )
    return Response(content='{"error":"format must be json or csv","code":"INVALID_FORMAT"}', status_code=400, media_type="application/json")


def _status_for_counts(decided: int | None, total: int | None) -> str:
    decided = decided or 0
    total = total or 0
    if total > 0 and decided >= total:
        return "completed"
    if decided > 0:
        return "in_progress"
    return "pending"


def strata_color(year: int) -> str:
    colors = {
        2024: "#A8C5E8",
        2023: "#8FADC4",
        2022: "#C4A882",
        2021: "#D4956A",
        2020: "#C47840",
    }
    return colors.get(year, "#8FADC4")


def _boolize(row: dict[str, Any], keys: list[str]) -> dict[str, Any]:
    for key in keys:
        row[key] = bool(row[key])
    return row
