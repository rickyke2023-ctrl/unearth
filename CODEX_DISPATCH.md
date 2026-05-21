# Task D — 今日发掘后端 API

## 背景

新增「今日发掘」模式：每天最多从相册里挖出 20 张照片，用户用鼠标/触摸拨开表土来显现它们。
前端需要一个专用接口，返回今天日期在历史上对应的**未决策**照片，让用户做 keep/leave。

---

## 任务

**新建文件**：`backend/excavation.py`
**修改文件**：`backend/main.py`（注册路由）
**新建文件**：`backend/test_excavation_api.py`（验收脚本）

---

### 接口：`GET /api/excavation/today`

**查询参数**：
- `limit` (int, default=20, max=20)：最多返回几张
- `date` (str, optional)：指定日期 `YYYY-MM-DD`，默认今天（UTC+8）

**查询逻辑（优先级从高到低）**：

1. **同日跨年**（优先）：找所有 `strftime('%m-%d', shot_at) = '05-21'`（当天月日），且 `decision IS NULL`，`status = 'active'`，`preview_ready = 1` 的照片。按年份升序，每年最多取 `limit // 年份数量 + 1` 张（均匀分布），总数不超过 limit。

2. **如果同日跨年结果 < 5 张**：用「最近未决策照片」补足到 limit 张。查询条件：`decision IS NULL AND status = 'active' AND preview_ready = 1`，按 `shot_at DESC`，跳过已在结果里的 photo_id。

**响应结构**：
```json
{
  "date_label": "5月21日",
  "source": "cross_year",
  "photos": [
    {
      "id": "uuid",
      "file_path": "/Volumes/...",
      "file_name": "DSC00462.JPG",
      "file_type": "JPEG",
      "file_size_bytes": 8234567,
      "shot_at": "2023-05-21T14:30:00Z",
      "year": 2023,
      "gps_city": null,
      "gps_country": null,
      "camera_model": "ILCE-7M4",
      "decision": null,
      "is_book_candidate": false,
      "preview_ready": true,
      "event_id": "uuid"
    }
  ],
  "total": 12,
  "cross_year_count": 12,
  "supplemented": false
}
```

字段说明：
- `source`：`"cross_year"` 或 `"supplemented"`
- `cross_year_count`：纯同日跨年的数量
- `supplemented`：是否用了「最近未决策」补足

**约束**：
- 只返回 `status = 'active'` 且 `preview_ready = 1` 的照片（没有预览图的不显示）
- `decision IS NULL`（只返回未决策的）
- 不返回 staged / deleted / trash 状态的照片
- 如果今天完全没有符合条件的照片（极端情况），返回 `{"total": 0, "photos": [], ...}`，不报错

---

## 验收脚本 `backend/test_excavation_api.py`

用 `requests`，假设后端在 `localhost:8000`：
1. `GET /api/excavation/today` — 打印 total、source、第一张照片的 file_name 和 year
2. `GET /api/excavation/today?limit=5` — 确认返回不超过 5 张
3. `GET /api/excavation/today?date=2023-05-01` — 指定历史日期，打印结果

---

## 完成后必须执行

1. 运行 `cd /Users/ricky/Downloads/照片整理工作流 && python3 backend/test_excavation_api.py`
2. git 提交所有改动，commit message：
   ```
   Task D: 今日发掘 API — GET /api/excavation/today

   - 同日跨年照片（decision IS NULL，preview_ready）
   - < 5张时自动补足最近未决策照片
   - 返回完整 Photo 字段供前端直接使用
   ```
3. 更新 `/Users/ricky/Downloads/照片整理工作流/AGENT_LOG/STATUS.md`：
   - 「最近完成」改为「Task D — 今日发掘 API（commit xxxxx）」
   - 「下一步建议」第一条改为「前端接入 /api/excavation/today（替换 story/today 临时方案）」
