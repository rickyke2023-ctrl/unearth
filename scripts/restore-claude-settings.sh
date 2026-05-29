#!/usr/bin/env bash
# restore-claude-settings.sh
# 重建 .claude/settings.json，隔离 CC Switch 的 DeepSeek 全局配置
# 任何时候 settings.json 丢失或损坏，运行这个脚本即可恢复
#
# 背景：CC Switch 把 DeepSeek 凭证写入全局 ~/.claude/settings.json
# 项目级 .claude/settings.json 把关键 env 覆盖回 Anthropic，
# 确保 WebSearch 等内置工具正常使用 Claude 而非 DeepSeek。

set -e

SETTINGS_FILE="$(dirname "$0")/../.claude/settings.json"
mkdir -p "$(dirname "$SETTINGS_FILE")"

cat > "$SETTINGS_FILE" <<'EOF'
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
    "ANTHROPIC_MODEL": "claude-sonnet-4-5",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-5",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-5",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5",
    "ANTHROPIC_AUTH_TOKEN": "",
    "ANTHROPIC_API_KEY": ""
  }
}
EOF

echo "✅ .claude/settings.json 已恢复"
echo "   重开一个 Claude Code session 后生效"
