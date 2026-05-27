# PROJECT_MEMORY.md · 显影 Unearth
### 记忆胶囊 — 每次新开会话，先读这个文件

> 如果你是 Claude Code 或 Codex，请在开始任何工作之前完整读完此文件。
> 然后读 SPEC.md 和 API.md。不要跳过。

---

## 这个项目是什么

**名称：** 显影 Unearth — *A Memory Excavation*

**一句话描述：**
一个本地运行的照片整理工具，帮助用户从 4-5 年、约 4 万张照片中，选择带走什么记忆。

**核心哲学：**
不是「删除」，是「留在这里」。不是「保存」，是「带走」。
整理照片是一次记忆的考古，不是文件清理。

**最终用途：**
整理后的照片将用于摄影书或线上策展。

---

## 用户现实情况

| 项目 | 详情 |
|---|---|
| 照片数量 | ~40,000 张 |
| 总体积 | ~900 GB |
| 存储位置 | 外置硬盘（Mac USB 挂载） |
| 文件夹结构 | 按 `年/月/` 组织（Lightroom 导出结构） |
| RAW 格式 | 索尼 `.ARW`、富士 `.RAF` |
| 非RAW 格式 | `.JPG/.JPEG`、`.HEIF`、`.HEIC`、`.PNG` |
| Sidecar 文件 | Lightroom XMP/XML（与照片同名，不同后缀） |
| GPS 数据 | 约 70-80% 照片含 GPS 信息 |
| 相机 | 索尼 + 富士双机身 |
| 拍摄地点 | 中国、英国、欧洲多国 |
| 目标 | 删除约 1/3 文件，整理剩余，最终策展或摄影书 |

---

## 硬性约束（绝对不能违反）

```
🔴 绝对不能直接删除原始文件
   所有「留在这里」操作 = 移动到 staging 文件夹，等用户确认后才真正删除

🔴 原始文件目录只读
   后端只能读取硬盘上的原始文件，不能在原目录写入或修改任何东西
   唯一的写操作目标：staging 文件夹 + data/ 目录

🔴 XMP sidecar 必须跟随主文件
   删除或移动任何照片文件时，必须同步处理对应的 XMP/XML sidecar 文件

🔴 RAW/JPEG 配对逻辑不能错
   见下方「删除逻辑」章节，这是用户最关心的核心逻辑之一
```

---

## 删除逻辑（核心规则）

```
用户选择「留在这里」时：

情况 A：RAW + JPEG 配对存在
  → 移动 RAW 文件到 staging（索尼 .ARW 或富士 .RAF）
  → 保留 JPEG 文件（不动）
  → 同步移动对应 XMP sidecar（如有）

情况 B：仅有非RAW 文件（JPEG / HEIF / HEIC / PNG）
  → 移动该文件到 staging
  → 同步移动对应 XMP sidecar（如有）

情况 C：仅有 RAW 文件，无 JPEG 配对
  → 移动 RAW 文件到 staging
  → 同步移动对应 XMP sidecar（如有）

Staging 文件夹路径：{硬盘根目录}/_unearth_staging/
用户在会话结束时手动确认清空，不自动永久删除。
```

---

## Stop Conditions（遇到这些情况立即停止）

```
🛑 外置硬盘未挂载或中途断开
   → 停止所有文件操作，保存当前状态到数据库，提示用户重新挂载

🛑 文件移动操作失败（staging 写入失败）
   → 不更新数据库状态，回滚，记录错误到 audit log，提示用户

🛑 数据库损坏或无法写入
   → 停止所有决策操作，不继续处理任何文件

🛑 Staging 文件夹体积超过 200GB
   → 提醒用户先确认清空 staging，再继续

🛑 单次会话处理文件数超过 5000 张未保存
   → 强制保存检查点
```

---

## MVP 定义（当前目标）

以下全部满足，才算 MVP 跑通，才可以开始加功能：

