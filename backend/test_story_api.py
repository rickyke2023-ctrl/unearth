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


def main() -> None:
    today = get("/api/story/today")
    cross_year = today.get("cross_year") or {}
    full_day = today.get("full_day") or {}
    print("GET /api/story/today")
    print(f"  cross_year.total_count: {cross_year.get('total_count', 0)}")
    print(f"  full_day.total_count: {full_day.get('total_count', 0)}")

    themes = get("/api/themes")
    theme_items = themes.get("themes") or []
    labels = [theme.get("label") for theme in theme_items[:3]]
    print("GET /api/themes")
    print(f"  total_themes: {themes.get('total_themes', 0)}")
    print(f"  first_3_labels: {labels}")

    if not theme_items:
        print("GET /api/story/theme/{theme_id}")
        print("  skipped: no theme returned by /api/themes")
        return

    theme_id = theme_items[0]["theme_id"]
    detail = get(f"/api/story/theme/{theme_id}")
    print(f"GET /api/story/theme/{theme_id}")
    print(f"  total_count: {detail.get('total_count', 0)}")
    print(f"  years: {list((detail.get('photos_by_year') or {}).keys())}")


if __name__ == "__main__":
    main()
