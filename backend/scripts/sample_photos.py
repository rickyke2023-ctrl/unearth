from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from backend.config import DATA_DIR
from backend.database import get_connection


TARGET = 2000
TIME_SLOTS = ("morning", "afternoon", "evening", "night")
DEFAULT_OUTPUT = DATA_DIR / "sample_photos.json"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sample a VLM labeling workset with equal year quotas and proportional time slots."
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


def get_year_counts(conn) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"""
        {classified_cte()}
        SELECT
            year,
            COUNT(*) AS available
        FROM slotted
        WHERE year IS NOT NULL
        GROUP BY year
        HAVING available > 0
        ORDER BY year
        """
    ).fetchall()
    return [dict(row) for row in rows]


def get_time_slot_counts(conn, year: int) -> dict[str, int]:
    rows = conn.execute(
        f"""
        {classified_cte()}
        SELECT
            time_slot,
            COUNT(*) AS available
        FROM slotted
        WHERE year = ?
        GROUP BY time_slot
        """,
        (year,),
    ).fetchall()
    counts = {time_slot: 0 for time_slot in TIME_SLOTS}
    counts.update({row["time_slot"]: row["available"] for row in rows})
    return counts


def calculate_year_quotas(year_counts: list[dict[str, Any]]) -> tuple[int, int, dict[int, int]]:
    if not year_counts:
        return 0, 0, {}

    base_quota = TARGET // len(year_counts)
    sparse_years = [row for row in year_counts if row["available"] < base_quota]
    large_years = [row for row in year_counts if row["available"] >= base_quota]
    remaining = sum(base_quota - row["available"] for row in sparse_years)
    extra = remaining // len(large_years) if large_years else 0

    quotas: dict[int, int] = {}
    for row in year_counts:
        year = row["year"]
        available = row["available"]
        quotas[year] = available if available < base_quota else base_quota + extra
    return base_quota, extra, quotas


def proportional_time_slot_quotas(slot_counts: dict[str, int], target: int) -> dict[str, int]:
    available = sum(slot_counts.values())
    target = min(target, available)
    if available == 0 or target == 0:
        return {time_slot: 0 for time_slot in TIME_SLOTS}

    quotas: dict[str, int] = {}
    remainders: list[tuple[float, int, str]] = []
    for time_slot in TIME_SLOTS:
        count = slot_counts[time_slot]
        exact = target * count / available
        quota = int(exact)
        quotas[time_slot] = quota
        if quota < count:
            remainders.append((exact - quota, -TIME_SLOTS.index(time_slot), time_slot))

    remaining = target - sum(quotas.values())
    for _fraction, _slot_order, time_slot in sorted(remainders, reverse=True):
        if remaining <= 0:
            break
        quotas[time_slot] += 1
        remaining -= 1

    return quotas


def sample_time_slot(conn, year: int, time_slot: str, limit: int) -> list[dict[str, Any]]:
    if limit <= 0:
        return []

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
        (year, time_slot, limit),
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
        actual_counts: dict[int, int] = {}
        year_counts = get_year_counts(conn)
        base_quota, extra, year_quotas = calculate_year_quotas(year_counts)

        for year in year_quotas:
            slot_counts = get_time_slot_counts(conn, year)
            slot_quotas = proportional_time_slot_quotas(slot_counts, year_quotas[year])
            actual_counts[year] = 0
            for time_slot in TIME_SLOTS:
                rows = sample_time_slot(conn, year, time_slot, slot_quotas[time_slot])
                actual_counts[year] += len(rows)
                result.extend(rows)

        write_output(output_path, result)

        print(f"target: {TARGET}")
        print(f"base_quota: {base_quota}")
        print(f"extra: {extra}")
        for row in year_counts:
            year = row["year"]
            print(
                f"{year}: quota={year_quotas[year]} "
                f"(base={base_quota}, extra={extra if row['available'] >= base_quota else 0}), "
                f"actual={actual_counts.get(year, 0)}, available={row['available']}"
            )
        print(f"total: {len(result)}")
        print(f"output: {output_path}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
