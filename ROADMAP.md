# 显影 Unearth · 产品路线图

**最后更新：** 2026-05-26  
**当前分支：** `feature/discovery`（叙事引擎）/ `main`（稳定版）  
**主控原则：** 不删任何用户照片。磁盘低于 8GB 停止一切生成任务。

---

## 当前状态快照

| 维度 | 状态 |
|---|---|
| 照片总量 | 46,110 张（2019-2026 全量） |
| 预览图 | 33,895 / 46,110（73%），剩余 12,215 待生成 |
| 磁盘可用 | ~20GB |
| 主分支 | v0.2.0，稳定，公开 |
| 叙事引擎 | `feature/discovery`，微光之门 + 书库 + 《沙丘》已上线 |
| EXIF 覆盖 | `shot_at` 100% · `camera_model` 74% · `gps_lat` ~0% · 焦距/光圈 未存储 |

---

## 产品阶段定义

```
阶段一（当前）  私人工具        本地运行，单用户，Mac
阶段二（近期）  本地 APP        可打包分发，有完整叙事引擎，100张 onboarding
阶段三（未来）  可复用平台      叙事模板工坊，用户可定义自己的文学框架
```

---

## NOW · 本周（2026-05-26 ~ 05-31）

### 基础设施修复（Codex 执行）

| 任务 | 文件 | 优先级 | 说明 |
|---|---|---|---|
| `fix-auto-purge-audit` | `backend/staging.py` + tests | 🔴 高 | audit.jsonl 有真实错误，trash 自动清理可靠性存疑 |
| `fix-frontend-lint` | `frontend/src/components/ExcavationView` 等 | 🟡 中 | build 通过但 lint 报错，多人协作放大噪音 |
| EXIF schema 方案文档 | `docs/EXIF_SCHEMA_PROPOSAL.md` | 🟡 中 | 为《哈扎尔词典》准备，先只写方案不改代码 |

### Maestro 工作流接入（Day 1 试点）

参照 `docs/MAESTRO_WORKFLOW.md`：
- [ ] 打开 Maestro，接入当前 repo
- [ ] 只读任务试跑，确认 session 记录清晰
- [ ] 不开并行 worktree，不接 DeepSeek
- 目标：验证"任务上下文不容易丢"

### 视觉 AI 选型确认 + 实验（Claude 主控）

> **选型结论（2026-05-26 完成调研）**：主推 **Qwen2.5-VL-3B**，MiniCPM-V 4.6 作粗筛前置层。

**推荐架构（两阶段）：**
```
阶段一 — 粗筛  MiniCPM-V 4.6（1.3B）  全部 46K 张  ~19小时
  检测：有无人、室内/室外、白天/夜晚

阶段二 — 精析  Qwen2.5-VL-3B          约 30% 重点照片  ~11小时
  检测：情绪色温、光源类型、重复主题、叙事分类

合计：~30小时后台完成全量标注
```

**为什么是 Qwen2.5-VL-3B：**
- 中文原生，标签直接输出中文，无需翻译
- `ollama run qwen2.5vl:3b` 一行启动，Apache 2.0
- 16GB 内存 4-bit 量化约 2.5-3GB，安全
- 结构化 JSON 输出，直接对接 SQLite

**本周实验任务：**
- [ ] `ollama pull qwen2.5vl:3b` 下载模型（约 2-3GB）
- [ ] 用 10-20 张照片测试标签质量，对比各书的感知需求
- [ ] 确认 MiniCPM-V 4.6 的 Ollama 支持（`ollama.com/search?q=minicpm`）

**感知需求矩阵（初稿）：**

| 书 | 需要 VLM 提取的维度 |
|---|---|
| 《看不见的城市》| 主视觉元素、重复结构、情绪色温、有无窗/门/路 |
| 《酒吧长谈》| 人的存在感（有/无/背影）、画面密度、视角距离 |
| 《哈扎尔词典》| 光源类型、主色调、构图重心（先用 EXIF 代替） |
| 《山海经》| 地形地貌、自然vs人工比例、方向感 |
| 《沙丘》| ❌ 不需要 VLM，靠 EXIF 缺失计算 mystery score |

