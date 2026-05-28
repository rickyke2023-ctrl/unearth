from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import shutil
import signal
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import requests
from PIL import Image, ImageOps

from backend.config import DATA_DIR, PREVIEW_DIR
from backend.database import get_connection, init_db


OLLAMA_URL = "http://localhost:11434"
DEFAULT_OMLX_URL = "http://localhost:8000/v1"
PROMPT = """你是一位有文学审美的视觉观察者。分析这张照片，严格按以下 JSON 格式返回，不要输出其他内容，不要 markdown 代码块：
{"has_people": true或false, "people_count": "none或one或two或group", "people_description": "有人时描述服装颜色、大致年龄、姿态，无人填null", "main_subject": "主体是什么（1-5个字）", "setting": "indoor或outdoor或unknown", "light_quality": "光线质感，如：黄金时刻暖光、阴天漫射光、强逆光、窗边柔光、夜间人工光", "weather": "户外天气如晴/阴/雨后/起雾，室内填null", "time_of_day": "morning或afternoon或dusk或night或unknown", "dominant_colors": ["主色调1", "主色调2", "主色调3"], "color_detail": "最显眼的颜色细节如红色雨伞，无则填null", "mood": ["情绪词1", "情绪词2"], "composition": "minimal（主体孤立、留白多）或complex（元素密集）或layered（有明显前后景层次）或centered（主体居画面中心）或offcenter（主体明显偏移）", "narrative_hint": "一句话，严格不超过40字。锁定这张照片里最具体、最不可替代的细节——必须有动词，写出它的颜色或材质、在哪里、在做什么或如何存在。如果照片中有人，必须用他/她/他们/男/女/老人/孩子/行人/旅人等词直接指代，不能只写衣物、影子或轮廓。如果有动物，必须出现在描述中。如果有明显的材质或质感特征（粗糙、透明、残破、潮湿等），写进去。优先选择只属于这张照片的细节，不写任何同类照片都适用的通用描述。最后一个词必须是名词或动词。禁止使用：画面、构图、占据、构成、显得、形成、前景、背景、中景、左侧、右侧等摄影分析词。"}"""

TAG_FIELDS = (
    "has_people",
    "people_count",
    "people_description",
    "main_subject",
    "setting",
    "light_quality",
    "weather",
    "time_of_day",
    "dominant_colors",
    "color_detail",
    "mood",
    "composition",
    "narrative_hint",
)

COMPOSITION_QUALITY_WORDS = (
    "画面", "构图", "占据", "构成", "显得", "形成",
    "前景", "背景", "中景", "左侧", "右侧",
)


