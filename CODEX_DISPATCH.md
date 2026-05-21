# Task E — 「带走的记忆」后端接口

## 背景

用户在「今日发掘」和「批量决策」中把照片标记为 keep，但目前没有任何接口可以查询所有已保留照片。
需要一个专用接口供前端渲染「带走的记忆」画廊视图。

---

## 任务

**修改文件**：`backend/main.py`（注册路由）
**新建文件**：`backend/kept.py`（查询逻辑）
**新建文件**：`backend/test_kept_api.py`（验收脚本）

---

### 接口：`GET /api/photos/kept`

**查询参数**：
- `limit` (int, default=50, max=200)
- `offset` (int, default=0)
- `year` (int, optional)：按年份过滤

**查询逻辑**：
```sql
-- 总数（不受 limit/offset 影响）
SELECT COUNT(*) FROM photos
WHERE decision = 'keep' AND status = 'active'

-- 分布（不受 year 过滤影响，始终全量）
SELECT year, COUNT(*) FROM photos
WHERE decision = 'keep' AND status = 'active'
GROUP BY year ORDER BY year DESC

-- 分页数据
SELECT <photo_columns> FROM photos
WHERE decision = 'keep' AND status = 'active'
  AND (:year IS NULL OR year = :year)
ORDER BY shot_at DESC
LIMIT :limit OFFSET :offset
```

**响应结构**：
```json
{
  "total_count": 42,
  "by_year": { "2023": 30, "2022": 12 },
  "photos": [
    {
      "id": "uuid",
      "file_path": "/Volumes/...",
      "file_name": "DSC00462.JPG",
      "file_type": "JPEG",
      "file_size_bytes": 8234567,
      "shot_at": "2023-05-21T14:30:00",
      "year": 2023,
      "month": 5,
      "gps_city": null,
      "gps_country": null,
      "camera_model": "ILCE-7M4",
      "decision": "keep",
      "is_book_candidate": false,
      "preview_ready": true,
      "event_id": "uuid",
      "has_xmp_sidecar": false,
      "paired_photo_id": null
    }
  ]
}
```

字段说明：
- `total_count`：满足 year 过滤的总数
- `by_year`：所有 kept 照片按年份的数量分布（不受 year 参数影响）
- `preview_ready`：`preview_path IS NOT NULL AND preview_path != ''` 时为 true

**约束**：
- 只返回 `status = 'active'` 的照片
- `decision = 'keep'`
- 如果没有 kept 照片，返回 `{"total_count": 0, "by_year": {}, "photos": []}` 不报错

---

## 验收脚本 `backend/test_kept_api.py`

用 `requests`，假设后端在 `localhost:8000`：
1. `GET /api/photos/kept` — 打印 total_count、by_year、前两张照片的 file_name 和 year
2. `GET /api/photos/kept?limit=3` — 确认返回不超过 3 张
3. `GET /api/photos/kept?year=2023` — 按年过滤，打印结果数量

---

## 完成后必须执行

1. 运行 `cd /Users/ricky/Downloads/照片整理工作流 && python3 backend/test_kept_api.py`
2. git 提交所有改动，commit message：
   ```
   Task E: 带走的记忆 API — GET /api/photos/kept

   - 支持 limit/offset 分页、year 过滤
   - 返回 total_count + by_year 分布供前端 tab 使用
   - 完整 Photo 字段与其他接口一致
   ```
3. 更新 `/Users/ricky/Downloads/照片整理工作流/AGENT_LOG/STATUS.md`：
   - 「最近完成」改为「Task E — 带走的记忆 API（commit xxxxx）」
   - 「下一步建议」第一条改为「前端接入 /api/photos/kept，实现 KeptView 画廊」
