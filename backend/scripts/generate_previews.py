from __future__ import annotations

import argparse
import sys

from backend.database import get_connection
from backend.preview import get_or_create_preview


DEFAULT_BATCH_SIZE = 100


def positive_int(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("value must be an integer") from exc
    if parsed < 1:
        raise argparse.ArgumentTypeError("value must be greater than zero")
    return parsed


def missing_preview_condition(conn) -> str:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(photos)").fetchall()}
    if "preview_ready" in columns:
        return "preview_ready = 0"
    return "(preview_path IS NULL OR preview_path = '')"


def count_missing(conn, condition: str) -> int:
    row = conn.execute(f"SELECT COUNT(*) AS count FROM photos WHERE {condition}").fetchone()
    return int(row["count"])


def fetch_batch(conn, condition: str, batch_size: int) -> list[str]:
    rows = conn.execute(
        f"""
        SELECT id
        FROM photos
        WHERE {condition}
        ORDER BY shot_at, file_name
        LIMIT ?
        """,
        (batch_size,),
    ).fetchall()
    return [row["id"] for row in rows]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate missing photo preview thumbnails.")
    parser.add_argument(
        "--limit",
        type=positive_int,
        default=None,
        help="Maximum number of previews to generate. Defaults to all missing previews.",
    )
    parser.add_argument(
        "--batch-size",
        type=positive_int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Database batch size. Defaults to {DEFAULT_BATCH_SIZE}.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    conn = get_connection()
    try:
        condition = missing_preview_condition(conn)
        total_missing = count_missing(conn, condition)
        target = min(total_missing, args.limit) if args.limit is not None else total_missing

        processed = 0
        generated = 0
        errors = 0

        while processed < target:
            batch_size = min(args.batch_size, target - processed)
            photo_ids = fetch_batch(conn, condition, batch_size)
            if not photo_ids:
                break

            for photo_id in photo_ids:
                try:
                    get_or_create_preview(conn, photo_id)
                    generated += 1
                except Exception as exc:
                    errors += 1
                    print(f"Error generating preview for {photo_id}: {exc}", file=sys.stderr, flush=True)
                finally:
                    processed += 1
                    if processed % 100 == 0 or processed == target:
                        print(f"[{processed}/{target}] generating...", flush=True)
                    if processed >= target:
                        break

        remaining = count_missing(conn, condition)
        print(
            "Preview generation complete. "
            f"Processed: {processed}, generated: {generated}, errors: {errors}, "
            f"remaining_missing: {remaining}"
        )
        return 0 if errors == 0 else 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
