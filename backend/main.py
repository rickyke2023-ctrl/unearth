from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .database import get_connection, init_db
from .decisions import apply_decisions, toggle_book_candidate, undo_decision
from .errors import DiskNotMountedError, PreviewNotReadyError, UnearthError
from .geocoding import reverse_geocode_missing
from .preview import accepted_preview_response, get_or_create_preview, preview_status, start_preview_generation
from .queries import book_candidates, day_photo_count, event_photos, events_for_month, export_book_candidates, status, strata
from .scanner import progress_store, scan_root
from .schemas import DecisionsRequest, ScanRequest, StagingConfirmRequest, UndoRequest
from .staging import confirm_staging, list_staging, restore_photo


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = get_connection()
    init_db(conn)
    app.state.db = conn
    yield
    conn.close()


app = FastAPI(title="Unearth Backend", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def db(request: Request):
    return request.app.state.db


@app.exception_handler(UnearthError)
async def unearth_error_handler(_: Request, exc: UnearthError):
    if isinstance(exc, PreviewNotReadyError):
        return accepted_preview_response(exc.message)
    return JSONResponse(status_code=exc.status_code, content={"error": exc.message, "code": exc.code})


@app.get("/api/status")
def api_status(conn=Depends(db)):
    return status(conn)


@app.post("/api/scan")
def api_scan(payload: ScanRequest, background_tasks: BackgroundTasks, conn=Depends(db)):
    root = Path(payload.root_path).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise DiskNotMountedError(f"照片根目录不可用：{root}")
    task_id = progress_store.start()
    background_tasks.add_task(scan_root, conn, str(root))
    return {"task_id": task_id, "status": "started"}


@app.get("/api/scan/progress")
async def api_scan_progress():
    async def stream():
        while True:
            progress = progress_store.current
            yield f"data: {json.dumps(progress.__dict__, ensure_ascii=False)}\n\n"
            if progress.phase == "done":
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/api/strata")
def api_strata(conn=Depends(db)):
    return strata(conn)


@app.get("/api/events")
def api_events(year: int, month: int, conn=Depends(db)):
    return events_for_month(conn, year, month)


@app.get("/api/events/{event_id}/photos")
def api_event_photos(event_id: str, conn=Depends(db)):
    return event_photos(conn, event_id)


@app.get("/api/photos/day-count")
def api_day_photo_count(date: str, conn=Depends(db)):
    return day_photo_count(conn, date)


@app.get("/preview/{photo_id}")
def api_preview(photo_id: str, conn=Depends(db)):
    return get_or_create_preview(conn, photo_id)


@app.get("/api/previews/status")
def api_preview_status(conn=Depends(db)):
    return preview_status(conn)


@app.post("/api/previews/generate")
def api_generate_previews(conn=Depends(db)):
    start_preview_generation(conn)
    return {"status": "started", **preview_status(conn)}


@app.post("/api/geocode/reverse-missing")
def api_reverse_geocode_missing(limit: int = 50, conn=Depends(db)):
    return {"processed": reverse_geocode_missing(conn, limit)}


@app.post("/api/geocode/trigger")
def api_geocode_trigger(background_tasks: BackgroundTasks, limit: int = 200, conn=Depends(db)):
    """非阻塞触发反地理编码，前端加载 SiteView 时自动调用。"""
    background_tasks.add_task(reverse_geocode_missing, conn, limit)
    return {"status": "started", "limit": limit}


@app.post("/api/decisions")
def api_decisions(payload: DecisionsRequest, conn=Depends(db)):
    return apply_decisions(conn, payload.decisions)


@app.post("/api/decisions/undo")
def api_undo(payload: UndoRequest, conn=Depends(db)):
    return undo_decision(conn, payload.photo_id)


@app.post("/api/book-candidates/{photo_id}")
def api_toggle_book_candidate(photo_id: str, conn=Depends(db)):
    return toggle_book_candidate(conn, photo_id)


@app.get("/api/staging")
def api_staging(root_path: str | None = None, all_roots: bool = False, conn=Depends(db)):
    return list_staging(conn, root_path=root_path, all_roots=all_roots)


@app.post("/api/staging/confirm")
def api_confirm_staging(payload: StagingConfirmRequest, conn=Depends(db)):
    return confirm_staging(conn, payload.confirm, root_path=payload.root_path, all_roots=payload.all_roots)


@app.post("/api/staging/restore/{photo_id}")
def api_restore_staging(photo_id: str, conn=Depends(db)):
    return restore_photo(conn, photo_id)


@app.get("/api/book-candidates")
def api_book_candidates(conn=Depends(db)):
    return book_candidates(conn)


@app.get("/api/book-candidates/export")
def api_export_book_candidates(format: str, conn=Depends(db)):
    return export_book_candidates(conn, format)


@app.post("/api/summary/generate")
async def api_summary_generate():
    async def stream():
        yield 'data: {"chunk":"阶段二功能暂未启用。"}\n\n'
        yield 'data: {"done":true,"full_text":"阶段二功能暂未启用。"}\n\n'

    return StreamingResponse(stream(), media_type="text/event-stream")