def positive_int(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("value must be an integer") from exc
    if parsed < 1:
        raise argparse.ArgumentTypeError("value must be greater than zero")
    return parsed


def model_safe_name(model: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", model).strip("_") or "model"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Tag photo previews with a local vision model.")
    parser.add_argument(
        "--engine",
        choices=("ollama", "omlx"),
        default="ollama",
        help="Inference engine to use. Defaults to ollama.",
    )
    parser.add_argument(
        "--model",
        required=True,
        help='Model name, for example "minicpm-v4.6", "qwen2.5vl:3b", or an oMLX model id.',
    )
    parser.add_argument(
        "--omlx-url",
        default=DEFAULT_OMLX_URL,
        help=f"oMLX OpenAI-compatible base URL. Defaults to {DEFAULT_OMLX_URL}.",
    )
    parser.add_argument(
        "--omlx-api-key",
        default=os.environ.get("OMLX_API_KEY", "bench"),
        help="oMLX API key. Defaults to OMLX_API_KEY or 'bench'.",
    )
    parser.add_argument(
        "--num-predict",
        type=positive_int,
        default=2048,
        help="Maximum tokens to generate for oMLX. Defaults to 2048.",
    )
    parser.add_argument(
        "--limit",
        type=positive_int,
        default=100,
        help="Number of photos to process. Defaults to 100.",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output JSON file path. Defaults to data/tags_{model_safe}.json.",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip photos already tagged with this model in photo_tags.",
    )
    parser.add_argument(
        "--ids-file",
        default=None,
        help="JSON file with a list of objects containing photo_id (e.g. data/sample_photos.json). "
             "When combined with --limit, truncates to the first N photos from the file.",
    )
    parser.add_argument(
        "--checkpoint-every",
        type=positive_int,
        default=100,
        help="Write a checkpoint file and run quality gate every N photos. Defaults to 100.",
    )
    parser.add_argument(
        "--no-abort-on-quality-fail",
        action="store_true",
        help="Log quality gate failures but do not abort the run.",
    )
    parser.add_argument(
        "--prompt-version",
        default=None,
        help="Prompt version to store with each tag row, for example v1.3. Defaults to NULL.",
    )
    return parser.parse_args(argv)


def default_output_path(model: str) -> Path:
    return DATA_DIR / f"tags_{model_safe_name(model)}.json"


def db_model_name(args: argparse.Namespace) -> str:
    if args.engine == "omlx":
        return f"{args.model}-omlx"
    return args.model


def ready_condition(conn) -> str:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(photos)").fetchall()}
    if "preview_ready" in columns:
        return "p.preview_ready = 1"
    return "p.preview_path IS NOT NULL AND p.preview_path != ''"


def fetch_candidates(conn, model: str, limit: int, skip_existing: bool) -> list[dict[str, Any]]:
    where_parts = [
        ready_condition(conn),
        "p.status NOT IN ('staged', 'deleted')",
    ]
    params: list[Any] = []
    if skip_existing:
        where_parts.append(
            """
            NOT EXISTS (
                SELECT 1
                FROM photo_tags t
                WHERE t.photo_id = p.id
                  AND t.model = ?
            )
            """
        )
        params.append(model)

    where_sql = " AND ".join(f"({part})" for part in where_parts)
    ranked_sql = f"""
        WITH ranked AS (
            SELECT p.id,
                   p.year,
                   p.camera_model,
                   ROW_NUMBER() OVER (PARTITION BY p.year ORDER BY RANDOM()) AS year_rank
            FROM photos p
            WHERE {where_sql}
        )
        SELECT id, year, camera_model
        FROM ranked
        WHERE year_rank <= 15
        ORDER BY RANDOM()
    """
    rows = [dict(row) for row in conn.execute(ranked_sql, tuple(params)).fetchall()]

    selected: list[dict[str, Any]] = []
    selected_ids: set[str] = set()
    camera_counts: dict[str, int] = {}

    def camera_key(row: dict[str, Any]) -> str:
        value = row.get("camera_model")
        return value if value else "__unknown__"

    def add_with_camera_cap(row: dict[str, Any]) -> bool:
        if len(selected) >= limit or row["id"] in selected_ids:
            return False
        key = camera_key(row)
        if camera_counts.get(key, 0) >= 20:
            return False
        selected.append(row)
        selected_ids.add(row["id"])
        camera_counts[key] = camera_counts.get(key, 0) + 1
        return True

    for row in rows:
        add_with_camera_cap(row)
        if len(selected) >= limit:
            return selected

    fill_random(conn, where_sql, params, selected, selected_ids, camera_counts, limit, True)
    if len(selected) < limit:
        fill_random(conn, where_sql, params, selected, selected_ids, camera_counts, limit, False)
    return selected


def fill_random(
    conn,
    where_sql: str,
    params: list[Any],
    selected: list[dict[str, Any]],
    selected_ids: set[str],
    camera_counts: dict[str, int],
    limit: int,
    enforce_camera_cap: bool,
) -> None:
    if len(selected) >= limit:
        return
    rows = [
        dict(row)
        for row in conn.execute(
            f"""
            SELECT p.id, p.year, p.camera_model
            FROM photos p
            WHERE {where_sql}
            ORDER BY RANDOM()
            """,
            tuple(params),
        ).fetchall()
    ]
    for row in rows:
        if len(selected) >= limit:
            return
        if row["id"] in selected_ids:
            continue
        key = row.get("camera_model") or "__unknown__"
        if enforce_camera_cap and camera_counts.get(key, 0) >= 20:
            continue
        selected.append(row)
        selected_ids.add(row["id"])
        camera_counts[key] = camera_counts.get(key, 0) + 1


def fetch_candidates_from_file(
    conn, ids_file: str, model: str, skip_existing: bool
) -> list[dict[str, Any]]:
    with open(ids_file, encoding="utf-8") as f:
        entries = json.load(f)
    photo_ids = [e["photo_id"] for e in entries if "photo_id" in e]
    if not photo_ids:
        return []

    placeholders = ",".join("?" * len(photo_ids))
    rows = [
        dict(row)
        for row in conn.execute(
            f"SELECT id, year, camera_model FROM photos WHERE id IN ({placeholders})",
            photo_ids,
        ).fetchall()
    ]

    if skip_existing:
        already_tagged = {
            row["photo_id"]
            for row in conn.execute(
                f"SELECT photo_id FROM photo_tags WHERE model = ? AND photo_id IN ({placeholders})",
                [model] + photo_ids,
            ).fetchall()
        }
        rows = [r for r in rows if r["id"] not in already_tagged]

    return rows


def _notify_mac(title: str, message: str) -> None:
    import subprocess
    try:
        subprocess.run(
            ["osascript", "-e", f'display notification "{message}" with title "{title}"'],
            capture_output=True, timeout=5,
        )
    except Exception:
        pass


def _has_composition_word(hint: str | None) -> bool:
    if not hint:
        return False
    return any(word in hint for word in COMPOSITION_QUALITY_WORDS)


def check_quality_gate(results: list[dict[str, Any]], window: int = 100) -> tuple[bool, bool, str]:
    """Return (ok, warn, message). warn=True means slow down but continue."""
    recent = results[-window:]
    if len(recent) < 10:
        return True, False, ""
    errors = sum(1 for r in recent if r.get("error"))
    null_hints = sum(1 for r in recent if not r.get("narrative_hint"))
    comp_hits = sum(1 for r in recent if _has_composition_word(r.get("narrative_hint")))
    error_rate = errors / len(recent)
    null_rate = null_hints / len(recent)
    comp_rate = comp_hits / len(recent)
    if error_rate > 0.20:
        return False, False, f"error rate {error_rate:.0%} in last {len(recent)} photos (threshold 20%)"
    if null_rate > 0.25:
        return False, False, f"narrative_hint null rate {null_rate:.0%} in last {len(recent)} photos (threshold 25%)"
    if comp_rate > 0.50:
        return False, False, f"composition word rate {comp_rate:.0%} in last {len(recent)} photos (threshold 50%)"
    if comp_rate > 0.30:
        return True, True, f"composition word rate {comp_rate:.0%} — 减速模式"
    return True, False, ""


def write_checkpoint(
    path: Path,
    done: int,
    total: int,
    results: list[dict[str, Any]],
    errors: int,
    abort_reason: str | None = None,
) -> None:
    recent = results[-100:]
    null_hints = sum(1 for r in recent if not r.get("narrative_hint"))
    recent_errors = sum(1 for r in recent if r.get("error"))
    comp_hits = sum(1 for r in recent if _has_composition_word(r.get("narrative_hint")))
    payload = {
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "completed": done,
        "total": total,
        "errors_total": errors,
        "recent_window": len(recent),
        "recent_errors": recent_errors,
        "recent_null_narrative_hints": null_hints,
        "recent_composition_word_hits": comp_hits,
        "recent_error_rate": round(recent_errors / len(recent), 3) if recent else 0,
        "recent_null_rate": round(null_hints / len(recent), 3) if recent else 0,
        "recent_comp_rate": round(comp_hits / len(recent), 3) if recent else 0,
        "sample_hints": [r.get("narrative_hint") for r in results[-5:] if r.get("narrative_hint")],
    }
    if abort_reason is not None:
        payload["abort_reason"] = abort_reason
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def check_ollama_model(model: str) -> None:
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        response.raise_for_status()
    except requests.RequestException:
        print("ERROR: Ollama is not running. Start with: ollama serve", file=sys.stderr)
        raise SystemExit(1)

    models = response.json().get("models", [])
    names = {item.get("name") for item in models if item.get("name")}
    model_found = model in names
    if ":" not in model:
        model_found = model_found or f"{model}:latest" in names
    if not model_found:
        print(f"ERROR: Model '{model}' not found. Run: ollama pull {model}", file=sys.stderr)
        raise SystemExit(1)


def check_omlx_health(args: argparse.Namespace) -> None:
    url = f"{args.omlx_url.rstrip('/')}/models"
    try:
        response = requests.get(url, headers=_omlx_auth_headers(args.omlx_api_key), timeout=5)
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"ERROR: oMLX health check failed: GET {url} — {exc}", file=sys.stderr)
        raise SystemExit(1)


