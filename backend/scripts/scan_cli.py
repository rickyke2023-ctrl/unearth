from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path
from typing import Any, Callable

from backend.config import IMAGE_EXTENSIONS


MIN_FREE_BYTES = 8 * 1024 * 1024 * 1024


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan a photo root without starting the HTTP server.")
    parser.add_argument("--root", required=True, help="Photo root directory to scan.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count image files under root without writing to the database.",
    )
    return parser.parse_args(argv)


def resolve_root(root_path: str) -> Path:
    root = Path(root_path).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise ValueError(f"photo root is not available: {root}")
    return root


def ensure_disk_space(path: Path) -> None:
    free_bytes = shutil.disk_usage(path).free
    if free_bytes < MIN_FREE_BYTES:
        free_gb = free_bytes / (1024 * 1024 * 1024)
        raise RuntimeError(f"available disk is below 8 GB ({free_gb:.1f} GB); stopping")


def iter_image_paths(root: Path):
    for path in root.rglob("*"):
        if (
            path.is_file()
            and path.suffix.lower() in IMAGE_EXTENSIONS
            and "_unearth_staging" not in path.parts
        ):
            yield path


def count_images(root: Path) -> int:
    return sum(1 for _ in iter_image_paths(root))


def install_progress_printer(progress_store) -> Callable[[], None]:
    original_update = progress_store.update
    last_printed = 0

    def printing_update(**kwargs: Any) -> None:
        nonlocal last_printed
        original_update(**kwargs)
        progress = progress_store.current
        if progress.phase != "indexing" or not progress.total_estimated:
            return
        should_print = progress.scanned % 100 == 0 or progress.scanned == progress.total_estimated
        if should_print and progress.scanned != last_printed:
            print(f"[{progress.scanned}/{progress.total_estimated}] scanning...", flush=True)
            last_printed = progress.scanned

    progress_store.update = printing_update

    def restore() -> None:
        progress_store.update = original_update

    return restore


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        root = resolve_root(args.root)
        ensure_disk_space(root)
    except (RuntimeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.dry_run:
        total = count_images(root)
        print(f"Image files under {root}: {total}")
        return 0

    from backend.database import get_connection, init_db
    from backend.scanner import progress_store, scan_root

    conn = get_connection()
    restore_progress = install_progress_printer(progress_store)
    try:
        init_db(conn)
        result = scan_root(conn, str(root))
        print(
            "Scan complete. "
            f"Photos scanned: {result['total_photos']}, "
            f"total size: {result['total_size_bytes']} bytes"
        )
        return 0
    finally:
        restore_progress()
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
