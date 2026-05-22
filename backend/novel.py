"""
Novel mode queries — 五部小说叙事引擎

Each function returns photos shaped for a specific narrative mode.
Current: dune_fragments (《沙丘》mode)
Planned: dictionary_entries, temporal_echoes, invisible_cities, shanhaijing
"""
from __future__ import annotations

import random
from typing import Any

from .database import fetch_all, fetch_one


# ── Mystery scoring ────────────────────────────────────────────────────────

def _mystery_score(row: dict) -> float:
    """
    0.0 = fully documented  /  1.0 = complete unknown
    Weights: no camera (0.40), no GPS (0.35), no timestamp origin (0.25)
    shot_at is almost always present (mtime fallback), so we track
    whether it came from EXIF vs filesystem via camera_model proxy.
    """
    score = 0.0
    if not row.get("camera_model"):
        score += 0.40
    if not row.get("gps_lat"):
        score += 0.35
    if not row.get("gps_city"):
        score += 0.25
    return round(score, 2)


def _artifact_condition(mystery: float) -> str:
    if mystery >= 0.95:
        return "severely deteriorated"
    if mystery >= 0.70:
        return "origin unknown"
    if mystery >= 0.40:
        return "partially legible"
    return "well-preserved"


def _era_label(shot_at: str | None, year: int) -> str:
    """Convert calendar year to an archaeological era label."""
    era_map = {
        2019: "First Year",
        2020: "Second Year",
        2021: "Third Year",
        2022: "Fourth Year",
        2023: "Fifth Year",
        2024: "Sixth Year",
        2025: "Seventh Year",
        2026: "Eighth Year",
    }
    return era_map.get(year, f"Year {year}")


# ── Dune mode ──────────────────────────────────────────────────────────────

def dune_fragments(conn, limit: int = 24, seed: int | None = None) -> dict[str, Any]:
    """
    《沙丘》mode — returns photos presented as archaeological artifacts.

    Selection strategy:
    1. Prioritise photos with no camera_model (maximum mystery)
    2. Fill remaining slots with random active photos
    3. Shuffle the combined pool so high-mystery and known interleave
    """
    # High-mystery pool: no camera model
    unknowns = fetch_all(
        conn,
        """
        SELECT id, file_name, file_type, file_size_bytes,
               shot_at, year, month,
               gps_lat, gps_lng, gps_city, gps_country,
               camera_model, preview_path, decision
        FROM photos
        WHERE status NOT IN ('staged', 'deleted')
          AND camera_model IS NULL
        ORDER BY RANDOM()
        LIMIT :limit
        """,
        {"limit": limit},
    )

    # If we have fewer unknowns than needed, supplement from full pool
    if len(unknowns) < limit:
        exclude_ids = [r["id"] for r in unknowns]
        placeholder = ",".join(["?"] * len(exclude_ids)) if exclude_ids else "''"
        extra_sql = f"""
            SELECT id, file_name, file_type, file_size_bytes,
                   shot_at, year, month,
                   gps_lat, gps_lng, gps_city, gps_country,
                   camera_model, preview_path, decision
            FROM photos
            WHERE status NOT IN ('staged', 'deleted')
              AND id NOT IN ({placeholder})
            ORDER BY RANDOM()
            LIMIT {limit - len(unknowns)}
        """
        extras = fetch_all(conn, extra_sql, exclude_ids if exclude_ids else [])
    else:
        extras = []

    pool = unknowns + extras

    # Deterministic shuffle when seed provided (for daily consistency)
    rng = random.Random(seed)
    rng.shuffle(pool)

    # Annotate each photo with artifact metadata
    fragments = []
    for i, row in enumerate(pool):
        mystery = _mystery_score(row)
        fragments.append({
            **row,
            "fragment_number": i + 1,
            "fragment_id": f"#{str(i + 1).zfill(4)}",
            "mystery_score": mystery,
            "condition": _artifact_condition(mystery),
            "era": _era_label(row.get("shot_at"), row.get("year", 0)),
            "instrument": row.get("camera_model") or "Unknown Instrument",
            "territory": row.get("gps_city") or "Unknown Territory",
        })

    total_unknown = fetch_one(
        conn,
        "SELECT COUNT(*) AS n FROM photos WHERE status NOT IN ('staged','deleted') AND camera_model IS NULL",
    )

    return {
        "mode": "dune",
        "total_unknown": total_unknown["n"] if total_unknown else 0,
        "total_active": fetch_one(
            conn,
            "SELECT COUNT(*) AS n FROM photos WHERE status NOT IN ('staged','deleted')",
        )["n"],
        "fragments": fragments,
    }
