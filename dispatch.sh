#!/bin/bash
# dispatch.sh — 把 CODEX_DISPATCH.md 里的任务发给 Codex
# 用法：./dispatch.sh
#
# 工作流：
# 1. Claude 写好任务到 CODEX_DISPATCH.md
# 2. 你运行 ./dispatch.sh，脚本自动把任务喂给 codex exec
# 3. Codex 在当前终端执行，你只需要审批文件操作

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
DISPATCH_FILE="$PROJECT_ROOT/CODEX_DISPATCH.md"
CODEX_BIN="${CODEX_BIN:-/opt/homebrew/bin/codex}"

if [ ! -x "$CODEX_BIN" ]; then
  CODEX_BIN="$(command -v codex || true)"
fi

echo "════════════════════════════════════════"
echo "  显影 Unearth · Codex Dispatcher"
echo "════════════════════════════════════════"

if [ ! -f "$DISPATCH_FILE" ]; then
  echo "❌  CODEX_DISPATCH.md 不存在，还没有待分发的任务。"
  exit 1
fi

echo ""
echo "📋  即将发送以下任务给 Codex："
echo "────────────────────────────────────────"
cat "$DISPATCH_FILE"
echo "────────────────────────────────────────"
echo ""
read -p "确认发送？(y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "已取消。"
  exit 0
fi

echo ""
echo "🚀  启动 Codex..."
cd "$PROJECT_ROOT"
if [ -z "$CODEX_BIN" ] || [ ! -x "$CODEX_BIN" ]; then
  echo "❌  找不到 Codex CLI。请确认 codex 已安装，或设置 CODEX_BIN=/path/to/codex。"
  exit 1
fi
"$CODEX_BIN" exec < "$DISPATCH_FILE"

echo ""
echo "✅  Codex 任务完成。"
echo "    记得检查 backend/ 的改动，然后告诉 Claude 结果。"
