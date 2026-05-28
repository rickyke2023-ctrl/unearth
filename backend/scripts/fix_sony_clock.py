"""
修复 Sony 相机时钟错误导致的 shot_at 年份异常。

背景：
  部分 Sony 相机（DSC / ARW 文件）内置时钟未校准，拍摄时 EXIF 日期
  被记录成错误年份（如 2018），但文件实际存放在正确年份的文件夹下
  （如 /Lightroom file/2025/2025-02-06/）。

修复策略：
  从 file_path 中提取文件夹日期（格式 /YYYY/YYYY-MM-DD/），
  用文件夹日期替换 shot_at 的日期部分，时间（HH:MM:SS）和时区保留不变。
  同步更新 year / month 字段。

幂等性：
  脚本检查 --year 参数指定的异常年份，若已无对应记录则直接退出，
  可安全重复运行。
"""

from __future__ import annotations

import argparse
import re
import sys

from backend.database import get_connection

FOLDER_DATE_PATTERN = re.compile(r"/(\d{4})/(\d{4}-\d{2}-\d{2})/")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--year",
        type=int,
        default=2018,
        help="要修复的异常 EXIF 年份（默认 2018）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只预览，不写入数据库",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        "SELECT id, file_path, shot_at FROM photos WHERE year = ?",
        (args.year,),
    )
    rows = cur.fetchall()

    if not rows:
        print(f"year={args.year} 的记录为 0，无需修复。")
        return 0

    updates, unmatched = [], []

    for row in rows:
        m = FOLDER_DATE_PATTERN.search(row["file_path"])
        if m:
            folder_year = int(m.group(1))
            folder_date = m.group(2)
            folder_month = int(folder_date.split("-")[1])
            # 保留原始时间和时区后缀，只替换日期前缀（前10个字符）
            new_shot_at = folder_date + row["shot_at"][10:]
            updates.append((new_shot_at, folder_year, folder_month, row["id"]))
        else:
            unmatched.append(row["file_path"])

    print(f"year={args.year} 共 {len(rows)} 条")
    print(f"  可修复（文件夹日期匹配）：{len(updates)}")
    print(f"  无法匹配（路径不含 YYYY/YYYY-MM-DD）：{len(unmatched)}")

    if unmatched:
        print("无法匹配的路径（前5条）：")
        for p in unmatched[:5]:
            print(f"  {p}")

    if not updates:
        return 0

    # 预览前5条
    print("\n示例修正（前5条）：")
    for new_shot_at, y, mo, pid in updates[:5]:
        orig = next(r["shot_at"] for r in rows if r["id"] == pid)
        print(f"  {orig}  →  {new_shot_at}  (year={y}, month={mo})")

    if args.dry_run:
        print("\n[dry-run] 未写入数据库。")
        return 0

    cur.executemany(
        "UPDATE photos SET shot_at = ?, year = ?, month = ? WHERE id = ?",
        updates,
    )
    conn.commit()
    print(f"\n已更新 {len(updates)} 条记录。")

    # 验证
    cur.execute("SELECT COUNT(*) as cnt FROM photos WHERE year = ?", (args.year,))
    remaining = cur.fetchone()["cnt"]
    print(f"year={args.year} 剩余：{remaining} 条")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
