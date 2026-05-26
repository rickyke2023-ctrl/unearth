# Phase 02: Visual AI Pipeline — Qwen2.5-VL-3B Deployment + Perception Matrix

Deploy Qwen2.5-VL-3B via Ollama, build a two-stage annotation pipeline (MiniCPM-V coarse → Qwen fine), and create the perception matrix that feeds all five novels. This phase turns 46K raw photos into structured narrative data.

## Tasks

- [ ] Set up Ollama and pull the vision models:
  ```bash
  # Install Ollama if not present
  which ollama || brew install ollama
  
  # Start Ollama service
  ollama serve &
  
  # Pull Qwen2.5-VL-3B (quantized, ~2.5-3GB RAM)
  ollama pull qwen2.5vl:3b
  
  # Check if MiniCPM-V is available on Ollama (ollama.com/search?q=minicpm)
  # If available: ollama pull minicpm-v
  # If not: Note this and skip to Phase 3 — MiniCPM-V is optional pre-filter
  ```
  - Run `ollama list` to confirm both models are downloaded
  - Create `backend/vision/` package if it doesn't exist

- [ ] Build the VLM abstraction layer in `backend/vision/annotator.py`:
  - Create a `VLMAnalyzer` class that wraps Ollama's API:
    - `__init__(self, model: str = "qwen2.5vl:3b")` — configure endpoint and model
    - `analyze(self, image_path: str) -> dict` — send image + prompt to Ollama, parse JSON response
    - `batch_analyze(self, image_paths: list[str]) -> list[dict]` — batch wrapper with optional concurrency
    - Error handling: log failures per-image, don't crash the batch
    - Use `httpx.AsyncClient` for non-blocking HTTP calls to Ollama
    - Prompt engineering: design a structured JSON prompt that extracts:
      - Scene type (indoor/outdoor/night/portrait/landscape/urban/food/text/document)
      - Main colors (3-5 dominant hex colors)
      - Has people (true/false/null)
      - Light source (natural/artificial/mixed/unknown)
      - Composition (close-up/mid-range/wide-angle)
      - Mood (warm/cool/neutral/vibrant/moody)
      - Text presence (true/false)
      - Narrative tags (array of 2-5 short Chinese tags like "窗, 清晨, 安静")

- [ ] Create `backend/vision/perception_matrix.py` — the data pipeline:
  ```python
  PERCEPTION_PROFILES = {
      "invisible_cities": ["scene_type", "main_colors", "composition", "narrative_tags"],
      "cathedral": ["has_people", "composition", "mood"],
      "khazar": ["light_source", "main_colors", "composition_focus"],
      "shanhaijing": ["scene_type", "has_people_ratio", "direction"],
      "dune": None,  # Dune uses EXIF-based mystery score, not VLM
  }
  ```
  - Design the `PhotoAnnotations` table in SQLite:
    ```sql
    CREATE TABLE IF NOT EXISTS photo_annotations (
        photo_id TEXT PRIMARY KEY REFERENCES photos(id),
        scene_type TEXT,
        main_colors TEXT,  -- JSON array of hex strings
        has_people INTEGER,
        light_source TEXT,
        composition TEXT,
        mood TEXT,
        text_present INTEGER,
        narrative_tags TEXT,  -- JSON array of strings
        confidence REAL,      -- 0.0 to 1.0
        annotated_at TEXT,
        model_version TEXT,
        perception_profile TEXT  -- JSON: which novels use which fields
    );
    ```
  - Add this CREATE TABLE to `backend/database.py` `init_db()` function (with `IF NOT EXISTS`)
  - Add `ensure_column` calls for any migration (but since it's new, just add to init_db)

- [ ] Create the annotation pipeline runner in `backend/vision/pipeline.py`:
  - `get_unannotated_photos(conn, limit=100) -> list[dict]` — query photos without annotation, ordered by shot_at
  - `annotate_batch(conn, photo_ids: list[str]) -> dict` — for each photo:
    1. Check if preview exists (preview image serves as VLM input too since it's smaller)
    2. Send to VLMAnalyzer
    3. Parse and validate response
    4. INSERT INTO photo_annotations
    5. Return stats: processed, failed, errors
  - `annotate_all(conn, batch_size=50, max_photos=None)` — loops batches, respecting 8GB disk safety check
  - Check disk space before each batch: if below 8GB, pause with warning log

- [ ] Add API endpoints in `backend/main.py`:
  - `POST /api/vision/annotate` — trigger annotation of next N unannotated photos
    - Accept `{ "limit": 50 }` — defaults to 10 for testing
    - Return `{ "processed": N, "failed": M, "total_remaining": K }`
  - `GET /api/vision/perception/{novel_id}` — return perception summary for a given novel framework
    - Accept novel_id: "invisible_cities" | "cathedral" | "khazar" | "shanhaijing"
    - Query photo_annotations for the fields relevant to that novel's perception profile
    - Return aggregated stats: counts per scene_type, top colors, etc.
  - `GET /api/vision/status` — show annotation coverage:
    ```json
    {
      "total_photos": 46110,
      "annotated": 150,
      "pending": 45960,
      "percent_complete": 0.3,
      "disk_gb_free": 20.5,
      "model": "qwen2.5vl:3b"
    }
    ```

- [ ] Test the VLM pipeline end-to-end with real photos:
  - Select 10 photos from the existing database (pick diverse types: indoor, outdoor, night, portrait)
  - Run `annotate_batch` on these 10
  - Verify annotations returned have all expected fields
  - Run `GET /api/vision/status` and confirm counts are correct
  - Run `GET /api/vision/perception/invisible_cities` and verify it returns meaningful aggregates
  - Create `docs/research/vision-pilot-report.md` with front matter documenting:
    - Quality assessment of annotations (manual review of 10 samples)
    - Any model quirks or failures
    - Token/response time estimates for full 46K run
    - Tags: [vision, vlm, research, qwen]

- [ ] Clean up after testing:
  - Run `DELETE FROM photo_annotations` to remove test data (it was just for verification)
  - Document the full 46K run strategy in the perception_matrix.py module docstring
  - Log final verification that `npm run lint` still passes (no frontend changes should have been needed for this phase, but verify just in case)
