# 显影 Unearth — 项目全景文档
> 给招聘 AI / GitHub 评估 / 外部介绍使用  
> 生成于 2026-05-21，当前版本 v0.2.0

---

## 一、这个项目是什么

**显影 Unearth** 是一个本地运行的「记忆挖掘工具」，帮助有大量照片积压的人，用一种有仪式感的方式完成照片整理——不是 Lightroom 替代品，而是一个完全不同维度的东西。

### 核心定位的差异

| 传统照片工具 | 显影 Unearth |
|---|---|
| 整理文件 | 挖掘记忆 |
| 「删除」 | 「留在这里」 |
| 「保存」 | 「带走」 |
| 效率工具 | 记忆游戏 |
| 完成任务的压力感 | 每次发现的好奇心 |

**一句话核心洞察：** 四五年、四万张照片不是文件管理问题，是记忆考古问题。你需要的不是更快的 Lightroom，而是一个愿意和你坐下来、从时间的地层里慢慢挖的伴侣。

---

## 二、当前完成度（v0.2.0）

### 整体状态：可用的 MVP，体验完整闭环已跑通

已扫描索引：**8,105 张照片**（2023 全年），扫描速度 14 秒，零报错。  
预览图生成：**5,838 张就绪**，后台持续生成中。  
数据库大小：**8.1MB**（SQLite，含全量元数据）。

### 已完成功能清单

#### 前端（React 18 + Vite + TypeScript + Framer Motion）

**StrataView — 地层全景界面**
- 每年一个地层带，宽度比例 ∝ 照片数量
- 已完成月份有呼吸光晕动画（2.5s 周期）
- 悬浮 tooltip 显示张数 / 事件数 / 主要地点
- 全局统计栏：总张数 / 带走 / 留下 / 释放空间 / 进度百分比

**SiteView — 考古现场（事件列表）**
- 按拍摄时间间隔自动聚合事件（<30 分钟为同一组）
- Masonry 卡片布局，每张卡显示封面图 + 日期 + 地点 + 照片数

**DecisionView — 核心决策岩洞**
- 照片显影动画（brightness 0→1，从黑暗中浮现）
- 岩层队列（右侧最多 2 张待决 Polaroid，物理感十足）
- 记忆囊（右上角 kept 计数 + 脉冲动画）
- 带走动画：上浮发光 → 缩向记忆囊
- 留在这里动画：下沉入岩层
- 背景压暗 brightness(0.18) + SVG 噪点纹理
- 事件预告幕（进入组前 0.8s 黑幕 + 日期 + 呼吸点动画）
- MilestoneOverlay（里程碑仪式感，4 类 × 4 条随机文案）
- 按钮物理感（留在这里→按下时文字变为「留在这片土地上」，带走→「带入行囊」）
- AllDoneState（事件完成画面：Polaroid 网格 + 带走统计）
- Lightbox（Space 键全屏查看原图）
- 快捷键：K 带走 / D 留下 / S 稍后 / Z 撤销 / F 标记书候选 / Space 全屏

**ExcavationView — 今日发掘（核心体验）**
- 每日精选 10 张跨年同日照片（如 5 月 21 日 2020-2023 年的照片交织）
- ScrubReveal 翻土体验：
  - 8 层地质纹理 canvas（岩层色带 / 裂缝 / 矿物颗粒 / 温暖中心光 / 角落压暗晕）
  - 翻土鼠标动作实时擦除泥土，照片从黑暗中逐渐浮现
  - Web Audio API 实时生成翻土音效（带通滤波白噪声）+ 72% 阈值触发出土和弦
  - 零外部音频文件
  - forwardRef 架构预留摄像头手势接口（`scrubAt(nx, ny)`）
- 预加载机制，切换无卡顿

**KeptView — 带走的记忆画廊**
- 年份 tab 过滤（多年照片时自动显示）
- 按年分组瀑布网格（auto-fill 200px）
- 悬浮显示日期 / 地点 / 文件名
- 空状态文案「行囊还是空的」

**StagingConfirmDialog — 双 tab 确认中心**
- 待确认 tab：缩略图网格，可逐张恢复
- 回收站 tab：days_remaining badge，二次确认清空

#### 后端（Python 3.11 + FastAPI + SQLite + rawpy）

- 扫描 + 索引（支持 ARW / RAF / JPEG / HEIF / PNG）
- EXIF 读取：拍摄时间 / GPS / 相机型号
- RAW/JPEG 配对识别 + XMP sidecar 跟随
- 事件自动聚合（时间间隔算法）
- 决策 API（keep / leave / skip / undo）
- Staging 系统（文件移动 + 元数据 + 物理文件操作）
- Trash 缓冲层（30 天软删除，trashed_at，auto_purge）
- Story 模式 API（跨年同地点 / 全天故事线 / 主题聚合 / 文案生成）
- 今日发掘 API（同日跨年精选 + 补足逻辑）
- 带走记忆 API（分页 + 年份过滤 + by_year 分布）
- 预览图后台异步生成（最大 1200px，≤300KB）
- audit log（JSONL，只追加，软删除保护）

