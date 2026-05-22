# Codex Task: GPS Batch Geocoding Script

## Context
Project: 显影 Unearth — personal photo organizer
Backend: Python + FastAPI + SQLite at `backend/`
The app has a `backend/geocoding.py` module with `reverse_geocode_missing(conn, limit)` using Nominatim (OpenStreetMap).
There are 8105+ photos in the database. Most have GPS lat/lng from EXIF but no `gps_city` yet.
The existing `/api/geocode/trigger` endpoint only processes up to 200 at a time and runs in the background.

## Task
Create `backend/scripts/geocode_all.py` — a standalone CLI script that batch-geocodes ALL photos with GPS coordinates.

## Files to create
- `backend/scripts/__init__.py` (empty)
- `backend/scripts/geocode_all.py`

## Requirements

### Core logic
Loop: call `reverse_geocode_missing(conn, limit=50)` until it returns an empty list.
Each call processes up to 50 photos, sleeping 1s between each (already handled inside `reverse_geocode_missing`).
Stop when the function returns `[]` (no more photos need geocoding).

### CLI flags
- `--dry-run`: Only print how many photos need geocoding. Do NOT call Nominatim. Exit.
- `--batch-size N` (default 50, max 50 — Nominatim rate limit): batch size per call.

### Progress output (during run)
```
[batch 1] processed 50, errors: 0, total geocoded so far: 50
[batch 2] processed 50, errors: 2, total geocoded so far: 98
...
Done. Total processed: 842, now with city: 838, errors: 4
```

### Resumable
If interrupted, just re-run. Already-geocoded photos are skipped automatically inside `reverse_geocode_missing`.

### How to connect to DB
Look at `backend/database.py` and `backend/config.py` to see how other modules get the DB path and open a connection. Mirror that pattern exactly. Do NOT use `Depends(db)` (that's FastAPI-only).

### How to run
```bash
# from project root:
python -m backend.scripts.geocode_all
python -m backend.scripts.geocode_all --dry-run
```

## What NOT to change
- Do not modify `geocoding.py`, `main.py`, or any existing files.
- Only add the two new files listed above.

## Verification
After writing the files, run:
```bash
cd /Users/ricky/Downloads/照片整理工作流
python -m backend.scripts.geocode_all --dry-run
```
It should print how many photos need geocoding without errors.

## After completing
1. Run the dry-run verification above and confirm it works.
2. git add + commit with message:
   ```
   feat: GPS batch geocoding script — backend/scripts/geocode_all.py

   - Processes all GPS photos with missing city in batches of 50
   - Nominatim reverse geocoding (1 req/s, Nominatim ToS compliant)
   - --dry-run flag for safe preview
   - Resumable: re-run safely if interrupted
   ```
3. Update `AGENT_LOG/STATUS.md`: add to 最近完成: "✅ GPS 批量地理编码脚本（geocode_all.py）"
