from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .audit import append_audit, utc_now_iso
from .database import transaction
from .errors import InvalidDecisionError
from .staging import get_photo, move_to_staging, record_staged_files, restore_photo


VALID_DECISIONS = {"keep", "leave", "skip"}


def apply_decisions(conn, decisions: list[Any]) -> dict[str, Any]:
    processed = 0
    staging_added = 0
    freed_bytes_preview = 0
    for item in decisions:
        decision = item.decision if hasattr(item, "decision") else item["decision"]
        photo_id = item.photo_id if hasattr(item, "photo_id") else item["photo_id"]
        is_book_candidate = item.is_book_candidate if hasattr(item, "is_book_candidate") else item.get("is_book_candidate", False)
        if decision not in VALID_DECISIONS:
            raise InvalidDecisionError(f"无效 decision：{decision}")
        photo = get_photo(conn, photo_id)
        previous_decision = photo["decision"]
        previous_status = photo["status"]
        moved: list[dict[str, Any]] = []
        target = photo
        if decision == "leave":
            target, moved = move_to_staging(conn, photo_id)
            record_staged_files(conn, target, moved)
            staging_added += 1 if moved else 0
            freed_bytes_preview += sum(entry["size"] for entry in moved)
        else:
            if photo["status"] == "staged":
                restore_photo(conn, photo_id)
                photo = get_photo(conn, photo_id)
                target = photo
            with transaction(conn):
                conn.execute(
                    """
                    UPDATE photos
                    SET decision = ?, is_book_candidate = ?, status = 'active',
                        file_path = original_path, staged_path = NULL, updated_at = ?
                    WHERE id = ?
                    """,
                    (decision, 1 if is_book_candidate else 0, utc_now_iso(), photo_id),
                )
        with transaction(conn):
            conn.execute(
                """
                INSERT INTO decision_history (
                    photo_id, previous_decision, new_decision, previous_status, new_status,
                    moved_files_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    target["id"],
                    previous_decision,
                    decision,
                    previous_status,
                    "staged" if decision == "leave" else "active",
                    json.dumps(moved, ensure_ascii=False),
                    utc_now_iso(),
                ),
            )
        append_audit(
            decision,
            photo_id=target["id"],
            file_path=target["original_path"],
            staged_path=moved[0]["staged_path"] if moved else None,
            paired_files=[Path(entry["original_path"]).name for entry in moved[1:]],
        )
        processed += 1
    return {"processed": processed, "staging_added": staging_added, "freed_bytes_preview": freed_bytes_preview}


def undo_decision(conn, photo_id: str) -> dict[str, Any]:
    photo = get_photo(conn, photo_id)
    restored_file = False
    previous_decision = photo["decision"]
    if photo["status"] == "staged":
        restore_photo(conn, photo_id)
        restored_file = True
    else:
        history = conn.execute(
            """
            SELECT * FROM decision_history
            WHERE photo_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (photo_id,),
        ).fetchone()
        new_decision = history["previous_decision"] if history else None
        with transaction(conn):
            conn.execute(
                "UPDATE photos SET decision = ?, updated_at = ? WHERE id = ?",
                (new_decision, utc_now_iso(), photo_id),
            )
    append_audit("undo", photo_id=photo_id, file_path=photo["original_path"])
    return {"success": True, "previous_decision": previous_decision, "restored_file": restored_file}


def toggle_book_candidate(conn, photo_id: str) -> dict[str, Any]:
    photo = get_photo(conn, photo_id)
    next_value = 0 if photo["is_book_candidate"] else 1
    with transaction(conn):
        conn.execute(
            "UPDATE photos SET is_book_candidate = ?, updated_at = ? WHERE id = ?",
            (next_value, utc_now_iso(), photo_id),
        )
    return {"photo_id": photo_id, "is_book_candidate": bool(next_value)}