def restart_omlx(args: argparse.Namespace) -> bool:
    import subprocess
    print("WARN: 连续 3 次 oMLX 连接错误，尝试自动重启...", flush=True)
    try:
        subprocess.run(["pkill", "-f", "omlx serve"], capture_output=True, timeout=10)
        time.sleep(3)
    except Exception as exc:
        print(f"WARN: pkill omlx serve: {exc}", flush=True)
    try:
        subprocess.Popen(
            ["omlx", "serve",
             "--model-dir", str(Path.home() / ".omlx/models"),
             "--port", "8000",
             "--hot-cache-max-size", "6GB"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as exc:
        print(f"ERROR: restart_omlx 启动失败: {exc}", flush=True)
        return False
    for _ in range(45):
        time.sleep(1)
        try:
            url = f"{args.omlx_url.rstrip('/')}/models"
            resp = requests.get(url, headers=_omlx_auth_headers(args.omlx_api_key), timeout=3)
            if resp.ok:
                print("oMLX 重启成功，继续标注", flush=True)
                return True
        except Exception:
            pass
    print("ERROR: oMLX 重启失败，45s 内未恢复健康", flush=True)
    return False


def _omlx_auth_headers(api_key: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def encode_preview(photo_id: str) -> str:
    path = PREVIEW_DIR / f"{photo_id}.jpg"
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image)
        image.thumbnail((512, 512))
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=85, optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def call_ollama(model: str, encoded_image: str) -> str:
    response = requests.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": PROMPT,
                    "images": [encoded_image],
                }
            ],
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 2048 if "gemma4" in model else 512},
        },
        timeout=180,
    )
    if response.status_code == 404:
        print(f"ERROR: Model '{model}' not found. Run: ollama pull {model}", file=sys.stderr)
        raise SystemExit(1)
    response.raise_for_status()
    return response.json()["message"]["content"]


