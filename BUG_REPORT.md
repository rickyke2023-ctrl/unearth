# 显影 Unearth — 问题诊断报告
> 生成时间：2026-05-19  
> 诊断方：Claude Code（前端负责方）  
> 诊断范围：后端 API 行为 + 前端代码质量

---

## 系统状态（诊断时）

| 项目 | 状态 |
|---|---|
| 后端 `localhost:8000` | ✅ 运行中（Python uvicorn） |
| 前端 `localhost:5173` | ✅ 运行中（Vite dev server） |
| 前端 → 后端代理 | ✅ 正常（`/api/*` → `localhost:8000`） |
| 数据库 `data/unearth.db` | ✅ 存在，`scan_completed = false` |
| `data/audit.jsonl` | ✅ 有测试写入记录（来自 pytest） |

---

## 接口测试结果

### `GET /api/status`
```json
{
    "status": "ready",
    "db_exists": true,
    "total_photos": 0,
    "total_size_bytes": 0,
    "scan_completed": false,
    "last_scan_at": null
}
```
**结论：** 响应结构符合 API.md 约定，功能正常。

---

### `GET /api/strata`
```json
{
    "years": [],
    "global_stats": {
        "total_photos": 0,
        "total_size_bytes": 0,
        "decided_count": 0,
        "kept_count": 0,
        "left_count": 0,
        "freed_bytes": 0,
        "book_candidates_count": 0
    }
}
```
**结论：** 结构符合 API.md，数据为空是预期行为（未扫描）。

---

### `GET /api/staging`
```json
{
    "staging_path": "",
    "files": [],
    "total_count": 0,
    "total_size_bytes": 0
}
```
**结论：** ⚠️ `staging_path` 返回空字符串，不符合 API.md 约定（见问题 4）。

---

### `GET /api/scan/progress`（SSE）
```
data: {"scanned": 0, "total_estimated": 0, "current_file": null, "phase": "indexing"}
data: {"scanned": 0, "total_estimated": 0, "current_file": null, "phase": "indexing"}
data: {"scanned": 0, "total_estimated": 0, "current_file": null, "phase": "indexing"}
... （无限循环，连接不关闭）
```
**结论：** 🔴 严重问题，见问题 1 & 2。

---

## 问题清单

---

### 🔴 问题 1：`GET /api/scan/progress` SSE 流永不终止

**优先级：** 高  
**归属：** 后端

#### 现象
`GET /api/scan/progress` 的 SSE 流持续输出 `"phase": "indexing"`，永远不输出 `"phase": "done"`，HTTP 连接不关闭。

#### 根因
`scan_root()` 在检测到路径不存在时（`backend/scanner.py` 第 143–144 行），在 `progress_store.update(phase="done")` 之前直接 `raise DiskNotMountedError`：

```python
# scanner.py 第 143-144 行
if not root.exists() or not root.is_dir():
    raise DiskNotMountedError(f"照片根目录不可用：{root}")

# 第 220 行（永远到不了这里）
progress_store.update(scanned=total, ..., phase="done")
```

该函数通过 FastAPI 的 `BackgroundTasks` 调用，**后台任务抛出的异常会被 FastAPI 静默吞掉**，不会影响 HTTP 响应，也不会触发任何 cleanup。

结果：`progress_store.current.phase` 永远停在 `"indexing"`，而 SSE 流的终止条件是 `phase == "done"` ——所以流永不终止。

#### 影响
- 前端 `subscribeScanProgress` 的 `onDone` 回调永远不触发
- 用户界面卡死在扫描进度界面，无法进入地层视图
- 这是一个会**100% 复现**的 bug，只要用户输入了一个无效路径（或硬盘未挂载）

#### 建议修复方向
在 `scan_root` 里用 `try/finally` 保证 `progress_store` 最终进入终态：

```python
def scan_root(conn, root_path: str):
    try:
        root = Path(root_path).expanduser().resolve()
        if not root.exists() or not root.is_dir():
            raise DiskNotMountedError(f"照片根目录不可用：{root}")
        # ... 正常扫描逻辑 ...
    except Exception:
        progress_store.update(phase="done")  # 保证 SSE 能终止
        raise
```

---

### 🔴 问题 2：当前后端 progress_store 状态已损坏（需重启）

**优先级：** 高（阻塞开发调试）  
**归属：** 运维操作

#### 现象
诊断过程中对无效路径发送了两次 `POST /api/scan`，触发了问题 1，导致当前运行的后端进程中 `progress_store.current.phase` 卡在 `"indexing"`。

