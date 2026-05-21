#!/bin/bash
# backup_db.sh — 把 unearth.db 同步到 iCloud Drive
# 用法：手动运行 ./backup_db.sh，或让后端启动时自动调用

DB_SRC="/Users/ricky/Downloads/照片整理工作流/data/unearth.db"
BACKUP_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/unearth-backup"
BACKUP_DEST="$BACKUP_DIR/unearth.db"
TIMESTAMP_DEST="$BACKUP_DIR/unearth_$(date +%Y%m%d_%H%M).db"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_SRC" ]; then
  echo "❌ 数据库不存在：$DB_SRC"
  exit 1
fi

# 复制主备份（覆盖）
cp "$DB_SRC" "$BACKUP_DEST"

# 每天保留一个带时间戳的版本（不重复创建）
DAILY="$BACKUP_DIR/unearth_$(date +%Y%m%d).db"
if [ ! -f "$DAILY" ]; then
  cp "$DB_SRC" "$DAILY"
  echo "✓ 每日快照：$DAILY"
fi

# 清理超过 7 天的快照
find "$BACKUP_DIR" -name "unearth_*.db" -mtime +7 -delete 2>/dev/null

echo "✅ 备份完成 → iCloud/unearth-backup/unearth.db"
echo "   数据库大小：$(du -sh "$DB_SRC" | cut -f1)"