def call_omlx(
    photo_id: str,
    encoded_image: str,
    args: argparse.Namespace,
) -> tuple[str, dict[str, Any]]:
    url = f"{args.omlx_url.rstrip('/')}/chat/completions"
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
    response = requests.post(
        url,
        headers=_omlx_auth_headers(args.omlx_api_key),
        json=payload,
        timeout=180,
    )
    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        body = response.text.strip()
        if len(body) > 1000:
            body = body[:1000] + "..."
        raise requests.HTTPError(f"photo_id={photo_id}; {exc}; body={body}") from exc

    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise ValueError(f"photo_id={photo_id}; empty choices from oMLX")
    message = choices[0].get("message") or {}
    content = message.get("content") or ""
    if not content.strip():
        reasoning = message.get("reasoning_content") or ""
        raise ValueError(
            f"photo_id={photo_id}; empty response content (reasoning_len={len(reasoning)})"
        )
    return content, data


def strip_markdown_fences(text: str) -> str:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        return fenced.group(1).strip()
    return stripped


def parse_response(raw_response: str) -> dict[str, Any]:
    text = strip_markdown_fences(raw_response)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


def empty_tags() -> dict[str, Any]:
    return {field: None for field in TAG_FIELDS}


_VALID_SETTING    = {'indoor', 'outdoor', 'unknown'}
_VALID_TIME       = {'dawn', 'morning', 'afternoon', 'evening', 'dusk', 'night', 'unknown'}
_VALID_COMPOSE    = {'minimal', 'complex', 'layered', 'centered', 'offcenter'}

