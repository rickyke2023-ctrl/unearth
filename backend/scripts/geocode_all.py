from __future__ import annotations

import argparse
import sys

from backend.database import get_connection
from backend.geocoding import reverse_geocode_missing


MAX_BATCH_SIZE = 50


def batch_size(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("batch size must be an integer") from exc
    if parsed < 1 or parsed > MAX_BATCH_SIZE:
        raise argparse.ArgumentTypeError(
            f"batch size must be between 1 and {MAX_BATCH_SIZE}"
        )
    return parsed


def count_missing(conn) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*) AS count
        FROM photos
        WHERE gps_lat IS NOT NULL
          AND gps_lng IS NOT NULL
          AND (gps_city IS NULL OR gps_city = '')
        """
    ).fetchone()
    return int(row["count"])


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Batch reverse-geocode all photos with GPS coordinates missing city data."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print how many photos need geocoding without calling Nominatim.",
    )
    parser.add_argument(
        "--batch-size",
        type=batch_size,
        default=MAX_BATCH_SIZE,
        help=f"Photos to process per batch, max {MAX_BATCH_SIZE}.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    conn = get_connection()
    try:
        missing_count = count_missing(conn)
        if args.dry_run:
            print(f"Photos needing geocoding: {missing_count}")
            return 0

        batch_number = 0
        total_processed = 0
        total_with_city = 0
        total_errors = 0

        while True:
            results = reverse_geocode_missing(conn, limit=args.batch_size)
            if not results:
                break

            batch_number += 1
            processed = len(results)
            errors = sum(1 for result in results if result.get("error"))
            with_city = sum(1 for result in results if result.get("gps_city"))

            total_processed += processed
            total_errors += errors
            total_with_city += with_city

            print(
                f"[batch {batch_number}] processed {processed}, errors: {errors}, "
                f"total geocoded so far: {total_with_city}",
                flush=True,
            )

        print(
            f"Done. Total processed: {total_processed}, "
            f"now with city: {total_with_city}, errors: {total_errors}"
        )
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
