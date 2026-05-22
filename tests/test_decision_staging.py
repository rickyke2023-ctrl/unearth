from __future__ import annotations

import sqlite3
from pathlib import Path

from backend.audit import utc_now_iso
from backend.database import init_db
from backend.decisions import apply_decisions, undo_decision
from backend.queries import day_photo_count, event_photos
from backend.scanner import cluster_events, scan_root
from backend.staging import confirm_staging, list_staging


class Item:
    def __init__(self, photo_id: str, decision: str, is_book_candidate: bool = False):
        self.photo_id = photo_id
        self.decision = decision
        self.is_book_candidate = is_book_candidate


def dict_row(cursor, row):
    return {cursor.description[idx][0]: value for idx, value in enumerate(row)}


def make_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = dict_row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    return conn


def insert_photo(conn, *, photo_id: str, path: Path, file_type: str, paired_id: str | None = None):
    now = utc_now_iso()
    conn.execute(
        """
        INSERT INTO photos (
            id, root_path, file_path, original_path, file_name, dir_path, stem,
            file_type, file_size_bytes, shot_at, year, month, paired_photo_id,
            sidecar_paths, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            photo_id,
            str(path.parents[2]),
            str(path),
            str(path),
            path.name,
            str(path.parent),
            path.stem,
            file_type,
            path.stat().st_size,
            "2021-11-03T14:32:00Z",
            2021,
            11,
            paired_id,
            f'["{path.with_suffix(".XMP")}"]' if path.with_suffix(".XMP").exists() else "[]",
            now,
            now,
        ),
    )
    conn.commit()


def test_leave_raw_jpeg_pair_moves_raw_and_sidecar_only(tmp_path: Path):
    root = tmp_path / "Photos"
    month = root / "2021" / "11"
    month.mkdir(parents=True)
    raw = month / "DSC_0001.ARW"
    jpg = month / "DSC_0001.JPG"
    xmp = month / "DSC_0001.XMP"
    raw.write_bytes(b"raw")
    jpg.write_bytes(b"jpg")
    xmp.write_bytes(b"xmp")

    conn = make_conn()
    insert_photo(conn, photo_id="raw-id", path=raw, file_type="RAW_SONY", paired_id="jpg-id")
    insert_photo(conn, photo_id="jpg-id", path=jpg, file_type="JPEG", paired_id="raw-id")

    result = apply_decisions(conn, [Item("jpg-id", "leave")])

    assert result["processed"] == 1
    assert not raw.exists()
    assert jpg.exists()
    assert not xmp.exists()
    assert (root / "_unearth_staging" / "2021" / "11" / "DSC_0001.ARW").exists()
    assert (root / "_unearth_staging" / "2021" / "11" / "DSC_0001.XMP").exists()
    staged_raw = conn.execute("SELECT status, decision FROM photos WHERE id = 'raw-id'").fetchone()
    assert staged_raw["status"] == "staged"
    assert staged_raw["decision"] == "leave"


def test_undo_restores_staged_raw_and_sidecar(tmp_path: Path):
    root = tmp_path / "Photos"
    month = root / "2021" / "11"
    month.mkdir(parents=True)
    raw = month / "DSC_0002.ARW"
    xmp = month / "DSC_0002.XMP"
    raw.write_bytes(b"raw")
    xmp.write_bytes(b"xmp")

    conn = make_conn()
    insert_photo(conn, photo_id="raw-id", path=raw, file_type="RAW_SONY")

    apply_decisions(conn, [Item("raw-id", "leave")])
    assert not raw.exists()

    result = undo_decision(conn, "raw-id")

    assert result["success"] is True
    assert result["restored_file"] is True
    assert raw.exists()
    assert xmp.exists()
    restored = conn.execute("SELECT status, decision, staged_path FROM photos WHERE id = 'raw-id'").fetchone()
    assert restored["status"] == "active"
    assert restored["decision"] is None
    assert restored["staged_path"] is None


def test_keep_restores_staged_file_before_updating_decision(tmp_path: Path):
    root = tmp_path / "Photos"
    month = root / "2023" / "05"
    month.mkdir(parents=True)
    jpg = month / "DSCF9864.JPG"
    jpg.write_bytes(b"jpg")

    conn = make_conn()
    insert_photo(conn, photo_id="jpg-id", path=jpg, file_type="JPEG")

    apply_decisions(conn, [Item("jpg-id", "leave")])
    assert not jpg.exists()

    result = apply_decisions(conn, [Item("jpg-id", "keep")])

    assert result["processed"] == 1
    assert jpg.exists()
    restored = conn.execute("SELECT status, decision, staged_path, file_path, original_path FROM photos WHERE id = 'jpg-id'").fetchone()
    assert restored["status"] == "active"
    assert restored["decision"] == "keep"
    assert restored["staged_path"] is None
    assert restored["file_path"] == restored["original_path"]
    active_staging_rows = conn.execute(
        """
        SELECT COUNT(*) AS count FROM staging_files
        WHERE photo_id = 'jpg-id' AND restored_at IS NULL AND confirmed_deleted_at IS NULL
        """
    ).fetchone()
    assert active_staging_rows["count"] == 0


def test_cluster_events_uses_file_mtime_when_shot_at_is_null(tmp_path: Path):
    root = tmp_path / "Photos"
    month = root / "2023" / "05"
    month.mkdir(parents=True)
    jpg = month / "DSC_0100.JPG"
    jpg.write_bytes(b"jpg")

    conn = make_conn()
    insert_photo(conn, photo_id="jpg-id", path=jpg, file_type="JPEG")
    conn.execute("UPDATE photos SET shot_at = NULL WHERE id = 'jpg-id'")
    conn.commit()

    cluster_events(conn)

    event_count = conn.execute("SELECT COUNT(*) AS count FROM events").fetchone()["count"]
    photo = conn.execute("SELECT event_id, shot_at FROM photos WHERE id = 'jpg-id'").fetchone()
    assert event_count == 1
    assert photo["event_id"] is not None
    assert photo["shot_at"] is not None


def test_scan_root_accumulates_multiple_roots(tmp_path: Path):
    root_a = tmp_path / "RootA"
    root_b = tmp_path / "RootB"
    (root_a / "2023" / "05").mkdir(parents=True)
    (root_b / "2024" / "06").mkdir(parents=True)
    (root_a / "2023" / "05" / "A001.JPG").write_bytes(b"a")
    (root_a / "2023" / "05" / "A002.JPG").write_bytes(b"aa")
    (root_b / "2024" / "06" / "B001.JPG").write_bytes(b"b")

    conn = make_conn()
    scan_root(conn, str(root_a))
    assert conn.execute("SELECT COUNT(*) AS count FROM photos").fetchone()["count"] == 2

    scan_root(conn, str(root_b))

    counts = conn.execute(
        "SELECT root_path, COUNT(*) AS count FROM photos GROUP BY root_path ORDER BY root_path"
    ).fetchall()
    assert [row["count"] for row in counts] == [2, 1]
    assert conn.execute("SELECT COUNT(*) AS count FROM photos").fetchone()["count"] == 3
    assert conn.execute("SELECT COUNT(*) AS count FROM events").fetchone()["count"] == 2


def test_staging_defaults_to_current_root_for_list_and_confirm(tmp_path: Path):
    root_a = tmp_path / "RootA"
    root_b = tmp_path / "RootB"
    (root_a / "2023" / "05").mkdir(parents=True)
    (root_b / "2023" / "05").mkdir(parents=True)
    a_photo = root_a / "2023" / "05" / "A001.JPG"
    b_photo = root_b / "2023" / "05" / "B001.JPG"
    a_photo.write_bytes(b"a")
    b_photo.write_bytes(b"b")

    conn = make_conn()
    insert_photo(conn, photo_id="a-id", path=a_photo, file_type="JPEG")
    insert_photo(conn, photo_id="b-id", path=b_photo, file_type="JPEG")
    apply_decisions(conn, [Item("a-id", "leave"), Item("b-id", "leave")])
    conn.execute("UPDATE scan_state SET root_path = ? WHERE id = 1", (str(root_b),))
    conn.commit()

    staging = list_staging(conn)
    assert staging["total_count"] == 1
    assert staging["photos"][0]["filename"] == "B001.JPG"

    result = confirm_staging(conn, True)

    assert result["deleted_count"] == 1
    active = conn.execute(
        """
        SELECT p.file_name
        FROM staging_files sf
        JOIN photos p ON p.id = sf.photo_id
        WHERE sf.restored_at IS NULL AND sf.confirmed_deleted_at IS NULL AND sf.trashed_at IS NULL
        """
    ).fetchall()
    assert [row["file_name"] for row in active] == ["A001.JPG"]
    assert (root_a / "_unearth_staging" / "2023" / "05" / "A001.JPG").exists()
    assert (root_b / "_unearth_staging" / "2023" / "05" / "B001.JPG").exists()


def test_event_photos_includes_api_contract_fields(tmp_path: Path):
    root = tmp_path / "Photos"
    month = root / "2023" / "05"
    month.mkdir(parents=True)
    jpg = month / "DSC_0200.JPG"
    jpg.write_bytes(b"jpg")

    conn = make_conn()
    insert_photo(conn, photo_id="jpg-id", path=jpg, file_type="JPEG")
    cluster_events(conn)
    event_id = conn.execute("SELECT id FROM events LIMIT 1").fetchone()["id"]

    photo = event_photos(conn, event_id)["photos"][0]

    for field in ["file_path", "year", "month", "gps_lat", "gps_lng", "camera_model", "event_id"]:
        assert field in photo


def test_day_photo_count_counts_matching_shot_at_date(tmp_path: Path):
    root = tmp_path / "Photos"
    month = root / "2023" / "05"
    month.mkdir(parents=True)
    photos = [month / "A.JPG", month / "B.JPG", month / "C.JPG"]
    for photo in photos:
        photo.write_bytes(b"jpg")

    conn = make_conn()
    insert_photo(conn, photo_id="a-id", path=photos[0], file_type="JPEG")
    insert_photo(conn, photo_id="b-id", path=photos[1], file_type="JPEG")
    insert_photo(conn, photo_id="c-id", path=photos[2], file_type="JPEG")
    conn.execute("UPDATE photos SET shot_at = '2023-05-03T08:00:00Z' WHERE id = 'a-id'")
    conn.execute("UPDATE photos SET shot_at = '2023-05-03T23:59:59Z' WHERE id = 'b-id'")
    conn.execute("UPDATE photos SET shot_at = '2023-05-04T00:00:00Z' WHERE id = 'c-id'")
    conn.commit()

    assert day_photo_count(conn, "2023-05-03") == {"date": "2023-05-03", "count": 2}
