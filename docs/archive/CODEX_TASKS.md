# CODEX_TASKS.md — 待 Codex 处理的后端任务

---

## ✅ 🚨 Task 4：新扫描会清空整个数据库（**严重数据丢失**）

**优先级：** 紧急 — 阻塞多 root 累加场景，会丢失之前的全部决策记录

### 现象
本次测试中：
1. 系统状态：50 张照片（2023-05 月份）、4 个事件、14 条 staging_files 记录
2. 执行 `POST /api/scan {"root_path": "/tmp/test_photos"}`
3. 扫描完成后：
   - `photos` 表：50 → 5（只剩 /tmp 的 5 张）
   - `events` 表：4 → 1
   - `staging_files` 表：14 → 0
   - 整个 Lexar 数据库记录被清空

### 根因（疑似）
`scan_root` 切换 root_path 时清空了 photos/events/staging_files 表，或者 `init_db` 在某条件下 DROP+CREATE 重建 schema。具体定位需要看 `database.py:init_db` 和 `scanner.py:scan_root`。

### 期望行为
后端应支持**多 root 累加**：
- 同一 root 重复扫描：增量更新（用 file_path UNIQUE 约束去重）
- 不同 root：累加（不同 root_path 的 photo 共存）
- 永远不要清空已有数据，除非显式调用一个 "reset" 接口

### 实测影响
- 用户在 2023-05 月份上做的 50 张决策（34 keep / 11 leave / 5 skip）的数据库记录**完全丢失**
- 物理文件未损失（源目录 39 张 + staging 11 张 = 50 张完好）
- 用户需要从零开始重新扫描 + 重新决策（或者放弃 staging 里的 11 张直接重新扫剩余 39 张）

---

## ✅ 🟡 Task 5：`/api/staging/confirm` 应该按 root_path 过滤

**优先级：** 中（潜在数据丢失风险）

### 问题
`confirm_staging` 当前查询：
```sql
SELECT * FROM staging_files
WHERE restored_at IS NULL AND confirmed_deleted_at IS NULL
```
不区分 root_path，一次性删除所有 root 的 staging 文件。

### 风险场景
用户先扫描硬盘 A 做了几次 leave，再扫描硬盘 B 也 leave 了一些，最后只想清空 B 的 staging。当前实现会把 A 的也一起删掉。

### 期望修复
1. 接受可选参数 `root_path`，只清理该 root 的 staging
2. 或者在 UI 上明确显示"将删除 N 个文件，跨 X 个根目录"
3. 配合 Task 4 修复后，"按当前选中 root 过滤"是合理默认

---

## ✅ 🟡 Task 3：`/api/events/{id}/photos` 返回的 Photo 缺 7 个字段（继承）

**优先级：** 中

`/api/events/{event_id}/photos` 缺：`file_path`、`year`、`month`、`gps_lat`、`gps_lng`、`camera_model`、`event_id`

修复位置：`backend/queries.py` 第 112 行附近的 SQL 补齐 SELECT。

---

## ✅ 🟡 Task 6：新增 `GET /api/photos/day-count` 接口

**优先级：** 低（前端已有 fallback，接口不存在时静默跳过）

### 需求

前端「记忆上下文层」需要知道某一天总共拍了多少张照片（跨所有事件）。

### 接口规范

```
GET /api/photos/day-count?date=YYYY-MM-DD
```

**返回：**
```json
{ "date": "2023-05-01", "count": 34 }
```

**SQL（参考）：**
```sql
SELECT COUNT(*) AS count
FROM photos
WHERE DATE(shot_at) = ?
```

### 位置建议

`backend/queries.py` 新增 `day_photo_count(conn, date: str) -> dict`，在 `backend/main.py` 注册路由 `GET /api/photos/day-count`。

### 注意

- `date` 参数格式为 `YYYY-MM-DD`，若缺失或格式错误返回 400
- 前端已有缓存（`dayCountCache` Map），同一天只请求一次

---

## ✅ 已修复（无需处理）

- ~~Task 1：Keep/Skip 决策遇到 staged 照片应该还原文件~~ ✅ Codex 已修（audit log 16:29 显示 staging_restore 触发，新增 pytest `test_keep_restores_staged_file`）
- ~~Task 2：3 张 ghost staged 文件状态错乱~~ ✅ Codex 已自动还原（DSC00462、DSCF9864、DSCF9861-2 已从 staging 移回原目录）
- ~~SSE `/api/scan/progress` 无限循环~~
- ~~`POST /api/scan` 对无效路径静默成功~~
- ~~`GET /api/staging` 返回空 staging_path~~
- ~~Event clustering 未生成 events~~
