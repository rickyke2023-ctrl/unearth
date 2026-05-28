"""
run_benchmark_omlx.py — fixed 30-photo benchmark for oMLX OpenAI-compatible API.

Usage:
  OMLX_API_KEY=bench python3 -m backend.scripts.run_benchmark_omlx \
    --model mlx-community/gemma-4-e4b-4bit
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import requests

from backend.config import PREVIEW_DIR
from backend.scripts.tag_photos import (
    PROMPT,
    TAG_FIELDS,
    empty_tags,
    encode_preview,
    normalized_tags,
    parse_response,
)

BENCHMARK_FILE = Path("data/benchmark_set.json")
OUTPUT_PATH = Path("data/benchmark_results/omlx_gemma4.json")
DEFAULT_BASE_URL = "http://localhost:8000/v1"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark oMLX vision model on fixed photo set.")
    parser.add_argument("--model", required=True, help="oMLX model id from /v1/models.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="OpenAI-compatible base URL.")
    parser.add_argument("--api-key", default=os.environ.get("OMLX_API_KEY", "bench"))
    parser.add_argument("--num-predict", type=int, default=2048)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--output", default=str(OUTPUT_PATH))
    parser.add_argument("--limit", type=int, default=None, help="Optional smoke-test limit.")
    return parser.parse_args(argv)


def _auth_headers(api_key: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def call_omlx(args: argparse.Namespace, encoded_image: str) -> tuple[str, dict[str, Any]]:
    url = f"{args.base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": args.model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{encoded_image}"},
                    },
                ],
            }
        ],
        "temperature": 0.1,
        "max_tokens": args.num_predict,
        "stream": False,
    }
    response = requests.post(url, headers=_auth_headers(args.api_key), json=payload, timeout=args.timeout)
    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        body = response.text.strip()
        if len(body) > 1000:
            body = body[:1000] + "..."
        raise requests.HTTPError(f"{exc}; body={body}") from exc
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("empty choices from oMLX")
    message = choices[0].get("message") or {}
    content = message.get("content") or ""
    if not content.strip():
        reasoning = message.get("reasoning_content") or ""
        raise ValueError(f"empty response content (reasoning_len={len(reasoning)})")
    return content, data


def _field_stats(parsed: dict[str, Any] | None, tags: dict[str, Any]) -> dict[str, Any]:
    if parsed is None:
        present_fields: list[str] = []
    else:
        present_fields = [field for field in TAG_FIELDS if field in parsed]
    non_null_fields = [field for field in TAG_FIELDS if tags.get(field) is not None]
    return {
        "tag_fields_present": present_fields,
        "missing_tag_fields": [field for field in TAG_FIELDS if field not in present_fields],
        "tag_fields_present_count": len(present_fields),
        "tag_fields_total": len(TAG_FIELDS),
        "all_tag_fields_present": len(present_fields) == len(TAG_FIELDS),
        "tag_fields_non_null": non_null_fields,
        "tag_fields_non_null_count": len(non_null_fields),
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not BENCHMARK_FILE.exists():
        print("ERROR: data/benchmark_set.json not found.", file=sys.stderr)
        return 1

    photo_ids: list[str] = json.loads(BENCHMARK_FILE.read_text(encoding="utf-8"))
    if args.limit is not None:
        photo_ids = photo_ids[: args.limit]
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Model: {args.model} | Backend: oMLX | Photos: {len(photo_ids)}", flush=True)
    print(f"Endpoint: {args.base_url.rstrip('/')}/chat/completions", flush=True)

    results: list[dict[str, Any]] = []
    errors = 0
    parse_successes = 0
    inference_times: list[int] = []

    for index, photo_id in enumerate(photo_ids, 1):
        preview = PREVIEW_DIR / f"{photo_id}.jpg"
        if not preview.exists():
            print(f"  SKIP [{index}/{len(photo_ids)}] {photo_id[:8]} — no preview", flush=True)
            continue

        raw: str | None = None
        raw_api: dict[str, Any] | None = None
        parsed: dict[str, Any] | None = None
        tags = empty_tags()
        error: str | None = None
        json_parse_ok = False
        started = time.perf_counter()

        try:
            encoded = encode_preview(photo_id)
            raw, raw_api = call_omlx(args, encoded)
            parsed = parse_response(raw)
            json_parse_ok = True
            parse_successes += 1
            tags = normalized_tags(parsed)
        except Exception as exc:
            errors += 1
            error = str(exc)
            print(f"  ✗ [{index}/{len(photo_ids)}] {photo_id[:8]} — {error}", flush=True)

        inference_time_ms = int((time.perf_counter() - started) * 1000)
        inference_times.append(inference_time_ms)
        field_stats = _field_stats(parsed, tags)

        result = {
            "photo_id": photo_id,
            "tags": tags,
            "narrative_hint": tags.get("narrative_hint"),
            "raw": raw,
            "raw_api": raw_api,
            "error": error,
            "json_parse_ok": json_parse_ok,
            "inference_time_ms": inference_time_ms,
            "ms": inference_time_ms,
            **field_stats,
        }
        results.append(result)

        if not error:
            hint = tags.get("narrative_hint") or "-"
            print(f"  ✓ [{index}/{len(photo_ids)}] {photo_id[:8]} {inference_time_ms}ms | {hint}", flush=True)

    avg_ms = int(sum(inference_times) / len(inference_times)) if inference_times else 0
    payload = {
        "model": args.model,
        "backend": "omlx",
        "endpoint": f"{args.base_url.rstrip('/')}/chat/completions",
        "run_at": datetime.now().isoformat(timespec="seconds"),
        "total_processed": len(results),
        "total_errors": errors,
        "json_parse_successes": parse_successes,
        "avg_ms": avg_ms,
        "avg_s": round(avg_ms / 1000, 1) if avg_ms else 0,
        "results": results,
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"\n=== Done === errors:{errors}/{len(photo_ids)} "
        f"json:{parse_successes}/{len(photo_ids)} avg:{avg_ms / 1000:.1f}s -> {output_path}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
