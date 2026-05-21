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


def print_first_photo(data: dict[str, Any]) -> None:
    photos = data.get("photos") or []
    if not photos:
        print("  first_photo: none")
        return
    first = photos[0]
    print(f"  first_photo: {first.get('file_name')} ({first.get('year')})")


def main() -> None:
    today = get("/api/excavation/today")
    print("GET /api/excavation/today")
    print(f"  total: {today.get('total', 0)}")
    print(f"  source: {today.get('source')}")
    print_first_photo(today)

    limited = get("/api/excavation/today", limit=5)
    limited_total = len(limited.get("photos") or [])
    if limited_total > 5:
        raise AssertionError(f"limit=5 returned {limited_total} photos")
    print("GET /api/excavation/today?limit=5")
    print(f"  returned: {limited_total}")

    historical = get("/api/excavation/today", date="2023-05-01")
    print("GET /api/excavation/today?date=2023-05-01")
    print(f"  total: {historical.get('total', 0)}")
    print(f"  source: {historical.get('source')}")
    print_first_photo(historical)


if __name__ == "__main__":
    main()