---

## NEXT · 六月上旬（2026-06-01 ~ 06-14）

### 《哈扎尔词典》MVP（feature/discovery）

> 用现有数据（`shot_at` 100%、`camera_model` 74%）先做出来，EXIF 补全后词典自动变丰富。

**后端：**
- [ ] `backend/novel_khazar.py`：词条生成逻辑
  - 时刻词条：清晨 / 上午 / 午后 / 傍晚 / 夜晚
  - 机身词条：每台出现过的相机
  - 介质词条：RAW_SONY / RAW_FUJI / JPEG / HEIF
  - 季节词条：春夏秋冬
- [ ] `GET /api/novel/khazar/entries`：返回词条列表
- [ ] `GET /api/novel/khazar/entry/{id}`：返回某词条下的所有照片

**前端：**
- [ ] `KhazarView`：词条格子布局，点进词条展开交叉图谱
- [ ] 设计：词典页感，黑白+金色，衬线体

**需要讨论的叙事问题：**
词条之间怎么产生「交叉感」——「用 A7C 拍的傍晚 vs 用 iPhone 拍的傍晚，两种黄昏」。  
这不是技术问题，是叙事问题，需要一次专门讨论。

### EXIF Schema 补全（Codex 执行）

- [ ] `backend/database.py`：加列 `focal_length_mm`, `aperture`, `iso`, `shutter_speed`
- [ ] `backend/scanner.py`：从 RAW EXIF 读取这四个字段
- [ ] migration 脚本：对 46K 张照片增量回填
- [ ] 风险：扫描耗时，需分批处理

### 摄像头手势优化（Claude 主控）

- [ ] 从 `@mediapipe/hands`（CDN，高延迟）迁移到 `@mediapipe/tasks-vision`（npm + GPU delegate）
- [ ] 接入 `requestVideoFrameCallback` 降低采样延迟
- [ ] 目标：延迟 < 50ms，当前估计 >200ms

### 磁盘扩容 + 预览补全

- [ ] 清出 20-30GB（清用户缓存 / 删旧文件）
- [ ] 补生成剩余 12,215 张预览（`python3 -m backend.scripts.generate_previews`）
- [ ] 优先处理 RAW_FUJI（7,303 张）→ JPEG（4,200 张）→ RAW_SONY（703 张）

---

## NEXT · 六月下旬（2026-06-15 ~ 06-30）

### 每天 20 张日常叙事流（产品核心节奏）

> 从昨晚讨论提炼：每日 20 张是让用户持续使用的关键机制。

**设计原则：**
- 不是用户选，是算法根据叙事需要选（今天《酒吧长谈》需要一张 2019 年傍晚，就去取它）
- 20 张，5 分钟，一个小章节
- 每天结束后有小小的「今日叙事」归档感

**实现路径：**
- [ ] 后端：`GET /api/daily/narrative`，基于日期 seed + 叙事模式返回 20 张
- [ ] 前端：新的日常入口，从微光之门或单独入口进入
- [ ] 需要讨论：是放在「发现」世界里，还是单独作为一个入口？

### 《酒吧长谈》时间回响算法

> 核心洞察：不只是「同一时刻跨年份」，而是现在的你在读过去的你——记忆再巩固。

- [ ] 后端：`novel_cathedral.py`
  - 同小时（±30min）跨年份聚合
  - 加权：年份差越大权重越高（更戏剧化的「对话」）
  - 可选维度：同季节、同 camera_model
- [ ] 前端：时间轴布局，左右对话感，不是列表
- [ ] UI 哲学：两张照片之间的「解释距离」——2019 vs 2024，你现在还记得吗？

### 100 张 Onboarding 流程（面向未来用户）

- [ ] 进入 APP 时可选：「先带 100 张体验」vs「导入完整图库」
- [ ] 快速扫描 + 立即进入叙事引擎（< 2 分钟）
- [ ] 体验完再问：「你还有更多记忆吗？」
- [ ] 需要讨论：默认 100 张还是 20 张？从哪个文件夹选？