现在即使不触发任何扫描，`GET /api/scan/progress` 也立即开始输出无限的 `"indexing"` 流。

#### 影响
在重启前，前端任何进入扫描流程的操作都会卡死。

#### 解决方法
重启后端进程即可恢复：
```bash
# 找到 uvicorn 进程并重启
kill $(pgrep -f uvicorn) && cd /path/to/project && python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

---

### 🟡 问题 3：`POST /api/scan` 对无效路径静默返回成功

**优先级：** 中  
**归属：** 后端

#### 现象
传入不存在的路径时，`POST /api/scan` 依然返回 HTTP 200：
```json
{"task_id": "scan-xxxx", "status": "started"}
```

实际上后台任务已经失败（路径不存在），但前端无法感知。

#### 根因
路径有效性检查在 `scan_root()` 内部（后台任务里），`POST /api/scan` 端点本身不做任何预检就直接 `add_task` 并返回。

```python
# main.py
@app.post("/api/scan")
def api_scan(payload: ScanRequest, background_tasks: BackgroundTasks, conn=Depends(db)):
    task_id = progress_store.start()
    background_tasks.add_task(scan_root, conn, payload.root_path)  # 不预检路径
    return {"task_id": task_id, "status": "started"}  # 始终成功
```

#### 影响
- 前端无法立即给用户「路径不存在」的错误反馈
- 结合问题 1，会造成 UI 卡死而不显示任何错误信息

#### 建议修复方向
在 `POST /api/scan` 端点内同步检查路径是否可访问，如不可用立即返回 400：
```python
@app.post("/api/scan")
def api_scan(payload: ScanRequest, background_tasks: BackgroundTasks, conn=Depends(db)):
    root = Path(payload.root_path).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise DiskNotMountedError(f"照片根目录不可用：{root}")
    task_id = progress_store.start()
    background_tasks.add_task(scan_root, conn, payload.root_path)
    return {"task_id": task_id, "status": "started"}
```

---

### 🟢 问题 4：`GET /api/staging` 返回空 staging_path

**优先级：** 低  
**归属：** 后端

#### 现象
未完成扫描时，`GET /api/staging` 返回：
```json
{"staging_path": "", ...}
```

API.md 约定应返回实际 staging 路径（如 `/Volumes/MyHDD/_unearth_staging`）。

#### 影响
`StagingConfirmDialog` 界面上路径显示为空。功能影响极小（staging 为空时该弹窗不会弹出），但不符合接口契约。

---

### 🟢 问题 5：前端 DecisionView 直接调用 `useAppStore.setState`

**优先级：** 低（代码质量）  
**归属：** 前端

#### 位置
`frontend/src/components/DecisionView/index.tsx` 第 357 行

#### 代码
```tsx
onSelect={(i) => useAppStore.getState().currentPhotoIndex !== i && useAppStore.setState({ currentPhotoIndex: i })}
```

#### 问题
1. 直接调用 Zustand 底层 `setState`，绕过了 store 中已定义的 action 封装
2. 使用 `&&` 短路写法产生副作用，可读性差
3. 应改为调用已定义的 store action 或内联直接 `set({ currentPhotoIndex: i })`

#### 修复方式（前端自行修复）
在 `appStore.ts` 中补充一个 action，或直接重写这行：
```tsx
onSelect={(i) => { if (useAppStore.getState().currentPhotoIndex !== i) useAppStore.setState({ currentPhotoIndex: i }) }}
```

---

## 总结

| # | 优先级 | 接口/位置 | 问题描述 | 归属 | 是否阻塞MVP |
|---|---|---|---|---|---|
| 1 | 🔴 高 | `GET /api/scan/progress` | SSE 流在扫描出错时永不终止，UI 卡死 | 后端 | ✅ 是 |
| 2 | 🔴 高 | 运行中后端进程 | progress_store 状态损坏，需重启恢复 | 运维 | ✅ 是 |
| 3 | 🟡 中 | `POST /api/scan` | 无效路径静默返回成功，前端无法感知错误 | 后端 | 部分阻塞 |
| 4 | 🟢 低 | `GET /api/staging` | staging_path 返回空字符串 | 后端 | ❌ 否 |
| 5 | 🟢 低 | `DecisionView/index.tsx:357` | 直接调用 useAppStore.setState | 前端 | ❌ 否 |

**立即需要做的事：**
1. 后端修复问题 1（`try/finally` 保证 progress_store 进入终态）
2. 重启后端进程恢复当前损坏状态（问题 2）
3. 可选：同步修复问题 3，提升用户体验
