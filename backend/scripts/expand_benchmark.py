"""Expand benchmark set from 30 to 100 photos via stratified sampling.

Strategy:
  - Load existing 30 photo_ids from data/benchmark_set.json
  - For each (year, period) bucket, compute current count vs target (target ~4 per bucket)
  - Randomly sample additional photos from each bucket
  - Constraints: preview_path IS NOT NULL, shot_at IS NOT NULL
  - Output: data/benchmark_set_100.json (photo_id list only)
  - Does NOT modify the original benchmark_set.json
"""

import json
import random
import sys
from collections import defaultdict
from pathlib import Path

# Ensure the project root is on sys.path for backend imports
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.database import get_connection

DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "unearth.db"
ORIGINAL_BENCHMARK = DATA_DIR / "benchmark_set.json"
OUTPUT = DATA_DIR / "benchmark_set_100.json"
TARGET_TOTAL = 100

PERIODS = ["morning", "afternoon", "evening", "night"]


def period_from_hour(hour: int) -> str:
    if 5 <= hour <= 11:
        return "morning"
    if 12 <= hour <= 16:
        return "afternoon"
    if 17 <= hour <= 20:
        return "evening"
    return "night"


def get_existing_ids() -> set[str]:
    with open(ORIGINAL_BENCHMARK) as f:
        return set(json.load(f))


def get_population_by_bucket(conn) -> dict[tuple[int, str], list[str]]:
    """Return { (year, period): [id, ...] } for all valid photos, excluding existing IDs."""
    existing = get_existing_ids()
    rows = conn.execute(
        """
        SELECT id, year, shot_at
        FROM photos
        WHERE preview_path IS NOT NULL
          AND shot_at IS NOT NULL
        ORDER BY year
        """
    ).fetchall()

    buckets: dict[tuple[int, str], list[str]] = defaultdict(list)
    for r in rows:
        if r["id"] in existing:
            continue
        period = period_from_hour(int(r["shot_at"][11:13]))
        buckets[(r["year"], period)].append(r["id"])

    return dict(buckets)


def compute_targets(
    buckets: dict[tuple[int, str], list[str]],
    existing_count: int,
) -> dict[tuple[int, str], int]:
    """Compute how many NEW photos to add per bucket to reach TARGET_TOTAL."""
    to_add = TARGET_TOTAL - existing_count
    all_years = sorted({y for (y, _) in buckets})
    num_buckets = len(all_years) * len(PERIODS)
    base = to_add // num_buckets
    remainder = to_add % num_buckets

    targets: dict[tuple[int, str], int] = {}
    for y in all_years:
        for p in PERIODS:
            targets[(y, p)] = base

    # Distribute remainder to buckets with most available photos
    candidates = sorted(
        [(y, p) for (y, p) in buckets],
        key=lambda k: len(buckets[k]),
        reverse=True,
    )
    for i in range(remainder):
        targets[candidates[i]] += 1

    return targets


def main():
    random.seed(42)  # reproducible

    conn = get_connection(DB_PATH)

    existing_ids = get_existing_ids()
    print(f"Existing benchmark set: {len(existing_ids)} photos")
    buckets = get_population_by_bucket(conn)
    total_available = sum(len(v) for v in buckets.values())
    print(f"Available photos (excl. existing): {total_available}")

    years = sorted({y for (y, _) in buckets})
    print(f"Years covered: {years}")

    targets = compute_targets(buckets, len(existing_ids))

    # Show demand before sampling
    print("\n=== Target distribution (year × period) ===")
    for y in years:
        row = []
        for p in PERIODS:
            t = targets.get((y, p), 0)
            avail = len(buckets.get((y, p), []))
            row.append(f"{p}={t}(avail={avail})")
        print(f"  Year {y}: {', '.join(row)}")

    new_ids: list[str] = []
    for y in years:
        for p in PERIODS:
            target = targets.get((y, p), 0)
            pool = buckets.get((y, p), [])
            if target > len(pool):
                print(
                    f"  WARNING: ({y}, {p}) needs {target} but only {len(pool)} available, taking all"
                )
                target = len(pool)
            sampled = random.sample(pool, target)
            new_ids.extend(sampled)

    final_ids = sorted(existing_ids | set(new_ids))
    print(f"\nSelected {len(new_ids)} new photos")
    print(f"Final set: {len(final_ids)} photos")

    # Distribution report
    print("\n=== Final distribution ===")
    y_cnt: dict[int, int] = defaultdict(int)
    p_cnt: dict[str, int] = defaultdict(int)
    for pid in final_ids:
        r = conn.execute("SELECT year, shot_at FROM photos WHERE id = ?", (pid,)).fetchone()
        if r:
            y_cnt[r["year"]] += 1
            p_cnt[period_from_hour(int(r["shot_at"][11:13]))] += 1

    print("  By year:", dict(sorted(y_cnt.items())))
    print("  By period:", dict(p_cnt))

    with open(OUTPUT, "w") as f:
        json.dump(sorted(final_ids), f, indent=2)
        f.write("\n")

    print(f"\n✓ Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
