from __future__ import annotations

import os
from typing import Any

import requests


BASE_URL = os.environ.get("UNEARTH_API_BASE_URL", "http://localhost:8000").rstrip("/")


def call(method: str, path: str, **kwargs: Any) -> dict[str, Any] | None:
    url = f"{BASE_URL}{path}"
    print(f"\n{method} {url}")
    try:
        response = requests.request(method, url, timeout=10, **kwargs)
        print(f"status: {response.status_code}")
        try:
            data = response.json()
            print(data)
            return data if isinstance(data, dict) else {"data": data}
        except ValueError:
            print(response.text)
            return None
    except requests.RequestException as exc:
        print(f"request failed: {exc}")
        return None


def csv_ids(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def main() -> None:
    staging = call("GET", "/api/staging") or {}
    photos = staging.get("photos") or []
    photo_ids = [str(photo["photo_id"]) for photo in photos if photo.get("photo_id") is not None]

    restore_ids = csv_ids(os.environ.get("UNEARTH_RESTORE_ID"))
    restore_id = restore_ids[0] if restore_ids else (photo_ids[0] if photo_ids else None)
    if restore_id:
        call("POST", "/api/staging/restore", json={"photo_id": restore_id})
    else:
        print("\nPOST /api/staging/restore skipped: no staging photo available")

    delete_ids = csv_ids(os.environ.get("UNEARTH_DELETE_IDS"))
    if not delete_ids:
        delete_ids = [photo_id for photo_id in photo_ids if photo_id != restore_id][:1]
    call("DELETE", "/api/staging/confirm", json={"photo_ids": delete_ids, "confirm": True})

    staging_after = call("GET", "/api/staging") or {}
    print(f"trash_summary present: {'trash_summary' in staging_after}")

    trash = call("GET", "/api/trash") or {}
    trash_photos = trash.get("photos") or []
    first_days_remaining = trash_photos[0].get("days_remaining") if trash_photos else None
    print(f"trash total_count: {trash.get('total_count', 0)}")
    print(f"trash first days_remaining: {first_days_remaining}")


if __name__ == "__main__":
    main()
