from __future__ import annotations

import os
from typing import Any

import requests


BASE_URL = os.environ.get("UNEARTH_API_BASE_URL", "http://localhost:8000").rstrip("/")


def get(path: str, **params: Any) -> dict[str, Any]:
    url = f"{BASE_URL}{path}"
    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
        raise TypeError(f"{path} returned non-object JSON")
    return data


def print_photo_preview(photos: list[dict[str, Any]]) -> None:
    for index, photo in enumerate(photos[:2], start=1):
        print(f"  photo_{index}: {photo.get('file_name')} ({photo.get('year')})")
    if not photos:
        print("  photos: none")


def main() -> None:
    kept = get("/api/photos/kept")
    kept_photos = kept.get("photos") or []
    print("GET /api/photos/kept")
    print(f"  total_count: {kept.get('total_count', 0)}")
    print(f"  by_year: {kept.get('by_year') or {}}")
    print_photo_preview(kept_photos)

    limited = get("/api/photos/kept", limit=3)
    limited_count = len(limited.get("photos") or [])
    if limited_count > 3:
        raise AssertionError(f"limit=3 returned {limited_count} photos")
    print("GET /api/photos/kept?limit=3")
    print(f"  returned: {limited_count}")

    filtered = get("/api/photos/kept", year=2023)
    print("GET /api/photos/kept?year=2023")
    print(f"  total_count: {filtered.get('total_count', 0)}")
    print(f"  returned: {len(filtered.get('photos') or [])}")


if __name__ == "__main__":
    main()
