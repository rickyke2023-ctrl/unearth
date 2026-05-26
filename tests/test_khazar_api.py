from __future__ import annotations

from pathlib import Path

from backend.novel_khazar import khazar_entries, khazar_entry_photos
from tests.test_decision_staging import insert_photo, make_conn


def test_khazar_entries_time_of_day(tmp_path: Path):
    root = tmp_path / "Photos"
    month = root / "2023" / "05"
    month.mkdir(parents=True)
    p1 = month / "A.JPG"
    p2 = month / "B.JPG"
    p3 = month / "C.JPG"
    p1.write_bytes(b"a")
    p2.write_bytes(b"b")
    p3.write_bytes(b"c")

    conn = make_conn()
    insert_photo(conn, photo_id="id-1", path=p1, file_type="JPEG")
    insert_photo(conn, photo_id="id-2", path=p2, file_type="JPEG")
    insert_photo(conn, photo_id="id-3", path=p3, file_type="JPEG")
    conn.execute("UPDATE photos SET shot_at = '2023-05-03T05:00:00Z' WHERE id = 'id-1'")
    conn.execute("UPDATE photos SET shot_at = '2023-05-03T14:00:00Z' WHERE id = 'id-2'")
    conn.execute("UPDATE photos SET shot_at = '2023-05-03T21:00:00Z' WHERE id = 'id-3'")
    conn.commit()

    entries = khazar_entries(conn)
    time_titles = {e["title"] for e in entries if e["type"] == "time"}
    assert "清晨" in time_titles
    assert "午后" in time_titles
    assert "夜晚" in time_titles


def test_khazar_entries_camera_groups_by_model(tmp_path: Path):
    root = tmp_path / "Photos"
    month = root / "2023" / "05"
    month.mkdir(parents=True)
    p1 = month / "A.JPG"
    p2 = month / "B.JPG"
    p3 = month / "C.JPG"
    p1.write_bytes(b"a")
    p2.write_bytes(b"b")
    p3.write_bytes(b"c")

    conn = make_conn()
    insert_photo(conn, photo_id="id-1", path=p1, file_type="JPEG")
    insert_photo(conn, photo_id="id-2", path=p2, file_type="JPEG")
    insert_photo(conn, photo_id="id-3", path=p3, file_type="JPEG")
    conn.execute("UPDATE photos SET camera_model = 'ILCE-7C' WHERE id IN ('id-1', 'id-2')")
    conn.execute("UPDATE photos SET camera_model = 'iPhone 15 Pro' WHERE id = 'id-3'")
    conn.commit()

    entries = khazar_entries(conn)
    camera_entries = [e for e in entries if e["type"] == "camera"]
    assert len(camera_entries) == 2
    ilce_entry = next(e for e in camera_entries if e["title"] == "ILCE-7C")
    assert ilce_entry["photo_count"] == 2


def test_khazar_entry_photos_pagination(tmp_path: Path):
    root = tmp_path / "Photos"
    month = root / "2023" / "05"
    month.mkdir(parents=True)
    conn = make_conn()
    for i in range(5):
        p = month / f"photo_{i:02d}.JPG"
        p.write_bytes(b"x")
        insert_photo(conn, photo_id=f"id-{i}", path=p, file_type="JPEG")
        conn.execute("UPDATE photos SET camera_model = 'ILCE-7C' WHERE id = ?", (f"id-{i}",))
    conn.commit()

    entries = khazar_entries(conn)
    ilce_entry = next(e for e in entries if e["type"] == "camera" and e["title"] == "ILCE-7C")
    result = khazar_entry_photos(conn, ilce_entry["entry_id"], limit=2, offset=0)
    assert result["total"] == 5
    assert len(result["photos"]) == 2
