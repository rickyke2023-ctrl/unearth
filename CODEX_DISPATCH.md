# Codex Tasks: Scan CLI + Calendar API + Time Distribution API

## HARD CONSTRAINTS (do not violate under any circumstances)
- **絕對不能刪除任何文件** — no `rm`, no `os.remove`, no `shutil.rmtree` on user photo files
- If available disk drops below 8 GB, stop all operations immediately
- Only add new files or modify existing backend Python files

---

## Task 1: Scan CLI script

### File to create: `backend/scripts/scan_cli.py`

A standalone CLI that triggers the scanner directly (no HTTP server needed).

```bash
# Usage:
python3 -m backend.scripts.scan_cli --root /Volumes/MyDrive/Photos
python3 -m backend.scripts.scan_cli --root /Volumes/MyDrive/Photos --dry-run
```

**`--dry-run`**: Count how many image files exist under root without writing to DB.
**Normal run**: Call the existing scanner logic from `backend/scanner.py`. Print progress every 100 files: `[1200/40000] scanning...`. Print summary at end.

Look at `backend/scanner.py` and `backend/main.py` to understand how scanning works. Mirror `backend/scripts/geocode_all.py` for the CLI pattern (argparse, `get_connection()`, etc.).

Do NOT start a FastAPI server. Call scanner functions directly.

---

## Task 2: Calendar API endpoint

### Modify: `backend/main.py`
### Add logic to: `backend/queries.py` (or a new `backend/calendar.py`)

New endpoint: `GET /api/calendar`

Query params:
- `year` (int, required)

Response:
```json
{
  "year": 2023,
  "days": [
    {
      "date": "2023-01-15",
      "photo_count": 12,
      "decided_count": 8,
      "kept_count": 5
    }
  ]
}
```

SQL logic:
```sql
SELECT
  date(shot_at) AS date,
  COUNT(*) AS photo_count,
  COUNT(CASE WHEN decision IS NOT NULL AND decision != 'skip' THEN 1 END) AS decided_count,
  COUNT(CASE WHEN decision = 'keep' THEN 1 END) AS kept_count
FROM photos
WHERE year = :year
  AND shot_at IS NOT NULL
  AND status NOT IN ('staged', 'deleted')
GROUP BY date(shot_at)
ORDER BY date ASC
```

---

## Task 3: Time distribution API endpoint

### Modify: `backend/main.py`
### Add logic to: `backend/queries.py` (or `backend/calendar.py`)

New endpoint: `GET /api/time-distribution`

Query params:
- `year` (int, optional — if omitted, all years)

Response:
```json
{
  "buckets": [
    { "hour": 0, "half": 0, "label": "00:00", "photo_count": 3 },
    { "hour": 0, "half": 1, "label": "00:30", "photo_count": 1 },
    ...
    { "hour": 23, "half": 1, "label": "23:30", "photo_count": 7 }
  ],
  "peak_label": "14:30",
  "peak_count": 142
}
```

48 buckets total (24 hours × 2 half-hours).

SQL logic:
```sql
SELECT
  CAST(strftime('%H', shot_at) AS INTEGER) AS hour,
  CASE WHEN CAST(strftime('%M', shot_at) AS INTEGER) >= 30 THEN 1 ELSE 0 END AS half,
  COUNT(*) AS photo_count
FROM photos
WHERE shot_at IS NOT NULL
  AND status NOT IN ('staged', 'deleted')
  [AND year = :year  -- only if year param provided]
GROUP BY hour, half
ORDER BY hour ASC, half ASC
```

---

## Verification

After implementing, test:
```bash
cd /Users/ricky/Downloads/照片整理工作流
# Task 1
python3 -m backend.scripts.scan_cli --dry-run --root /tmp

# Tasks 2 & 3 (requires backend running)
curl "http://localhost:8000/api/calendar?year=2023" | python3 -m json.tool | head -20
curl "http://localhost:8000/api/time-distribution" | python3 -m json.tool | head -20
```

---

## After completing

git add + commit:
```
feat: scan CLI + calendar API + time-distribution API

- backend/scripts/scan_cli.py: standalone scanner, --dry-run flag
- GET /api/calendar?year=XXXX: per-day photo/decided/kept counts
- GET /api/time-distribution: 48 half-hour buckets, peak label
```

Update `AGENT_LOG/STATUS.md` with what was completed.