# dominant_colors / mood / main_subject are free-form Chinese text from the prompt —
# no enum filter; keeping only structural English enums here.
_LIST_FIELDS      = {'mood', 'dominant_colors'}
_ENUM_FILTERS: dict[str, set[str]] = {
    'setting':     _VALID_SETTING,
    'time_of_day': _VALID_TIME,
    'composition': _VALID_COMPOSE,
}


def _coerce_list(value: Any) -> list[Any]:
    """Ensure a value that should be a list actually is one."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value:
        return [value]
    return []


def normalized_tags(parsed: dict[str, Any]) -> dict[str, Any]:
    tags = empty_tags()
    for field in TAG_FIELDS:
        value = parsed.get(field)

        if field == 'has_people':
            if isinstance(value, bool):
                tags[field] = value
            elif isinstance(value, int):
                tags[field] = bool(value)
            elif isinstance(value, str):
                tags[field] = value.lower() not in {'false', 'no', 'none', 'null', '0', ''}
            else:
                tags[field] = None
            continue

        # Coerce list fields from string if needed
        if field in _LIST_FIELDS:
            value = _coerce_list(value)
            if field in _ENUM_FILTERS:
                value = [v for v in value if v in _ENUM_FILTERS[field]]
            tags[field] = value if value else None
            continue

        # Filter scalar enum fields
        if field in _ENUM_FILTERS:
            tags[field] = value if value in _ENUM_FILTERS[field] else 'unknown'
            continue

        tags[field] = value
    return tags


def bool_to_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return 1 if value else 0
    return None


def json_text(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False)


def insert_photo_tag(
    conn,
    photo_id: str,
    model: str,
    tags: dict[str, Any],
    inference_time_ms: int,
    raw_response: str | None,
    prompt_version: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO photo_tags (
            id, photo_id, model, has_people, setting, time_of_day, mood,
            main_subject, dominant_colors, composition, narrative_hint,
            inference_time_ms, raw_response, prompt_version
        ) VALUES (
            :id, :photo_id, :model, :has_people, :setting, :time_of_day, :mood,
            :main_subject, :dominant_colors, :composition, :narrative_hint,
            :inference_time_ms, :raw_response, :prompt_version
        )
        """,
        {
            "id": str(uuid.uuid4()),
            "photo_id": photo_id,
            "model": model,
            "has_people": bool_to_int(tags.get("has_people")),
            "setting": tags.get("setting"),
            "time_of_day": tags.get("time_of_day"),
            "mood": json_text(tags.get("mood")),
            "main_subject": tags.get("main_subject"),
            "dominant_colors": json_text(tags.get("dominant_colors")),
            "composition": tags.get("composition"),
            "narrative_hint": tags.get("narrative_hint"),
            "inference_time_ms": inference_time_ms,
            "raw_response": raw_response,
            "prompt_version": prompt_version,
        },
    )
    conn.commit()


def format_eta(seconds: float) -> str:
    if seconds < 60:
        return f"~{int(seconds)}s"
    minutes = int(round(seconds / 60))
    return f"~{minutes}m"


def print_progress(done: int, total: int, errors: int, inference_times: list[int]) -> None:
    avg_seconds = (sum(inference_times) / len(inference_times) / 1000) if inference_times else 0
    eta_seconds = max(total - done, 0) * avg_seconds
    print(
        f"Progress: {done}/{total} | errors: {errors} | "
        f"avg: {avg_seconds:.1f}s/photo | eta: {format_eta(eta_seconds)}",
        flush=True,
    )


