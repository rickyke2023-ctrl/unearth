---
name: Infrastructure Fixes — Phase 1
type: playbook
description: Fix the auto-purge audit bug (backend) and clean up 22 frontend ESLint errors
created: 2026-05-26
tags: [infrastructure, backend, frontend, lint, bugfix]
---

# Phase 1 — Infrastructure Fixes

## Background

Based on the BUG_REPORT.md, CODEX_TASKS.md, and `npm run lint` output:

- **Backend auto-purge bug**: When scanning a new root_path, the entire database was cleared. The `confirm_staging` endpoint also doesn't properly filter by root_path.
- **Frontend lint**: 22 errors across 8 component files — mostly `react-hooks/set-state-in-effect` (10), `no-empty` (8), plus a few React hooks ordering and type issues.

## Files to Modify

### Backend
- `backend/scanner.py` — `scan_root` function, `scan_state` update logic
- `backend/staging.py` — `confirm_staging` and `list_staging` root_path filtering
- `backend/database.py` — `init_db` for scan_state schema (nullable root_path)
- `backend/main.py` — `POST /api/scan` path validation (already partially fixed)
- `backend/queries.py` — `status()` function

### Frontend
- `frontend/src/components/DecisionView/index.tsx`
- `frontend/src/components/ExcavationView/index.tsx`
- `frontend/src/components/AlmanacView/index.tsx`
- `frontend/src/components/KeptView/index.tsx`
- `frontend/src/components/StoryView/index.tsx`
- `frontend/src/components/LibraryView/index.tsx`
- `frontend/src/components/shared/ScanProgress.tsx`
- `frontend/src/components/shared/ScrubReveal.tsx`
- `frontend/src/components/shared/StagingConfirmDialog.tsx`
- `frontend/src/components/shared/CameraGestureController.tsx`

---

## Task 1: Fix auto-purge audit bug (backend.root_path isolation)

### 1a — Investigate and fix `scan_root` clearing non-target root_path data

Current `scan_root` code (`backend/scanner.py`):

```python
def scan_root(conn, root_path: str) -> dict[str, Any]:
    # ... validates path, scans files, builds rows ...
    with transaction(conn):
        for row in rows:
            conn.execute("""INSERT INTO photos (...) VALUES (...) ON CONFLICT(id) DO UPDATE ...""", row)

    # Bug: scan_state overwrites root_path; total_photos/total_size_bytes sum ALL photos
    total_state = conn.execute(
        "SELECT COUNT(*) AS count, COALESCE(SUM(file_size_bytes), 0) AS size FROM photos"
    ).fetchone()
    conn.execute(
        """UPDATE scan_state SET root_path = ?, scan_completed = 1, last_scan_at = ?,
           total_photos = ?, total_size_bytes = ? WHERE id = 1""",
        (str(root), utc_now_iso(), total_state["count"], total_state["size"]),
    )
```

**Fixes:**
1. Change `scan_state` to store per-root-path records (or make it a cumulative sum, not overwrite). Since `scan_state` has `id INTEGER PRIMARY KEY CHECK(id = 1)`, it's single-row. Either:
   - Remove single-row constraint and store one row per root_path, OR
   - Just make `total_photos`/`total_size_bytes` cumulative across all roots and track last-scanned root in a separate field
2. Ensure `pair_photos` and `cluster_events` only operate on the specified `root_path` (they already do this via `WHERE root_path = ?`, but verify)
3. Actually reproduce the data-loss scenario to confirm it's fixed

### 1b — Verify and harden `confirm_staging` root_path filtering

The function already accepts `root_path` and `all_roots` params but the API endpoint needs verification. Add a test that:
- Create staging data for 2 different root_paths
- Call `confirm_staging(root_path="root_A")`
- Assert only root_A's staging files are deleted

### 1c — Update tests
- `tests/test_decision_staging.py` (or create `tests/test_infrastructure.py`)
- Test: scan two different root_paths, verify photos from root_A survive after scanning root_B
- Test: confirm_staging with root_path filtering
- Test: list_staging with root_path filtering

---

## Task 2: Fix 22 frontend ESLint errors

### 2a — Fix `react-hooks/set-state-in-effect` (10 errors)

These occur when `useState` setters are called synchronously inside `useEffect`. Pattern to fix:

**Before:**
```tsx
useEffect(() => {
  setLoading(true)
  fetchData().then(setData)
}, [dep])
```

**After:**
```tsx
useEffect(() => {
  let cancelled = false
  setLoading(true)
  fetchData().then((data) => {
    if (!cancelled) setData(data)
  })
  return () => { cancelled = true }
}, [dep])
```

Or extract the async logic into a separate function called from the effect:

```tsx
const load = useCallback(async () => {
  setLoading(true)
  const data = await fetchData()
  setData(data)
}, [dep])

useEffect(() => { load() }, [load])
```

**Affected files:**
- `AlmanacView/index.tsx` — lines 343, 355
- `DecisionView/index.tsx` — lines 32, 329
- `KeptView/index.tsx` — line 170
- `StoryView/index.tsx` — line 366
- `StagingConfirmDialog.tsx` — lines 142, 241, 400
- `CameraGestureController.tsx` — line 151

### 2b — Fix `no-empty` (8 errors)

Replace empty catch/if blocks with meaningful comments or error handling:

- `DecisionView/index.tsx` — lines 373, 413, 422 (catch blocks)
- `ExcavationView/index.tsx` — line 214 (catch block)
- `ScanProgress.tsx` — line 72 (catch block)
- `ScrubReveal.tsx` — lines 89, 122 (catch blocks)

**Fix:** Add `// ignore` comment or at minimum log the error:
```tsx
.catch(() => {
  /* expected when endpoint is unavailable */
})
```

### 2c — Fix `react-hooks/refs` in CameraGestureController

Line 58: `onGestureRef.current = onGesture` — assigning ref during render.

**Fix:** Move to `useEffect`:
```tsx
useEffect(() => {
  onGestureRef.current = onGesture
}, [onGesture])
```

### 2d — Fix `react-hooks/immutability` and `preserve-manual-memoization` in ExcavationView

`decide` callback is used before its declaration (lines 191 vs 204).

**Fix:** Either move `decide` above the `useEffect` that references it, or wrap in `useEffect` dependency.

Note: The React Compiler warning about memoization preservation can be addressed by removing `useCallback` and letting the compiler handle it, OR keeping `useCallback` and adding `eslint-disable` for the compiler warning.

### 2e — Fix `@typescript-eslint/no-explicit-any` (2 errors)

- `LibraryView/index.tsx` line 260 — replace `any` with proper type
- `ScanProgress.tsx` line 18 — replace `any` with proper type

### 2f — Verify lint passes

```bash
cd frontend && npm run lint
# Should output: 0 errors, 0 warnings
```

---

## Verification

```bash
# Backend tests
cd /Users/ricky/Downloads/照片整理工作流 && python -m pytest tests/ -v

# Frontend lint
cd /Users/ricky/Downloads/照片整理工作流/frontend && npm run lint

# Frontend build (type check)
cd /Users/ricky/Downloads/照片整理工作流/frontend && npm run build
```