- [ ] 后端成功扫描外置硬盘，建立 SQLite 索引（不崩溃，不漏文件）
- [ ] 前端地层界面能渲染出用户的年份/月份结构
- [ ] 点击进入某个月，能看到拍摄事件列表
- [ ] 决策界面：能显示照片预览（RAW 和 JPEG 均可）
- [ ] 键盘操作「带走（K）」和「留在这里（D）」正确触发后端逻辑
- [ ] RAW/JPEG 配对逻辑正确执行（有自动化测试或手动验证截图）
- [ ] 软删除：文件正确移动到 staging，原目录文件消失
- [ ] 撤销（Z）：文件从 staging 返回原位
- [ ] 关闭 APP 重新打开，进度不丢失

**MVP 不需要：** AI 摘要、书候选导出、GPS 地图、动画效果（可以是占位动画）

---

## 项目文件结构

```
xianying/
├── PROJECT_MEMORY.md    ← 本文件，每次开工先读
├── SPEC.md              ← 完整功能规格和视觉语言
├── API.md               ← 前后端接口约定（最重要的契约）
├── frontend/            ← Claude Code 负责，不要动 backend/
├── backend/             ← Codex 负责，不要动 frontend/
├── shared/              ← 两边只读，不要随意修改
└── data/                ← 运行时生成，不进 git
    ├── unearth.db
    ├── previews/
    └── audit.jsonl      ← 审计日志，只追加，不修改
```

---

## 审计日志格式（后端必须实现）

文件路径：`data/audit.jsonl`
格式：每行一条 JSON，只追加，永不修改

```json
{
  "ts": "2024-01-15T14:32:00Z",
  "action": "leave",
  "photo_id": "uuid",
  "file_path": "/Volumes/HDD/2021/11/DSC_0001.ARW",
  "staged_path": "/Volumes/HDD/_unearth_staging/DSC_0001.ARW",
  "paired_files": ["DSC_0001.XMP"],
  "result": "ok",
  "error": null
}
```

**action 枚举值：** `scan_start` / `scan_complete` / `keep` / `leave` / `undo` / `staging_confirm` / `staging_restore` / `error`

---

## 角色分工（再次确认）

| 工具 | 负责 | 不要碰 |
|---|---|---|
| **Claude Code** | `frontend/` 全部 | `backend/` 任何文件 |
| **Codex** | `backend/` 全部 | `frontend/` 任何文件 |
| **两边共读** | `SPEC.md` `API.md` `PROJECT_MEMORY.md` | `shared/` 不要随意修改 |

---

## 技术栈（快速参考）

**前端：** React 18 + Vite + TypeScript + Tailwind CSS + Framer Motion + Zustand
**后端：** Python 3.11 + FastAPI + SQLite + Pillow + rawpy + exifread
**端口：** 前端 `localhost:5173`，后端 `localhost:8000`
**AI：** Anthropic Claude API（仅用于人生摘要功能，阶段二）

---

## 当前进度（开工时更新此处）

```
状态：🟡 后端 MVP 骨架已建立，等待连接真实外置硬盘扫描

前端：未开始
后端：已建立 FastAPI / SQLite / 扫描 / 预览 / 决策 / staging / 书候选接口第一版
MVP：未完成
最后更新：2026-05-19
```

> ⚠️ 每次完成一个重要节点，请更新上方的「当前进度」区块。
> 这样下次新开会话的模型能立刻知道从哪里继续。

---

## 给接手模型的话

如果你是接手这个项目的模型，请按以下顺序读文件：

1. 本文件（PROJECT_MEMORY.md）← 你已经在读了
2. SPEC.md ← 完整功能规格
3. API.md ← 接口约定

然后检查：
- `data/audit.jsonl` 最后几行，了解上次做了什么
- `frontend/` 或 `backend/` 目录结构，了解已有的代码
- 上方「当前进度」区块

不要在没有读完这三个文件之前开始写代码。