---

## LATER · 七月以后

### 《看不见的城市》视觉 AI 城市

- 依赖：MiniCPM-V 本地部署成功 + 感知需求矩阵确认
- VLM 对每张照片提取主题标签 → 聚类 → 命名「城市」（AI 命名 or 用户命名）
- 城市里的照片跨越年份 —— 你一直在拍「窗」「路口」「夜晚餐厅」

### 《山海经》GPS 神话地理

- 依赖：GPS 反地理编码补全（目前 ~0% 覆盖）
- 将走过的地方构成个人地理志，不是地图，是诗
- 依赖外置硬盘上的原始 EXIF GPS 数据

### APP 打包与分发

> 用户问题四：不要让用户自己配环境。

**CLI 一键安装（中期目标）：**
```bash
curl -sSL unearth.app/install.sh | sh
```
自动处理：Python 环境、SQLite 初始化、MiniCPM-V 下载（~2-3GB）、前端 build、首次启动。

**桌面 APP（长期目标）：**
- Tauri 打包（比 Electron 轻，Rust 内核）
- 模型作为首次启动后台下载
- 面向不懂命令行的普通用户

### 叙事模板工坊（平台化）

> 用户问题五：用户可以定义自己的文学框架。

- 当《看不见的城市》和《酒吧长谈》实现完成后，将其实现过程文档化为「模板规范」
- 规范包括：感知需求 → 数据提取 → 算法 → UI 骨架
- 第六本书由社区贡献（例：《物语》系列、《格林童话》式分类）
- 这是阶段三的核心，预计需要成熟的 API 和文档体系

---

## Agent 分工（Maestro 工作流）

| Agent | 职责 | 禁止 |
|---|---|---|
| Claude Code（主控）| 产品判断、前端叙事设计、最终整合 | 产品方向不外包 |
| Codex | 后端 API、schema、scanner、staging/trash | 不改前端核心路由 |
| Cheap Worker | 只读调查、文档整理、lint 草案、i18n | 不改源码，只写文档和提案 |
| QA / Reviewer | diff review、pytest、截图验证 | 不做大范围重构 |

详细工作流参见：`docs/MAESTRO_WORKFLOW.md`

---

## Bug 待修复清单（来自 CODEX_TASKS.md）

| # | 问题 | 风险 | 状态 |
|---|---|---|---|
| Task 4 | 新扫描会清空整个数据库 | 🔴 严重 | ✅ 已标记，待 Codex 修复 |
| Task 5 | `/api/staging/confirm` 不按 root_path 过滤 | 🟡 中 | ✅ 已标记，待修复 |
| Task 3 | `/api/events/{id}/photos` 缺 7 个字段 | 🟡 中 | ✅ 已标记 |
| Lint | 前端 lint 报错（build 通过但 lint 失败）| 🟢 低 | 待 Cheap Worker 草案 |
| Purge audit | `auto_purge_expired: bad parameter` | 🟡 中 | 本周 Codex 修复 |

---

## 硬约束（任何情况下不可违反）

- ❌ 不删任何用户照片文件（no `rm`, `os.remove`, `shutil.rmtree` on photo files）
- ❌ 磁盘可用低于 8GB 时停止所有生成任务
- ❌ 不在 `main` 分支暴露叙事引擎代码（保持在 `feature/discovery`）
- ❌ 不让多个 agent 同时改同一个文件

---

## 文件导航

| 文件 | 用途 |
|---|---|
| `ROADMAP.md` | ← 你在这里，完整排期 |
| `SPEC.md` | 产品规格、功能设计、文学框架细节 |
| `AGENT_LOG/STATUS.md` | 每次工作后更新的状态快照 |
| `docs/MAESTRO_WORKFLOW.md` | Agent 工作流设计（Codex 撰写）|
| `CODEX_TASKS.md` | Bug 详细描述，给 Codex 执行 |
| `DESIGN_LANGUAGE.md` | 视觉语言规范 |
| `API.md` | 后端 API 文档 |
| `DEVLOG_YYYYMMDD.md` | 每日复盘 |