#### 工具链

- `dispatch.sh`：Codex 后端任务触发器（任务派发 / 验收 / 提交一体化）
- `backup_db.sh`：→ iCloud Drive，7 天滚动快照
- `check_all.sh`：一键验证（tsc / npm build / 7 个 API 端点 / 8 个关键文件）
- GitHub 私有仓库（rickyke2023-ctrl/unearth），已打 v0.2.0 tag

---

## 三、技术栈一览

| 层 | 技术 |
|---|---|
| 前端框架 | React 18 + Vite + TypeScript |
| 状态管理 | Zustand |
| 动画 | Framer Motion |
| 样式 | Tailwind CSS + CSS Variables（设计系统） |
| 字体 | DM Sans（正文）+ Cormorant Garamond（标题）|
| 后端框架 | FastAPI（Python 3.11）|
| 数据库 | SQLite（单文件，本地优先）|
| RAW 解码 | rawpy（libraw 绑定）|
| EXIF 读取 | exifread + pillow |
| 音频 | Web Audio API（程序生成，零外部文件）|
| 画布 | HTML Canvas（destination-out 合成）|
| 部署 | 纯本地，无服务器依赖 |

---

## 四、完整路线图

### 当前阶段：V1 — 私人工具（进行中，约 70% 完成）

**已完成：**
✅ 完整扫描 + 索引流水线  
✅ 地层视图 / 事件视图 / 决策视图 三核心界面  
✅ 今日发掘体验（翻土 + 音效 + 出土仪式）  
✅ 带走的记忆画廊  
✅ Staging 确认 + 回收站缓冲层  
✅ 完整决策链路（keep / leave / skip / undo / star）  
✅ audit log + 软删除保护  
✅ Story 模式后端基础  

**待完成（V1 收尾）：**
- [ ] 摄像头手势：用食指在镜头前挥动代替鼠标翻土（接口已预留）
- [ ] 全盘 40K 扫描（等手势验证体验稳定后进行）
- [ ] GPS 地理编码（为故事模式补充地点数据）

---

### 下一阶段：V2 — 非线性发现（已有设计，待实现）

**V2 的核心转变：**
> V1 是：你来评判照片。  
> V2 是：系统帮你读懂自己。

#### 主题模式（你的执念）
系统将跨越不同时间、不同地点的相似照片聚合成「主题胶卷」。
- 你拍了多少扇窗？多少只猫？多少次雨天？
- 触发情绪：自我发现。「原来我拍了 847 张窗户。」这个发现本身就是礼物。
- 第一步（基于现有数据）：GPS 地点聚类 + 拍摄时段分布 + 相机习惯对比
- 第二步（AI 视觉）：接入 Claude API 做内容识别（树 / 窗 / 猫 / 天空 / 食物）

#### 故事模式（跨越时间的叙事）
系统把碎片重新编排成有意义的叙事：
- 「2020 年和 2023 年，同一个地点的你」
- 「一整年里，每个月的第一天」
- 「你在三个不同城市拍过的早餐」
- 故事有开头 / 中段 / 结尾，用户在叙事中做决策，感受的是记忆而不是任务

#### 每日限额机制
> 不是「什么时候才能整理完」，而是「今天的故事已经看完了」。

每日系统生成一个「故事」或「主题」，完成即收工。像每日一首诗，不是一次读完整本书。

---

### 远期阶段：V3 — 开源 / 可复用工具

- 抽象出可配置部分（硬盘路径 / 用户名 / 语言）
- 个人审美偏好变为「可配置的默认值」
- 打包为独立 Mac 应用（Electron 或 Tauri）
- 开源分发（MIT 协议）

---

## 五、GitHub 就绪度评估

### 现在放上 GitHub，值得吗？

**结论：值得，但建议以「个人项目 · 开发中」的姿态发布，而不是「开源工具」。**

**支持放上去的理由：**
1. **技术深度有说服力**：从 RAW 解码到 Web Audio API 程序生成音效，从 Canvas `destination-out` 合成到 forwardRef 摄像头接口架构，都是非平凡的技术选择，有完整的设计理由
2. **产品哲学清晰**：有完整的 SPEC.md / DESIGN_LANGUAGE.md / PROJECT_MEMORY.md 三份文档，说明作者是一个会思考「为什么」的开发者，不只是「怎么做」
3. **代码质量有规范**：TypeScript 全量类型、组件架构清晰、API 层隔离、audit log 安全机制
4. **多 Agent 协作实验**：Claude + Codex 协作开发模式本身对技术社区有参考价值

**尚未达到「开源工具」标准的地方：**
1. 全盘 40K 扫描未完成（只验证了 8K 规模）
2. GPS 编码未完成，故事模式缺数据支撑
3. 安装文档 / README 未写
4. 无单元测试（依赖 `check_all.sh` 做集成验证）

**建议的发布姿态：**
```
GitHub Description:
"A memory excavation tool for photographers — local-first, poetic UX, 
built with React + FastAPI. Personal project, active development."
```

---

## 六、GitHub README 草稿（中英双语）

