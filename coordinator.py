from __future__ import annotations

import os
import time
from datetime import datetime
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer


PROJECT_ROOT = Path(__file__).resolve().parent
STATUS_PATH = PROJECT_ROOT / "STATUS.md"


def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def render_status() -> None:
    clear_screen()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"STATUS.md updated: {now}")
    print("=" * 72)
    if STATUS_PATH.exists():
        print(STATUS_PATH.read_text(encoding="utf-8"))
    else:
        print("STATUS.md does not exist yet. Waiting for it to be created...")
    print("=" * 72)
    print("Watching STATUS.md. Press Ctrl+C to stop.")


class StatusHandler(FileSystemEventHandler):
    def __init__(self) -> None:
        self._last_render_at = 0.0

    def on_any_event(self, event) -> None:
        if event.is_directory:
            return
        event_path = Path(event.src_path).resolve()
        if event_path != STATUS_PATH:
            return
        # Editors often emit multiple save events; debounce slightly.
        now = time.monotonic()
        if now - self._last_render_at < 0.2:
            return
        self._last_render_at = now
        render_status()


def main() -> None:
    render_status()
    observer = Observer()
    observer.schedule(StatusHandler(), str(PROJECT_ROOT), recursive=False)
    observer.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()
