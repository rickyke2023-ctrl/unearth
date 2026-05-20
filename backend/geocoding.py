from __future__ import annotations

from time import sleep
from typing import Any

from .audit import utc_now_iso
from .database import fetch_all, transaction


def reverse_geocode_missing(conn, limit: int = 50) -> list[dict[str, Any]]:
    rows = fetch_all(
        conn,
        """
        SELECT id, file_name, gps_lat, gps_lng
        FROM photos
        WHERE gps_lat IS NOT NULL
          AND gps_lng IS NOT NULL
          AND (gps_city IS NULL OR gps_city = '')
        ORDER BY shot_at, file_name
        LIMIT ?
        """,
        (limit,),
    )
    if not rows:
        return []

    from geopy.geocoders import Nominatim

    geolocator = Nominatim(user_agent="unearth-local-photo-organizer")
    results: list[dict[str, Any]] = []
    for row in rows:
        city = None
        country = None
        error = None
        try:
            location = geolocator.reverse(
                (row["gps_lat"], row["gps_lng"]),
                exactly_one=True,
                language="en",
                addressdetails=True,
                timeout=10,
            )
            address = location.raw.get("address", {}) if location else {}
            city = (
                address.get("city")
                or address.get("town")
                or address.get("village")
                or address.get("municipality")
                or address.get("county")
            )
            country = address.get("country")
            if city or country:
                with transaction(conn):
                    conn.execute(
                        """
                        UPDATE photos
                        SET gps_city = ?, gps_country = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (city, country, utc_now_iso(), row["id"]),
                    )
        except Exception as exc:
            error = str(exc)
        results.append(
            {
                "photo_id": row["id"],
                "file_name": row["file_name"],
                "gps_lat": row["gps_lat"],
                "gps_lng": row["gps_lng"],
                "gps_city": city,
                "gps_country": country,
                "error": error,
            }
        )
        sleep(1)
    return results

