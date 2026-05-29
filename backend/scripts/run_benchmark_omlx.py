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
OUTPUT_DIR = Path("data/benchmark_results")
DEFAULT_BASE_URL = "http://localhost:8000/v1"
DEFAULT_PROMPT_VERSION = "v1.2"
COMPOSITION_WORDS = ("画面", "构图", "占据", "构成", "显得", "形成", "前景", "背景", "中景", "左侧", "右侧")
ANIMAL_WORDS = ("狗", "猫", "鹿", "鸟", "马", "牛", "羊", "兔", "熊", "虎")
PERSON_WORDS = (
    "人", "男人", "女人", "男孩", "女孩", "小孩", "孩子", "儿童", "老人",
    "他", "她", "他们", "她们", "男", "女",
    "行人", "旅人", "骑行者", "游客", "参观者", "行者", "少女", "少年",
    "老者", "女子", "男子", "人物", "身影", "身形",
)
ENDING_POS_CHARS = tuple("的地着然寞郁静美")
TRAILING_PUNCTUATION = " \t\r\n。！？!?，,；;：:“”\"'‘’、）)]}】》"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark oMLX vision model on fixed photo set.")
    parser.add_argument("--model", required=True, help="oMLX model id from /v1/models.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="OpenAI-compatible base URL.")
    parser.add_argument("--api-key", default=os.environ.get("OMLX_API_KEY", "bench"))
    parser.add_argument("--num-predict", type=int, default=2048)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--prompt-version", default=DEFAULT_PROMPT_VERSION)
    parser.add_argument("--output", default=None)
    parser.add_argument("--limit", type=int, default=None, help="Optional smoke-test limit.")
    parser.add_argument("--ids-file", default=None, help="JSON file with list of photo IDs to use instead of benchmark_set.json.")
    return parser.parse_args(argv)


def _default_output_path(prompt_version: str, run_at: datetime) -> Path:
    timestamp = run_at.strftime("%Y%m%d_%H%M%S")
    return OUTPUT_DIR / f"omlx_{prompt_version}_{timestamp}.json"


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


def _is_non_empty(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, dict, set)):
        return bool(value)
    return True


def _mentions_any(text: str | None, terms: tuple[str, ...]) -> bool:
    if not text:
        return False
    return any(term in text for term in terms)


def _has_ending_pos_violation(narrative_hint: str | None) -> bool:
    if not narrative_hint:
        return False
    cleaned = narrative_hint.rstrip(TRAILING_PUNCTUATION)
    return bool(cleaned) and cleaned.endswith(ENDING_POS_CHARS)


def _quality_analysis(results: list[dict[str, Any]]) -> dict[str, Any]:
    composition_hits: list[bool] = []
    subject_missing: list[str] = []
    ending_pos_violation: list[str] = []
    field_totals = {field: 0 for field in TAG_FIELDS}

    for result in results:
        photo_id = result["photo_id"]
        tags = result.get("tags") or {}
        narrative_hint = tags.get("narrative_hint") or result.get("narrative_hint")
        main_subject = tags.get("main_subject")

        composition_hit = _mentions_any(narrative_hint, COMPOSITION_WORDS)
        composition_hits.append(composition_hit)

        has_people = tags.get("has_people") is True
        subject_has_animal = _mentions_any(main_subject, ANIMAL_WORDS)
        hint_mentions_subject = _mentions_any(narrative_hint, PERSON_WORDS + ANIMAL_WORDS)
        if (has_people or subject_has_animal) and not hint_mentions_subject:
            subject_missing.append(photo_id)

        if _has_ending_pos_violation(narrative_hint):
            ending_pos_violation.append(photo_id)

        for field in TAG_FIELDS:
            if _is_non_empty(tags.get(field)):
                field_totals[field] += 1

    total = len(results)
    return {
        "composition_word_hits": {
            "terms": list(COMPOSITION_WORDS),
            "hits": composition_hits,
            "total_hits": sum(1 for hit in composition_hits if hit),
        },
        "subject_missing": subject_missing,
        "ending_pos_violation": ending_pos_violation,
        "field_completeness": {
            field: {"non_empty": count, "total": total}
            for field, count in field_totals.items()
        },
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.ids_file:
        photo_ids = json.loads(Path(args.ids_file).read_text(encoding="utf-8"))
    elif BENCHMARK_FILE.exists():
        photo_ids = json.loads(BENCHMARK_FILE.read_text(encoding="utf-8"))
    else:
        print("ERROR: data/benchmark_set.json not found and --ids-file not specified.", file=sys.stderr)
        return 1
    if args.limit is not None:
        photo_ids = photo_ids[: args.limit]
    run_at = datetime.now()
    output_path = Path(args.output) if args.output else _default_output_path(args.prompt_version, run_at)
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
    endpoint = f"{args.base_url.rstrip('/')}/chat/completions"
    quality_analysis = _quality_analysis(results)
    total_processed = len(results)
    json_compliance_rate = (parse_successes / total_processed) if total_processed else 0
    payload = {
        "meta": {
            "prompt_version": args.prompt_version,
            "model": args.model,
            "backend": "omlx",
            "endpoint": endpoint,
            "run_at": run_at.isoformat(timespec="seconds"),
            "benchmark_file": str(BENCHMARK_FILE),
            "total_processed": total_processed,
            "total_errors": errors,
            "json_parse_successes": parse_successes,
            "json_compliance_rate": json_compliance_rate,
            "avg_ms": avg_ms,
            "avg_s": round(avg_ms / 1000, 1) if avg_ms else 0,
        },
        "model": args.model,
        "backend": "omlx",
        "endpoint": endpoint,
        "run_at": run_at.isoformat(timespec="seconds"),
        "prompt_version": args.prompt_version,
        "total_processed": total_processed,
        "total_errors": errors,
        "json_parse_successes": parse_successes,
        "json_compliance_rate": json_compliance_rate,
        "avg_ms": avg_ms,
        "avg_s": round(avg_ms / 1000, 1) if avg_ms else 0,
        "quality_analysis": quality_analysis,
        "results": results,
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        "\n=== Summary ===\n"
        f"JSON compliance: {parse_successes}/{total_processed} ({json_compliance_rate:.1%})\n"
        f"Avg latency: {avg_ms / 1000:.1f}s\n"
        "Quality hits: "
        f"composition_word_hits={quality_analysis['composition_word_hits']['total_hits']}, "
        f"subject_missing={len(quality_analysis['subject_missing'])}, "
        f"ending_pos_violation={len(quality_analysis['ending_pos_violation'])}\n"
        f"Output: {output_path}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
