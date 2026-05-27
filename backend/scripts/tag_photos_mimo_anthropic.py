"""
tag_photos_mimo_anthropic.py — MiMo via Anthropic-compatible SDK
使用 Anthropic SDK + MiMo Token Plan Anthropic 接口。

用法：
  # 5 张探针
  MIMO_API_KEY=tp-xxx .venv/bin/python -m backend.scripts.tag_photos_mimo_anthropic \
    --limit 5

  # 正式跑 100 张（跳过已标注）
  MIMO_API_KEY=tp-xxx .venv/bin/python -m backend.scripts.tag_photos_mimo_anthropic \
    --limit 100 --skip-existing
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import json
from pathlib import Path
from typing import Any

import anthropic

from backend.scripts.tag_photos import (
    PROMPT,  # noqa: F401 — shared prompt, updated in tag_photos.py
    default_output_path,
    encode_preview,
    parse_response,
    normalized_tags,
    empty_tags,
    insert_photo_tag,
    fetch_candidates,
    write_output,
    positive_int,
)
from backend.database import get_connection, init_db
from backend.config import PREVIEW_DIR

MIMO_ANTHROPIC_BASE_URL = "https://token-plan-cn.xiaomimimo.com/anthropic"
DEFAULT_MODEL = "mimo-v2.5"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Tag photos via MiMo Anthropic-compatible API."
    )
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--base-url", default=MIMO_ANTHROPIC_BASE_URL)
    parser.add_argument("--api-key", default=None)
    parser.add_argument("--limit", type=positive_int, default=5)
    parser.add_argument("--output", default=None)
    parser.add_argument("--skip-existing", action="store_true")
    return parser.parse_args(argv)


def call_mimo(client: anthropic.Anthropic, model: str, encoded_image: str) -> str:
    response = client.messages.create(
        model=model,
        max_tokens=2048,
        temperature=0.1,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": encoded_image,
                        },
                    },
                    {"type": "text", "text": PROMPT},
                ],
            }
        ],
    )
    # 推理模型可能返回 thinking block + text block
    for block in response.content:
        if hasattr(block, "text") and block.type == "text":
            return block.text or ""
    return ""


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    api_key = args.api_key or os.environ.get("MIMO_API_KEY")
    if not api_key:
        print("ERROR: 需要 API Key。用 --api-key 或 MIMO_API_KEY 环境变量。", file=sys.stderr)
        return 1

    output_path = Path(args.output) if args.output else default_output_path(args.model + "_anthropic")

    client = anthropic.Anthropic(api_key=api_key, base_url=args.base_url)

    conn = get_connection()
    init_db(conn)
    try:
        candidates = fetch_candidates(conn, args.model, args.limit, args.skip_existing)
        total = len(candidates)
        print(f"Model: {args.model} | SDK: Anthropic | Base URL: {args.base_url} | Total: {total}", flush=True)

        results: list[dict[str, Any]] = []
        inference_times: list[int] = []
        errors = 0
        attempted = 0

        for candidate in candidates:
            photo_id = candidate["id"]
            preview_path = PREVIEW_DIR / f"{photo_id}.jpg"
            if not preview_path.exists():
                print(f"SKIP: preview not found — {photo_id}", flush=True)
                continue

            attempted += 1
            raw_response: str | None = None
            error: str | None = None
            tags = empty_tags()
            start = time.perf_counter()

            try:
                encoded = encode_preview(photo_id)
                raw_response = call_mimo(client, args.model, encoded)
                parsed = parse_response(raw_response)
                tags = normalized_tags(parsed)
            except json.JSONDecodeError as exc:
                errors += 1
                error = "JSON parse failed"
                print(f"WARN [{photo_id[:8]}]: JSON 解析失败 — {exc}", flush=True)
                print(f"  raw: {raw_response!r}", flush=True)
            except anthropic.APIError as exc:
                errors += 1
                error = str(exc)
                print(f"WARN [{photo_id[:8]}]: API 错误 — {exc}", flush=True)
            except Exception as exc:
                errors += 1
                error = str(exc)
                print(f"WARN [{photo_id[:8]}]: {type(exc).__name__} — {exc}", flush=True)

            inference_time_ms = int((time.perf_counter() - start) * 1000)
            inference_times.append(inference_time_ms)
            insert_photo_tag(conn, photo_id, args.model, tags, inference_time_ms, raw_response)

            status = "✓" if not error else "✗"
            hint = tags.get("narrative_hint") or error or "—"
            print(
                f"  {status} [{attempted}/{total}] {photo_id[:8]}… "
                f"{inference_time_ms}ms | {hint}",
                flush=True,
            )

        payload = write_output(output_path, args.model, results, errors, inference_times)
        avg_s = payload["avg_ms"] / 1000 if inference_times else 0

        print("\n=== Summary ===")
        print(f"Model:     {args.model} (Anthropic SDK)")
        print(f"Processed: {attempted}/{args.limit}")
        print(f"Errors:    {errors}")
        print(f"Avg:       {avg_s:.1f}s/photo")
        print(f"Output:    {output_path}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
