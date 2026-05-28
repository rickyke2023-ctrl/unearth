from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from backend.config import DATA_DIR
from backend.database import get_connection


YEARS = (2021, 2022, 2023, 2024, 2025, 2026)
TIME_SLOTS = ("morning", "afternoon", "evening", "night")
PER_CELL = 83
DEFAULT_OUTPUT = DATA_DIR / "sample_photos.json"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sample a VLM labeling workset with MECE year/time-slot strata."
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help=f"Output JSON path. Defaults to {DEFAULT_OUTPUT}.",
    )
    return parser.parse_args(argv)


def time_slot_case(hour_expr: str = "hour") -> str:
    return f"""
        CASE
            WHEN {hour_expr} >= 5 AND {hour_expr} < 12 THEN 'morning'
            WHEN {hour_expr} >= 12 AND {hour_expr} < 18 THEN 'afternoon'
            WHEN {hour_expr} >= 18 AND {hour_expr} < 22 THEN 'evening'
            ELSE 'night'
        END
    """


def valid_where() -> str:
    return """
        p.id IS NOT NULL
        AND p.shot_at IS NOT NULL
        AND p.preview_path IS NOT NULL
        AND p.preview_path != ''
    """


def classified_cte() -> str:
    return f"""
        WITH classified AS (
            SELECT
                p.id AS photo_id,
                CAST(strftime('%Y', p.shot_at) AS INTEGER) AS year,
                CAST(strftime('%H', p.shot_at) AS INTEGER) AS hour,
                p.shot_at
            FROM photos p
            WHERE {valid_where()}
        ),
        slotted AS (
            SELECT
                photo_id,
                year,
                {time_slot_case()} AS time_slot,
                shot_at
            FROM classified
        )
    """


def sample_pre_2021(conn) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"""
        {classified_cte()}
        SELECT
            photo_id,
            year,
            time_slot,
            shot_at
        FROM slotted
        WHERE year < 2021
        ORDER BY shot_at, photo_id
        """
    ).fetchall()
    return [dict(row) for row in rows]


def sample_cell(conn, year: int, time_slot: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"""
        {classified_cte()}
        SELECT
            photo_id,
            year,
            time_slot,
            shot_at
        FROM slotted
        WHERE year = ?
          AND time_slot = ?
        ORDER BY RANDOM()
        LIMIT ?
        """,
        (year, time_slot, PER_CELL),
    ).fetchall()
    return [dict(row) for row in rows]


def write_output(output_path: Path, rows: list[dict[str, Any]]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    output_path = Path(args.output)

    conn = get_connection()
    try:
        result: list[dict[str, Any]] = []
        counts: dict[tuple[int, str], int] = {}

        pre_2021 = sample_pre_2021(conn)
        result.extend(pre_2021)

        for year in YEARS:
            for time_slot in TIME_SLOTS:
                rows = sample_cell(conn, year, time_slot)
                counts[(year, time_slot)] = len(rows)
                result.extend(rows)

        write_output(output_path, result)

        print(f"pre_2021: {len(pre_2021)}")
        for year in YEARS:
            for time_slot in TIME_SLOTS:
                print(f"{year} {time_slot}: {counts[(year, time_slot)]}")
        print(f"total: {len(result)}")
        print(f"output: {output_path}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
