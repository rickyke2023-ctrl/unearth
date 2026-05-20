# API.md · 显影 Unearth
### 前后端接口约定 — 开工前必读，改动需双方确认

---

## 基础约定

- **Base URL：** `http://localhost:8000`
- **数据格式：** 所有请求和响应均为 JSON
- **时间格式：** ISO 8601，例：`"2021-11-03T14:32:00Z"`
- **错误格式：** `{ "error": "描述信息", "code": "ERROR_CODE" }`
- **图片预览 URL 格式：** `http://localhost:8000/preview/{photo_id}`

---

## 数据结构定义

### Photo（照片）
```json
{
  "id": "uuid-string",
  "file_path": "/Volumes/HDD/2021/11/DSC_0001.ARW",
  "file_name": "DSC_0001.ARW",
  "file_type": "RAW_SONY",
  "file_size_bytes": 48234567,
  "shot_at": "2021-11-03T14:32:00Z",
  "year": 2021,
  "month": 11,
  "gps_lat": 51.5074,
  "gps_lng": -0.1278,
  "gps_city": "London",
  "gps_country": "United Kingdom",
  "camera_model": "ILCE-7M4",
  "paired_photo_id": "uuid-of-jpeg-pair",
  "has_xmp_sidecar": true,
  "decision": "keep",
  "is_book_candidate": false,
  "event_id": "uuid-string",
  "preview_ready": true
}
```

**file_type 枚举值：**
- `RAW_SONY`（.ARW）
- `RAW_FUJI`（.RAF）
- `JPEG`
- `HEIF`
- `HEIC`
- `PNG`

**decision 枚举值：**
- `null`（未决定）
- `"keep"`（带走）
- `"leave"`（留在这里）
- `"skip"`（稍后决定）

---

### Event（拍摄事件）
```json
{
  "id": "uuid-string",
  "year": 2021,
  "month": 11,
  "started_at": "2021-11-03T09:00:00Z",
  "ended_at": "2021-11-03T17:45:00Z",
  "photo_count": 47,
  "decided_count": 12,
  "cover_photo_id": "uuid-string",
  "primary_location": "London, United Kingdom",
  "status": "in_progress"
}
```

**status 枚举值：** `"pending"` / `"in_progress"` / `"completed"`

---

### MonthSummary（月份摘要）
```json
{
  "year": 2021,
  "month": 11,
  "photo_count": 847,
  "event_count": 12,
  "decided_count": 203,
  "kept_count": 156,
  "left_count": 47,
  "size_bytes": 42000000000,
  "freed_bytes": 5200000000,
  "status": "in_progress",
  "primary_locations": ["London", "Oxford"],
  "strata_color": "#D4956A"
}
```

---

## 接口列表

---

### 一、系统初始化

#### `GET /api/status`
检查系统状态，前端启动时首先调用。

**响应：**
```json
{
  "status": "ready",
  "db_exists": true,
  "total_photos": 43218,
  "total_size_bytes": 921000000000,
  "scan_completed": true,
  "last_scan_at": "2024-01-15T10:30:00Z"
}
```

---

#### `POST /api/scan`
启动扫描任务。扫描是异步的，调用后立即返回 task_id，前端通过 SSE 监听进度。

**请求 Body：**
```json
{
  "root_path": "/Volumes/MyHDD/Photos"
}
```

**响应：**
```json
{
  "task_id": "scan-uuid",
  "status": "started"
}
```

---

#### `GET /api/scan/progress`
SSE（Server-Sent Events）流，实时推送扫描进度。前端使用 `EventSource` 连接。

**推送格式（每条）：**
```json
{
  "scanned": 12453,
  "total_estimated": 43000,
  "current_file": "2021/11/DSC_0047.ARW",
  "phase": "indexing"
}
```

**phase 枚举值：** `"indexing"` / `"pairing"` / `"clustering"` / `"done"`

---

### 二、地层数据（主界面）

#### `GET /api/strata`
获取所有年份和月份的摘要数据，用于渲染地层全景界面。

**响应：**
```json
{
  "years": [
    {
      "year": 2021,
      "total_photos": 8432,
      "total_size_bytes": 180000000000,
      "decided_count": 203,
      "months": [
        {
          "year": 2021,
          "month": 11,
          "photo_count": 847,
          "event_count": 12,
          "decided_count": 203,
          "kept_count": 156,
          "left_count": 47,
          "size_bytes": 42000000000,
          "freed_bytes": 5200000000,
          "status": "in_progress",
          "primary_locations": ["London", "Oxford"],
          "strata_color": "#D4956A"
        }
      ]
    }
  ],
  "global_stats": {
    "total_photos": 43218,
    "total_size_bytes": 921000000000,
    "decided_count": 1203,
    "kept_count": 987,
    "left_count": 216,
    "freed_bytes": 12000000000,
    "book_candidates_count": 43
  }
}
```

---

### 三、考古现场（章节视图）

#### `GET /api/events?year={year}&month={month}`
获取某月所有拍摄事件，用于渲染考古现场界面。

**响应：**
```json
{
  "year": 2021,
  "month": 11,
  "events": [
    {
      "id": "event-uuid",
      "year": 2021,
      "month": 11,
      "started_at": "2021-11-03T09:00:00Z",
      "ended_at": "2021-11-03T17:45:00Z",
      "photo_count": 47,
      "decided_count": 12,
      "cover_photo_id": "photo-uuid",
      "primary_location": "London, United Kingdom",
      "status": "in_progress"
    }
  ]
}
```

