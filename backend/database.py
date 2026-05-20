from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from .config import DB_PATH, ensure_runtime_dirs


def dict_row(cursor: sqlite3.Cursor, row: sqlite3.Row) -> dict[str, Any]:
    return {cursor.description[idx][0]: value for idx, value in enumerate(row)}


def get_connection(path: Path | str = DB_PATH) -> sqlite3.Connection:
    ensure_runtime_dirs()
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = dict_row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    try:
        conn.execute("BEGIN")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY,
            root_path TEXT NOT NULL,
            file_path TEXT NOT NULL UNIQUE,
            original_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            dir_path TEXT NOT NULL,
            stem TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL,
            shot_at TEXT,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            gps_lat REAL,
            gps_lng REAL,
            gps_city TEXT,
            gps_country TEXT,
            camera_model TEXT,
            paired_photo_id TEXT,
            sidecar_paths TEXT NOT NULL DEFAULT '[]',
            decision TEXT,
            is_book_candidate INTEGER NOT NULL DEFAULT 0,
            event_id TEXT,
            preview_path TEXT,
            staged_path TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(event_id) REFERENCES events(id)
        );

        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            root_path TEXT NOT NULL DEFAULT '',
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            started_at TEXT,
            ended_at TEXT,
            photo_count INTEGER NOT NULL DEFAULT 0,
            cover_photo_id TEXT,
            primary_location TEXT,
            status TEXT NOT NULL DEFAULT 'pending'
        );

        CREATE TABLE IF NOT EXISTS scan_state (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            root_path TEXT,
            scan_completed INTEGER NOT NULL DEFAULT 0,
            last_scan_at TEXT,
            total_photos INTEGER NOT NULL DEFAULT 0,
            total_size_bytes INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS decision_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            photo_id TEXT NOT NULL,
            previous_decision TEXT,
            new_decision TEXT NOT NULL,
            previous_status TEXT,
            new_status TEXT,
            moved_files_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS staging_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            photo_id TEXT NOT NULL,
            original_path TEXT NOT NULL,
            staged_path TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL,
            left_at TEXT NOT NULL,
            restored_at TEXT,
            confirmed_deleted_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_photos_year_month ON photos(year, month);
        CREATE INDEX IF NOT EXISTS idx_photos_event ON photos(event_id);
        CREATE INDEX IF NOT EXISTS idx_photos_event_id ON photos(event_id);
        CREATE INDEX IF NOT EXISTS idx_photos_shot_at ON photos(shot_at);
        CREATE INDEX IF NOT EXISTS idx_photos_decision ON photos(decision);
        CREATE INDEX IF NOT EXISTS idx_events_year_month ON events(year, month);
        """
    )
    conn.execute(
        "INSERT OR IGNORE INTO scan_state (id, scan_completed) VALUES (1, 0)"
    )
    ensure_column(conn, "events", "root_path", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "events", "photo_count", "INTEGER NOT NULL DEFAULT 0")
    conn.execute(
        """
        UPDATE events
        SET root_path = (
            SELECT p.root_path
            FROM photos p
            WHERE p.event_id = events.id
            LIMIT 1
        )
        WHERE root_path = ''
          AND EXISTS (
            SELECT 1 FROM photos p WHERE p.event_id = events.id
          )
        """
    )
    conn.commit()


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def fetch_one(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    return conn.execute(sql, params).fetchone()


def fetch_all(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    return list(conn.execute(sql, params).fetchall())
