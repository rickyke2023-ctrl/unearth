# Phase 03: 《哈扎尔词典》MVP — Entry Engine + Dictionary UI

Build the Хazar Dictionary narrative framework: a backend entry-generation engine that mines existing EXIF data (`shot_at`, `camera_model`, `file_type`) to produce dictionary entries, and a front-end `KhazarView` with dictionary-page aesthetics. This is the first novel framework that works entirely on existing data — no VLM annotations required.

## Tasks

- [ ] Create the Khazar entry engine in `backend/novel_khazar.py`:
  - **Entry types and generation logic:**
    - **Time-of-day entries** (清晨/上午/午后/傍晚/夜晚): Query photos grouped by hour range:
      - 清晨: 04:00-06:59
      - 上午: 07:00-11:59
      - 午后: 12:00-16:59
      - 傍晚: 17:00-19:59
      - 夜晚: 20:00-03:59
      - Each entry: `{ id, title, type: "time", photo_count, cover_photo_id }`
    - **Camera entries** (each camera model that appears): `camera_model` field. Group non-null values, filter out empty strings.
      - Entry title: camera model name (e.g. "ILCE-7C", "iPhone 15 Pro")
      - Count photos per model
    - **Medium entries** (RAW_SONY / RAW_FUJI / JPEG / HEIF): from `file_type` field.
      - Entry title: human-readable (e.g. "索尼 RAW", "富士 RAW", "JPEG", "HEIF")
    - **Season entries** (春夏秋冬): Derive from `shot_at` month:
      - Spring: 3-5, Summer: 6-8, Autumn: 9-11, Winter: 12-2

  - `khazar_entries(conn) -> list[dict]`: Generate full entry list, ordered by type then photo_count DESC
  - `khazar_entry_photos(conn, entry_id: str, limit=50, offset=0) -> dict`: Return photos for a specific entry with pagination
  - `khazar_entry_stats(conn, entry_id: str) -> dict`: Return entry metadata + cross-reference hints (e.g. "same time-of-day shot on different cameras")
  - Add a simple cross-reference generator: for each entry, find related entries where photos overlap in interesting ways. E.g. a camera entry cross-references time-of-day entries that its photos were taken in.

- [ ] Add Khazar API endpoints in `backend/main.py`:
  - `GET /api/novel/khazar/entries` — returns all dictionary entries with summary stats
    - Query param: `type` to filter by entry type (time/camera/medium/season)
    - Response: `{ entries: [...], total_count: N }`
  - `GET /api/novel/khazar/entry/{entry_id}` — returns photos for a specific entry
    - Query params: `limit` (default 50), `offset` (default 0)
    - Response: `{ entry: {...}, photos: [...], total: N }`
  - `GET /api/novel/khazar/entry/{entry_id}/cross-refs` — returns related entries
    - Response: `{ entry_id, cross_refs: [{ entry_id, title, type, overlap_count }] }`
  - Register these routes in the lifespan or app startup (they're standard FastAPI routes, no special setup needed)
  - Import and wire up: `from .novel_khazar import khazar_entries, khazar_entry_photos, khazar_entry_stats`

- [ ] Design and create the `KhazarView` frontend component at `frontend/src/components/KhazarView/index.tsx`:
  - **Layout:** Full-page dictionary aesthetic — dark background (#1a1a1a or similar), serif font (Playfair Display or Georgia), gold accent (#c9a84c)
  - **Entry grid:** Responsive grid of entry cards, each showing:
    - Entry title (large serif text)
    - Type badge (small, muted — "时辰", "相机", "介质", "季节")
    - Photo count ("N 张")
    - Cover thumbnail if available, otherwise a placeholder with gold border
  - **Entry detail view:** When user clicks an entry:
    - Slide-in panel or route change (use existing routing pattern — check how other novel views navigate)
    - Show entry title + type at top
    - Photo grid underneath (masonry or uniform, same pattern as other views)
    - Cross-reference section at bottom: "相关词条" links to related entries
  - **Visual design touches:**
    - Ornamental dividers (─── or ···) between sections
    - Entry cards have aged-paper texture feel (subtle noise/gradient background)
    - Type badge colors: time=gold, camera=silver, medium=copper, season=green
    - Hover effect: card lifts slightly, gold border appears
    - Loading skeleton: shimmer cards matching entry card shape
  - **State management:**
    - Fetch entries on mount: `GET /api/novel/khazar/entries`
    - Fetch entry photos on click: `GET /api/novel/khazar/entry/{id}`
    - Loading/error states for each fetch
    - Cache entry list in local state (it won't change during a session)

- [ ] Register KhazarView in the app router:
  - Check `frontend/src/App.tsx` for how other views are routed (BookView, DuneView, GatewayView, etc.)
  - Follow the same pattern: add a route for `/khazar`
  - Add a link to the Khazar Dictionary from the GatewayView (or BookView, wherever novel navigation lives)
  - Search for existing patterns — e.g., how "微光之门" links to GatewayView, then replicate that
  - Confirm no existing routes conflict with `/khazar`

- [ ] Test the Khazar Dictionary end-to-end:
  ```bash
  # Backend: start server
  cd /Users/ricky/Downloads/照片整理工作流
  uvicorn backend.main:app --reload --port 8000
  
  # Test entries endpoint
  curl http://localhost:8000/api/novel/khazar/entries | python -m json.tool
  
  # Test entry photos endpoint (use an actual entry_id from the response above)
  curl "http://localhost:8000/api/novel/khazar/entry/{some-entry-id}?limit=10" | python -m json.tool
  
  # Frontend
  cd frontend && npm run dev
  ```
  - Navigate to `/khazar` in the browser — confirm the dictionary view loads
  - Click an entry — confirm photos appear
  - Verify loading and error states display correctly
  - Verify `npm run lint` passes (0 errors, 0 warnings)

- [ ] Add a `KhazarView` story/test (if the project has Storybook or test infrastructure), OR add a basic smoke test:
  - Create `backend/test_khazar_api.py` with a simple test:
    ```python
    def test_khazar_entries_returns_structured_data(tmp_path):
        # Create test photos with various shot_at times and camera_models
        # Call khazar_entries()
        # Assert time entries exist, camera entries exist, etc.
    ```
  - Search tests/ and backend/test_*.py for the pattern used by existing smoke tests (e.g. `backend/test_staging_api.py`)
  - Hook into the existing test runner: `python -m pytest backend/test_khazar_api.py -v`