def check_disk_space(candidate_count: int) -> None:
    free_bytes = shutil.disk_usage(".").free
    estimated_bytes = candidate_count * 2 * 1024
    min_free_bytes = 500 * 1024 * 1024
    if free_bytes < min_free_bytes:
        print(
            f"ERROR: 剩余磁盘空间低于 500MB，安全退出 "
            f"(free={free_bytes / 1024 / 1024:.1f}MB)",
            file=sys.stderr,
            flush=True,
        )
        raise SystemExit(1)
    if free_bytes < estimated_bytes * 3:
        print(
            f"WARN: 剩余磁盘空间可能不足 "
            f"(free={free_bytes / 1024 / 1024:.1f}MB, "
            f"estimated={estimated_bytes / 1024 / 1024:.1f}MB, safety_margin=3x)",
            flush=True,
        )


def write_output(
    output_path: Path,
    model: str,
    results: list[dict[str, Any]],
    errors: int,
    inference_times: list[int],
) -> dict[str, Any]:
    avg_ms = int(sum(inference_times) / len(inference_times)) if inference_times else 0
    payload = {
        "model": model,
        "run_at": datetime.now().isoformat(timespec="seconds"),
        "total_processed": len(results),
        "total_errors": errors,
        "avg_ms": avg_ms,
        "results": results,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    storage_model = db_model_name(args)
    output_path = Path(args.output) if args.output else default_output_path(storage_model)

    if args.engine == "omlx":
        check_omlx_health(args)
    else:
        check_ollama_model(args.model)

    checkpoint_path = DATA_DIR / "tag_checkpoint.json"

    conn = get_connection()
    init_db(conn)
    try:
        if args.ids_file:
            candidates = fetch_candidates_from_file(
                conn, args.ids_file, storage_model, args.skip_existing
            )
            if args.ids_file and args.limit < len(candidates):
                candidates = candidates[: args.limit]
            print(
                f"Model: {args.model} | Engine: {args.engine} | Stored as: {storage_model} | "
                f"Source: {args.ids_file}",
                flush=True,
            )
        else:
            candidates = fetch_candidates(conn, storage_model, args.limit, args.skip_existing)
        total = len(candidates)
        print(
            f"Model: {args.model} | Engine: {args.engine} | Stored as: {storage_model} | "
            f"Total to process: {total}",
            flush=True,
        )
        print(
            f"Quality gate: abort if error>20% or null_hint>25% or composition_word>50% "
            f"(warn>30%) in last {args.checkpoint_every} photos",
            flush=True,
        )
        check_disk_space(total)

        results: list[dict[str, Any]] = []
        inference_times: list[int] = []
        errors = 0
        attempted = 0
        consecutive_conn_errors = 0
        quality_warn = False

        def handle_shutdown(signum: int, frame: Any) -> None:
            write_checkpoint(checkpoint_path, attempted, total, results, errors)
            print("收到中断信号，已写入 checkpoint，安全退出", flush=True)
            sys.exit(0)

        signal.signal(signal.SIGINT, handle_shutdown)
        signal.signal(signal.SIGTERM, handle_shutdown)

        for candidate in candidates:
            if quality_warn:
                time.sleep(2)
            photo_id = candidate["id"]
            preview_path = PREVIEW_DIR / f"{photo_id}.jpg"
            if not preview_path.exists():
                continue

            attempted += 1
            raw_response: str | None = None
            raw_api_response: dict[str, Any] | None = None
            error: str | None = None
            tags = empty_tags()
            start = time.perf_counter()

            try:
                encoded = encode_preview(photo_id)
                if args.engine == "omlx":
                    raw_response, raw_api_response = call_omlx(photo_id, encoded, args)
                else:
                    raw_response = call_ollama(args.model, encoded)
                parsed = parse_response(raw_response)
                tags = normalized_tags(parsed)
                consecutive_conn_errors = 0
            except json.JSONDecodeError as exc:
                errors += 1
                error = "JSON parse failed"
                print(f"WARN: photo_id={photo_id} — {exc}", flush=True)
            except requests.RequestException as exc:
                errors += 1
                error = str(exc)
                if isinstance(exc, (requests.Timeout, requests.ConnectionError)):
                    consecutive_conn_errors += 1
                else:
                    consecutive_conn_errors = 0
                print(f"WARN: photo_id={photo_id} — {exc}", flush=True)
            except Exception as exc:
                errors += 1
                error = str(exc)
                print(f"WARN: photo_id={photo_id} — {exc}", flush=True)

            if args.engine == "omlx" and consecutive_conn_errors >= 3:
                if not restart_omlx(args):
                    write_checkpoint(
                        checkpoint_path, attempted, total, results, errors,
                        abort_reason="omlx_restart_failed",
                    )
                    write_output(output_path, storage_model, results, errors, inference_times)
                    return 1
                consecutive_conn_errors = 0

            inference_time_ms = int((time.perf_counter() - start) * 1000)
            inference_times.append(inference_time_ms)
            insert_photo_tag(
                conn,
                photo_id,
                storage_model,
                tags,
                inference_time_ms,
                raw_response,
                args.prompt_version,
            )

            result = {
                "photo_id": photo_id,
                "year": candidate["year"],
                "camera_model": candidate["camera_model"],
                **tags,
                "inference_time_ms": inference_time_ms,
                "error": error,
            }
            if raw_api_response is not None:
                result["raw_api_response"] = raw_api_response
            results.append(result)

            if attempted % 10 == 0 or attempted == total:
                print_progress(attempted, total, errors, inference_times)

            if attempted % args.checkpoint_every == 0:
                write_checkpoint(checkpoint_path, attempted, total, results, errors)
                ok, warn, reason = check_quality_gate(results, window=args.checkpoint_every)
                if not ok:
                    if "composition word" in reason:
                        abort_code = "quality_gate_composition"
                    elif "null rate" in reason:
                        abort_code = "quality_gate_null_hint"
                    else:
                        abort_code = "quality_gate_error_rate"
                    msg = f"Quality gate failed at {attempted}/{total}: {reason}"
                    print(f"ERROR: {msg}", flush=True)
                    _notify_mac("标注 Quality Gate 触发", msg)
                    if not args.no_abort_on_quality_fail:
                        write_checkpoint(
                            checkpoint_path, attempted, total, results, errors,
                            abort_reason=abort_code,
                        )
                        write_output(output_path, storage_model, results, errors, inference_times)
                        return 1
                else:
                    quality_warn = warn
                    status = "WARN（减速）" if warn else "OK"
                    print(
                        f"[checkpoint {attempted}/{total}] quality gate {status}"
                        + (f": {reason}" if warn else ""),
                        flush=True,
                    )
                    if not warn:
                        _notify_mac("标注进度", f"{attempted}/{total} 张完成，质量正常")

        write_checkpoint(checkpoint_path, attempted, total, results, errors)
        payload = write_output(output_path, storage_model, results, errors, inference_times)
        processed = payload["total_processed"]
        avg_seconds = (payload["avg_ms"] / 1000) if inference_times else 0
        min_seconds = (min(inference_times) / 1000) if inference_times else 0
        max_seconds = (max(inference_times) / 1000) if inference_times else 0

        print("=== Summary ===")
        print(f"Model: {args.model}")
        print(f"Engine: {args.engine}")
        print(f"Stored model: {storage_model}")
        print(f"Processed: {processed}/{total}")
        print(f"Errors: {errors}")
        print(f"Avg inference: {avg_seconds:.1f}s")
        print(f"Min: {min_seconds:.1f}s / Max: {max_seconds:.1f}s")
        print(f"Output: {output_path}")
        _notify_mac("标注完成", f"{processed} 张标注完成，errors={errors}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