---

### 英文版

```markdown
# Unearth · 显影

> *You are not organizing files. You are choosing what memories to carry forward.*

A local-first memory excavation tool for photographers with years of accumulated photos.  
Not a Lightroom replacement. Something entirely different.

## What it does

- **Excavate by day**: a daily ritual — 10 photos from the same date across different years surface together, waiting to be unearthed from the soil
- **Keep or leave**: every decision has weight — "keep" means you carry it forward; "leave" means it stays in time, not in your story
- **Strata view**: your years visualized as geological layers — each month a block, width proportional to photo count
- **Memory gallery**: see what you've chosen to carry, filtered by year
- **Soft delete safety**: nothing is ever permanently deleted without your explicit confirmation

## How it feels

Scrub away the soil with your mouse (or soon, your hand in front of the camera). Hear the sound of digging. Watch the photo emerge from darkness. When it's fully revealed, a chord plays.

This is not a task to complete. It's a ritual to experience.

## Tech stack

- **Frontend**: React 18 + Vite + TypeScript + Framer Motion + Zustand
- **Backend**: Python 3.11 + FastAPI + SQLite + rawpy
- **Audio**: Web Audio API (procedurally generated, zero external files)
- **Canvas**: HTML Canvas destination-out compositing for soil reveal effect
- **Local-first**: no server, no cloud, no account required

## Status

Personal project, active development. Currently indexing 8,000+ photos (2023).  
v0.2.0 — core decision loop complete, excavation experience live.

Built with Claude (main controller) + Codex (backend execution) in 2 days.
```

---

### 中文版

```markdown
# 显影 · Unearth

> *你不是在整理文件。你在选择带走什么记忆。*

一个本地运行的「记忆挖掘工具」，为那些有着多年照片积压的摄影师而生。  
不是 Lightroom 的替代品——是完全不同维度的东西。

## 它能做什么

- **今日发掘**：每天一次仪式——同一日期、跨越不同年份的 10 张照片浮出地表，等待你挖掘
- **带走 / 留在这里**：每个决定都有重量——「带走」意味着带进往后的人生；「留在这里」意味着它留在时间里，不再是你故事的一部分
- **地层视图**：把你的几年时光可视化为地质切面——每个月是一个区块，宽度比例反映照片数量
- **记忆画廊**：看到你选择带走的所有照片，按年份过滤
- **软删除保护**：没有任何文件会在你确认之前被永久删除

## 使用体验

用鼠标拨开泥土（或者即将支持的：在摄像头前挥动手势）。听到翻土的声音。看照片从黑暗里逐渐浮现。当它完全显影，一个和弦响起。

这不是一个要完成的任务。是一个值得体验的仪式。

## 技术栈

- **前端**：React 18 + Vite + TypeScript + Framer Motion + Zustand
- **后端**：Python 3.11 + FastAPI + SQLite + rawpy
- **音效**：Web Audio API 程序生成（零外部音频文件）
- **画布**：HTML Canvas destination-out 合成实现翻土效果
- **本地优先**：无服务器、无云端、无需注册

## 当前状态

个人项目，积极开发中。当前已索引 8,000+ 张照片（2023 年）。  
v0.2.0 — 核心决策链路完整，今日发掘体验已上线。

由 Claude（主控）+ Codex（后端执行）协作，2 天完成核心架构。
```

---

## 七、给招聘 AI 的评估维度

如果你在评估这个项目对求职的帮助程度，以下是几个角度：

**技术广度**  
全栈（React + Python），跨越浏览器 API（Web Audio / Canvas / ResizeObserver / MediaPipe 即将），RAW 图像处理（rawpy / libraw），SQLite 数据建模，RESTful API 设计。不是 CRUD 应用。

**工程判断力**  
- 为什么用软删除而不是直接删除？（不可逆操作的安全设计）
- 为什么用 Canvas `destination-out` 而不是 CSS clip-path？（性能 + 灵活性 + 音频同步）
- 为什么 forwardRef 暴露 `scrubAt(nx, ny)` 而不是把摄像头逻辑写死在组件里？（预留扩展性，分离关注点）

这些选择背后都有理由，文档里写得清楚。

**产品敏感度**  
这个项目的设计文档（SPEC.md、DESIGN_LANGUAGE.md）证明作者在写代码之前先想清楚了「为什么」。技术是用来兑现产品定义的，不是技术选型驱动产品。

**AI 协作实验性**  
使用 Claude Code（主控）+ Codex（后端执行）的多 Agent 协作模式，2 天内完成了通常需要 1-2 名工程师 2 周完成的工作量。这个过程本身是对 AI 辅助开发工作流的实验和记录。

**不适合展示的场景**  
- 如果对方期待的是「完成的开源产品」：还不够，缺测试、缺安装文档
- 如果对方期待的是「大规模系统设计」：这是单人本地工具，无并发、无分布式
- 如果对方期待的是「商业化产品经验」：这是个人项目，没有用户数据、没有 PMF 验证

---

*本文档生成于 2026-05-21，显影 Unearth v0.2.0*
