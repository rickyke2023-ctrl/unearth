from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .database import get_connection, init_db
from .decisions import apply_decisions, toggle_book_candidate, undo_decision
from .errors import DiskNotMountedError, PreviewNotReadyError, UnearthError
from .excavation import today_excavation
from .geocoding import reverse_geocode_missing
from .kept import kept_photos
from .preview import accepted_preview_response, get_or_create_preview, preview_status, start_preview_generation
from .queries import (
    book_candidates,
    calendar_days,
    day_photo_count,
    event_photos,
    events_for_month,
    export_book_candidates,
    status,
    strata,
    time_distribution,
)
from .scanner import progress_store, scan_root
from .schemas import DecisionsRequest, ScanRequest, StagingConfirmRequest, StagingRestoreRequest, TrashPurgeRequest, UndoRequest
from .staging import confirm_staging, list_staging, list_trash, purge_trash, restore_photo
from .story import theme_story, themes, today_story
from .novel import dune_fragments
from .novel_khazar import khazar_entries, khazar_entry_photos, khazar_entry_stats


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


@app.get("/api/calendar")
def api_calendar(year: int, conn=Depends(db)):
    return calendar_days(conn, year)


@app.get("/api/time-distribution")
def api_time_distribution(year: int | None = None, conn=Depends(db)):
    return time_distribution(conn, year)


@app.get("/api/photos/kept")
def api_kept_photos(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    year: int | None = None,
    conn=Depends(db),
):
    return kept_photos(conn, limit=limit, offset=offset, year=year)


@app.get("/api/story/today")
def api_story_today(
    month: int | None = Query(default=None, ge=1, le=12),
    day: int | None = Query(default=None, ge=1, le=31),
    limit: int = Query(default=20, ge=1),
    conn=Depends(db),
):
    return today_story(conn, month=month, day=day, limit=limit)


@app.get("/api/excavation/today")
def api_excavation_today(
    limit: int = Query(default=20, ge=1, le=20),
    date: str | None = None,
    conn=Depends(db),
):
    return today_excavation(conn, limit=limit, date_value=date)


@app.get("/api/themes")
def api_themes(
    min_photos: int = Query(default=3, ge=1),
    limit: int = Query(default=20, ge=1),
    conn=Depends(db),
):
    return themes(conn, min_photos=min_photos, limit=limit)


@app.get("/api/story/theme/{theme_id}")
def api_story_theme(theme_id: str, limit: int = Query(default=200, ge=1), conn=Depends(db)):
    try:
        return theme_story(conn, theme_id, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc), "code": "INVALID_THEME_ID"}) from exc


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


@app.get("/api/trash")
def api_trash(root_path: str | None = None, all_roots: bool = False, conn=Depends(db)):
    return list_trash(conn, root_path=root_path, all_roots=all_roots)


@app.delete("/api/trash/purge")
def api_purge_trash(payload: TrashPurgeRequest, conn=Depends(db)):
    return purge_trash(conn, photo_ids=payload.photo_ids, force=True)


@app.post("/api/staging/confirm")
def api_confirm_staging(payload: StagingConfirmRequest, conn=Depends(db)):
    return confirm_staging(
        conn,
        payload.confirm,
        photo_ids=payload.photo_ids,
        root_path=payload.root_path,
        all_roots=payload.all_roots,
    )


@app.delete("/api/staging/confirm")
def api_delete_confirm_staging(payload: StagingConfirmRequest, conn=Depends(db)):
    return confirm_staging(
        conn,
        payload.confirm,
        photo_ids=payload.photo_ids,
        root_path=payload.root_path,
        all_roots=payload.all_roots,
    )


@app.post("/api/staging/restore")
def api_restore_staging_by_body(payload: StagingRestoreRequest, conn=Depends(db)):
    return restore_photo(conn, str(payload.photo_id))


@app.post("/api/staging/restore/{photo_id}")
def api_restore_staging(photo_id: str, conn=Depends(db)):
    return restore_photo(conn, photo_id)


@app.get("/api/book-candidates")
def api_book_candidates(conn=Depends(db)):
    return book_candidates(conn)


@app.get("/api/book-candidates/export")
def api_export_book_candidates(format: str, conn=Depends(db)):
    return export_book_candidates(conn, format)


@app.get("/api/novel/dune")
def api_novel_dune(
    limit: int = Query(default=24, ge=1, le=60),
    seed: int | None = None,
    conn=Depends(db),
):
    return dune_fragments(conn, limit=limit, seed=seed)


@app.get("/api/novel/khazar/entries")
def api_novel_khazar_entries(
    entry_type: str | None = Query(default=None, alias="type"),
    conn=Depends(db),
):
    entries = khazar_entries(conn)
    if entry_type:
        entries = [entry for entry in entries if entry["type"] == entry_type]
    return {"entries": entries, "total_count": len(entries)}


@app.get("/api/novel/khazar/entry/{entry_id}")
def api_novel_khazar_entry(
    entry_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    conn=Depends(db),
):
    try:
        photo_page = khazar_entry_photos(conn, entry_id, limit=limit, offset=offset)
        stats = khazar_entry_stats(conn, entry_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail={"error": str(exc), "code": "KHAZAR_ENTRY_NOT_FOUND"}) from exc
    entry = {key: stats[key] for key in ["entry_id", "title", "type", "photo_count"]}
    return {"entry": entry, "photos": photo_page["photos"], "total": photo_page["total"]}


@app.get("/api/novel/khazar/entry/{entry_id}/cross-refs")
def api_novel_khazar_entry_cross_refs(entry_id: str, conn=Depends(db)):
    try:
        stats = khazar_entry_stats(conn, entry_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail={"error": str(exc), "code": "KHAZAR_ENTRY_NOT_FOUND"}) from exc
    return {"entry_id": entry_id, "cross_refs": stats["cross_refs"]}


@app.post("/api/summary/generate")
async def api_summary_generate():
    async def stream():
        yield 'data: {"chunk":"阶段二功能暂未启用。"}\n\n'
        yield 'data: {"done":true,"full_text":"阶段二功能暂未启用。"}\n\n'

    return StreamingResponse(stream(), media_type="text/event-stream")
