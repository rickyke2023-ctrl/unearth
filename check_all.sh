#!/usr/bin/env bash
# check_all.sh — 一键验证前后端核心功能
# 用法: ./check_all.sh
# 要求: 后端已在 localhost:8000 运行 (uvicorn backend.main:app)

set -e
PASS=0
FAIL=0
SKIP=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
skip() { echo "  ⏭  $1"; SKIP=$((SKIP+1)); }
header() { echo; echo "── $1 ──────────────────────────────────"; }

BASE="http://localhost:8000"

# ── 前端 TypeScript 检查 ──────────────────────────────────────────────────
header "前端 TypeScript"
cd frontend
if npx tsc --noEmit 2>/dev/null; then
  ok "tsc --noEmit 通过"
else
  fail "TypeScript 类型错误"
fi
cd ..

# ── 前端构建检查 ──────────────────────────────────────────────────────────
header "前端 Build"
cd frontend
if npm run build > /dev/null 2>&1; then
  ok "npm run build 成功"
else
  fail "构建失败（查看 npm run build 输出）"
fi
cd ..

# ── 后端连通性 ────────────────────────────────────────────────────────────
header "后端 API"

if ! curl -sf "$BASE/api/status" > /dev/null 2>&1; then
  echo "  ⚠️  后端未运行，跳过所有 API 检查"
  echo "     启动命令: uvicorn backend.main:app --reload --port 8000"
  SKIP=$((SKIP+7))
else
  ok "后端可连接"

  # /api/status
  STATUS=$(curl -sf "$BASE/api/status")
  DB=$(echo "$STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('db_exists','?'))")
  if [ "$DB" = "True" ]; then ok "/api/status → db_exists=True"; else fail "/api/status db_exists=$DB"; fi

  # /api/strata
  STRATA=$(curl -sf "$BASE/api/strata" 2>&1)
  YEARS=$(echo "$STRATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('years',[])))" 2>/dev/null || echo "0")
  if [ "$YEARS" -gt 0 ]; then ok "/api/strata → $YEARS 年份"; else fail "/api/strata 无数据"; fi

  # /api/excavation/today
  EXC=$(curl -sf "$BASE/api/excavation/today?limit=5" 2>&1)
  TOTAL=$(echo "$EXC" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))" 2>/dev/null || echo "0")
  SRC=$(echo "$EXC" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('source','?'))" 2>/dev/null || echo "?")
  if [ "$TOTAL" -le 5 ] && [ "$TOTAL" -ge 0 ]; then
    ok "/api/excavation/today?limit=5 → total=$TOTAL source=$SRC"
  else
    fail "/api/excavation/today total=$TOTAL (期望 ≤5)"
  fi

  # /api/excavation/today limit=20
  EXC20=$(curl -sf "$BASE/api/excavation/today?limit=20" 2>&1)
  T20=$(echo "$EXC20" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))" 2>/dev/null || echo "0")
  if [ "$T20" -ge 1 ]; then ok "/api/excavation/today?limit=20 → $T20 张照片"; else fail "/api/excavation/today 无照片返回"; fi

  # /api/staging
  STAGING=$(curl -sf "$BASE/api/staging" 2>&1)
  STAG_OK=$(echo "$STAGING" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if 'total_count' in d else 'fail')" 2>/dev/null || echo "fail")
  if [ "$STAG_OK" = "ok" ]; then ok "/api/staging 结构正确"; else fail "/api/staging 响应异常"; fi

  # /api/trash
  TRASH=$(curl -sf "$BASE/api/trash" 2>&1)
  TRASH_OK=$(echo "$TRASH" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if 'total_count' in d else 'fail')" 2>/dev/null || echo "fail")
  if [ "$TRASH_OK" = "ok" ]; then ok "/api/trash 结构正确"; else fail "/api/trash 响应异常"; fi
fi

# ── 文件存在性检查 ────────────────────────────────────────────────────────
header "关键文件"

FILES=(
  "frontend/src/components/shared/ScrubReveal.tsx"
  "frontend/src/components/ExcavationView/index.tsx"
  "frontend/src/components/shared/MilestoneOverlay.tsx"
  "frontend/src/components/shared/StagingConfirmDialog.tsx"
  "backend/excavation.py"
  "backend/staging.py"
  "backend/story.py"
  "data/unearth.db"
)
for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then ok "$f"; else fail "$f 不存在"; fi
done

# ── 汇总 ──────────────────────────────────────────────────────────────────
echo
echo "══════════════════════════════════════════"
echo "  通过 $PASS  失败 $FAIL  跳过 $SKIP"
echo "══════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
