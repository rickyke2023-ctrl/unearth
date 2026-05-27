"""
run_benchmark.py — 固定 30 张照片，对单个模型跑标注，结果存独立 JSON。

用法：
  # 本地 Ollama 模型
  .venv/bin/python -m backend.scripts.run_benchmark --model qwen2.5vl:7b

  # MiMo 在线（Anthropic SDK）
  MIMO_API_KEY=tp-xxx .venv/bin/python -m backend.scripts.run_benchmark \
    --model mimo-v2.5 --backend anthropic
"""
from __future__ import annotations

import argparse, json, os, sys, time
from pathlib import Path
from typing import Any

from backend.scripts.tag_photos import (
    PROMPT, encode_preview, parse_response, normalized_tags, empty_tags,
    positive_int, model_safe_name,
)
from backend.config import PREVIEW_DIR

BENCHMARK_FILE = Path("data/benchmark_set.json")
RESULTS_DIR = Path("data/benchmark_results")
RESULTS_DIR.mkdir(exist_ok=True)


def parse_args(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--backend", choices=["ollama", "anthropic"], default="ollama")
    p.add_argument("--base-url", default=None)
    p.add_argument("--api-key", default=None)
    p.add_argument("--num-predict", type=int, default=None,
                   help="Max tokens to generate. Defaults to 2048 for gemma4, 512 otherwise.")
    return p.parse_args(argv)


def call_ollama(model: str, encoded: str, num_predict: int = 512) -> str:
    import requests
    r = requests.post(
        "http://localhost:11434/api/chat",
        json={"model": model, "messages": [
            {"role": "user", "content": PROMPT, "images": [encoded]}
        ], "stream": False, "options": {"temperature": 0.1, "num_predict": num_predict}},
        timeout=180,
    )
    r.raise_for_status()
    content = r.json()["message"]["content"]
    if not content or not content.strip():
        raise ValueError(f"empty response (prompt_eval_count={r.json().get('prompt_eval_count',0)})")
    return content


def call_anthropic(client: Any, model: str, encoded: str) -> str:
    response = client.messages.create(
        model=model, max_tokens=2048, temperature=0.1,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": encoded}},
            {"type": "text", "text": PROMPT},
        ]}],
    )
    for block in response.content:
        if hasattr(block, "text") and block.type == "text":
            text = block.text or ""
            if not text.strip():
                raise ValueError("empty response from Anthropic")
            return text
    raise ValueError("no text block in response")


def main(argv=None):
    args = parse_args(argv)

    if not BENCHMARK_FILE.exists():
        print("ERROR: data/benchmark_set.json not found. Run sampling first.", file=sys.stderr)
        return 1

    photo_ids: list[str] = json.loads(BENCHMARK_FILE.read_text())
    total = len(photo_ids)
    out_path = RESULTS_DIR / f"{model_safe_name(args.model)}.json"

    # gemma4 uses thinking mode — needs more tokens; default 512 for others
    num_predict = args.num_predict
    if num_predict is None:
        num_predict = 2048 if "gemma4" in args.model else 512

    client = None
    if args.backend == "anthropic":
        import anthropic
        api_key = args.api_key or os.environ.get("MIMO_API_KEY")
        base_url = args.base_url or "https://token-plan-cn.xiaomimimo.com/anthropic"
        client = anthropic.Anthropic(api_key=api_key, base_url=base_url)

    print(f"Model: {args.model} | Backend: {args.backend} | Photos: {total}", flush=True)

    results, errors, times = [], 0, []

    for i, photo_id in enumerate(photo_ids, 1):
        preview = PREVIEW_DIR / f"{photo_id}.jpg"
        if not preview.exists():
            print(f"  SKIP [{i}/{total}] {photo_id[:8]} — no preview", flush=True)
            continue

        tags = empty_tags()
        raw = None
        err = None
        t0 = time.perf_counter()

        try:
            encoded = encode_preview(photo_id)
            if args.backend == "ollama":
                raw = call_ollama(args.model, encoded, num_predict)
            else:
                raw = call_anthropic(client, args.model, encoded)
            tags = normalized_tags(parse_response(raw))
        except Exception as exc:
            errors += 1
            err = str(exc)
            print(f"  ✗ [{i}/{total}] {photo_id[:8]} — {exc}", flush=True)

        ms = int((time.perf_counter() - t0) * 1000)
        times.append(ms)
        results.append({"photo_id": photo_id, "tags": tags, "raw": raw, "error": err, "ms": ms})

        if not err:
            hint = tags.get("narrative_hint") or "—"
            print(f"  ✓ [{i}/{total}] {photo_id[:8]} {ms}ms | {hint}", flush=True)

    avg = sum(times) / len(times) / 1000 if times else 0
    out_path.write_text(json.dumps({"model": args.model, "results": results,
                                     "errors": errors, "avg_s": round(avg, 1)},
                                   ensure_ascii=False, indent=2))
    print(f"\n=== Done === errors:{errors}/{total} avg:{avg:.1f}s → {out_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