---

### 四、决策界面（核心交互）

#### `GET /api/events/{event_id}/photos`
获取某个拍摄事件内所有照片，包含配对信息。

**响应：**
```json
{
  "event_id": "event-uuid",
  "photos": [
    {
      "id": "photo-uuid",
      "file_name": "DSC_0001.ARW",
      "file_type": "RAW_SONY",
      "file_size_bytes": 48234567,
      "shot_at": "2021-11-03T14:32:00Z",
      "gps_city": "London",
      "gps_country": "United Kingdom",
      "paired_photo_id": "jpeg-uuid",
      "has_xmp_sidecar": true,
      "decision": null,
      "is_book_candidate": false,
      "preview_ready": true
    }
  ],
  "total": 47,
  "decided": 12
}
```

---

#### `GET /preview/{photo_id}`
获取照片预览图（压缩版，最大 1200px 长边）。

**响应：** 直接返回 JPEG 图片二进制流（`Content-Type: image/jpeg`）

**说明：** 如果预览图尚未生成，返回 202 Accepted，前端可轮询重试。

---

#### `POST /api/decisions`
提交一个或多个决策。批量提交以减少请求次数。

**请求 Body：**
```json
{
  "decisions": [
    {
      "photo_id": "photo-uuid",
      "decision": "keep",
      "is_book_candidate": false
    },
    {
      "photo_id": "another-uuid",
      "decision": "leave",
      "is_book_candidate": false
    }
  ]
}
```

**响应：**
```json
{
  "processed": 2,
  "staging_added": 1,
  "freed_bytes_preview": 48234567
}
```

**后端行为：**
- `"keep"` → 仅更新数据库状态
- `"leave"` → 执行文件移动到 staging，遵循 RAW/JPEG 配对规则
- `"skip"` → 仅更新数据库状态，不移动文件

---

#### `POST /api/decisions/undo`
撤销最近一次决策（支持多步撤销）。

**请求 Body：**
```json
{
  "photo_id": "photo-uuid"
}
```

**响应：**
```json
{
  "success": true,
  "previous_decision": "leave",
  "restored_file": true
}
```

---

#### `POST /api/book-candidates/{photo_id}`
切换某张照片的「书候选」状态（toggle）。

**响应：**
```json
{
  "photo_id": "photo-uuid",
  "is_book_candidate": true
}
```

---

### 五、Staging 管理（软删除）

#### `GET /api/staging`
查看当前 staging 文件夹的内容。

**响应：**
```json
{
  "staging_path": "/Volumes/MyHDD/_unearth_staging",
  "files": [
    {
      "photo_id": "photo-uuid",
      "file_name": "DSC_0001.ARW",
      "file_size_bytes": 48234567,
      "left_at": "2024-01-15T14:32:00Z"
    }
  ],
  "total_count": 216,
  "total_size_bytes": 12000000000
}
```

---

#### `POST /api/staging/confirm`
确认清空 staging，永久释放空间。**不可逆操作。**

**请求 Body：**
```json
{
  "confirm": true
}
```

**响应：**
```json
{
  "deleted_count": 216,
  "freed_bytes": 12000000000
}
```

---

#### `POST /api/staging/restore/{photo_id}`
从 staging 取回某张照片（反悔）。

**响应：**
```json
{
  "success": true,
  "photo_id": "photo-uuid",
  "restored_path": "/Volumes/MyHDD/2021/11/DSC_0001.ARW"
}
```

---

### 六、书候选导出

#### `GET /api/book-candidates`
获取所有书候选照片列表。

**响应：**
```json
{
  "total": 43,
  "candidates": [
    {
      "id": "photo-uuid",
      "file_path": "/Volumes/MyHDD/2021/11/DSC_0001.JPG",
      "file_name": "DSC_0001.JPG",
      "shot_at": "2021-11-03T14:32:00Z",
      "gps_city": "London",
      "gps_country": "United Kingdom"
    }
  ]
}
```

---

#### `GET /api/book-candidates/export?format={format}`
导出书候选清单文件。

**format 参数：** `"json"` / `"csv"`

**响应：** 文件下载（`Content-Disposition: attachment`）

---

### 七、AI 人生摘要

#### `POST /api/summary/generate`
触发 AI 人生摘要生成。异步任务，通过 SSE 流式返回文字。

**响应（SSE 流）：**
```
data: {"chunk": "在你保留下来的记忆里，"}
data: {"chunk": "英国的冬天占据了最多的篇幅——"}
data: {"chunk": "不是因为那里最美，"}
data: {"done": true, "full_text": "完整文本..."}
```

---

## 错误码

| code | 含义 |
|---|---|
| `DISK_NOT_MOUNTED` | 外置硬盘未挂载 |
| `SCAN_NOT_COMPLETED` | 索引尚未完成 |
| `PHOTO_NOT_FOUND` | photo_id 不存在 |
| `PREVIEW_NOT_READY` | 预览图生成中 |
| `STAGING_ERROR` | 文件移动到 staging 失败 |
| `INVALID_DECISION` | decision 值不合法 |
| `API_KEY_MISSING` | Claude API Key 未配置 |
