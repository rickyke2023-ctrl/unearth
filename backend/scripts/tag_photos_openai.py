"""
tag_photos_openai.py — Anthropic-compatible API vision tagger
支持 MiMo Token Plan（tp-xxxxx key）的 Anthropic 兼容接口。

用法：
  # 5 张探针（Omni）
  MIMO_API_KEY=tp-xxx .venv/bin/python -m backend.scripts.tag_photos_openai \
    --model MiMo-V2-Omni --limit 5

  # 5 张探针（Pro，验证是否支持 vision）
  MIMO_API_KEY=tp-xxx .venv/bin/python -m backend.scripts.tag_photos_openai \
    --model MiMo-V2.5-Pro --limit 5

  # 正式跑 100 张
  MIMO_API_KEY=tp-xxx .venv/bin/python -m backend.scripts.tag_photos_openai \
    --model MiMo-V2-Omni --limit 100
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import json
from pathlib import Path
from typing import Any

from openai import OpenAI, APIError

from backend.scripts.tag_photos import (
    PROMPT,
    model_safe_name,
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

MIMO_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Tag photos via MiMo Anthropic-compatible API."
    )
    parser.add_argument(
        "--model",
        default="mimo-v2.5",
        help='模型名称。默认: "mimo-v2.5"（支持 vision）。也可试 "mimo-v2-omni"。',
    )
    parser.add_argument(
        "--base-url",
        default=MIMO_BASE_URL,
        help=f"API base URL。默认: {MIMO_BASE_URL}",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="Token Plan API Key（tp-xxxxx）。也可用环境变量 MIMO_API_KEY。",
    )
    parser.add_argument(
        "--limit",
        type=positive_int,
        default=5,
        help="处理照片数量。默认: 5（探针模式）。",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="输出 JSON 路径。默认: data/tags_{model}.json。",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="跳过已用该模型标注的照片。",
    )
    return parser.parse_args(argv)


def call_mimo(client: OpenAI, model: str, encoded_image: str) -> str:
    """通过 OpenAI 兼容接口发送图片 + prompt，返回原始文本。"""
    response = client.chat.completions.create(
        model=model,
        max_tokens=2048,  # 推理模型 thinking 需要足够 token 空间
        temperature=0.1,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{encoded_image}",
                            "detail": "low",
                        },
                    },
                    {
                        "type": "text",
                        "text": PROMPT,
                    },
                ],
            }
        ],
    )
    return response.choices[0].message.content or ""


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    api_key = args.api_key or os.environ.get("MIMO_API_KEY")
    if not api_key:
        print(
            "ERROR: 需要 API Key。用 --api-key 传入，或设置 MIMO_API_KEY 环境变量。",
            file=sys.stderr,
        )
        return 1

    output_path = Path(args.output) if args.output else default_output_path(args.model)

    client = OpenAI(api_key=api_key, base_url=args.base_url)

    conn = get_connection()
    init_db(conn)
    try:
        candidates = fetch_candidates(conn, args.model, args.limit, args.skip_existing)
        total = len(candidates)
        print(f"Model: {args.model} | Base URL: {args.base_url} | Total: {total}", flush=True)

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
            except APIError as exc:
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
        print(f"Model:     {args.model}")
        print(f"Processed: {attempted}/{args.limit}")
        print(f"Errors:    {errors}")
        print(f"Avg:       {avg_s:.1f}s/photo")
        if errors == 0 and attempted > 0:
            print("✅ Vision 支持确认，可以跑完整 100 张")
        elif attempted == 0:
            print("⚠️  没有找到可处理的照片")
        else:
            print(f"⚠️  {errors}/{attempted} 张失败，请检查上方日志")
        print(f"Output:    {output_path}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
