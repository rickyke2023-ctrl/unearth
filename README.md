# 显影 · Unearth

**一个帮你把照片变成记忆的工具**  
*A memory excavation tool for photographers*

> 你以为你在整理照片，它在帮你读懂，这些年你一直在看什么。  
> *You think you're organizing photos. It's helping you understand what you've been looking at all these years.*

[![Status](https://img.shields.io/badge/状态-开发中-amber)](https://github.com/rickyke2023-ctrl/unearth)
[![Version](https://img.shields.io/badge/版本-v0.3.0-blue)](https://github.com/rickyke2023-ctrl/unearth/releases)
[![Stack](https://img.shields.io/badge/技术栈-React%20%2B%20FastAPI%20%2B%20VLM-blueviolet)]()

---

## 这是什么

四年、三个国家、四万张照片、900GB。

大多数摄影师面对这种量级的积压，试过 Lightroom、Apple Photos 和各种整理工具，最终都放弃了。**因为问题不在工具，而在于"整理照片"这件事本身让人感觉是在做家务，而不是在重拾记忆。**

显影重新定义了这件事：

- 不是"删除"，而是"留在这里"（它留在时间里，只是不在你的故事里）
- 不是"保存"，而是"带着它走"（主动的选择，不是被动的积累）
- 不是一个要完成的任务，而是一个可以反复回来的仪式

---

## 它长什么样

![发掘界面 — 未触碰的土层](SCREENSHOTS/excavation_soil_untouched.png)

*今日发掘 — 一张埋在地质层下的照片，用鼠标划开土层来揭开它。*

![发掘界面 — 揭开中](SCREENSHOTS/excavation_mid_reveal.png)

*随着你的刮动，照片从黑暗中浮现。*

![发掘界面 — 完全揭开](SCREENSHOTS/excavation_fully_revealed.png)

*完全显影。现在决定：带着它走，还是留在这里。*

---

![场地视图 — 拍摄事件](SCREENSHOTS/siteview_events.png)

*场地视图 — 你的月份作为一个发掘现场，照片自动聚类为拍摄事件。*

![地层视图](SCREENSHOTS/20260520_2107_StrataView_redesign.png)

*地层视图 — 每一年是一个地质层，每个月是一个与照片数量成比例的色块。*

![决策视图 — 经典模式](SCREENSHOTS/decisionview_classic.png)

*决策视图 — 拍立得队列、记忆胶囊、快捷键流。*

---

## AI 叙事层（核心技术亮点）

显影不只是一个决策工具，它正在构建一套**AI 驱动的个人叙事引擎**。

每张照片经过本地 VLM（视觉语言模型）分析，生成：

| 字段 | 示例 |
|---|---|
| `narrative_hint` | "午后的光斜穿窗帘，落在一双手上——那种停顿，像是某个决定刚刚做完" |
| `emotion_tone` | `contemplative` / `melancholic` / `joyful` |
| `composition` | `layered` / `centered` / `negative_space` |
| `time_of_day` | `golden_hour` / `overcast_day` |
| `color_palette` | `warm_amber` / `cool_blue` / `desaturated` |

**工程实现：**
- 在本地 Mac 上运行 [gemma4:e4b-it-4bit](https://ollama.com/library/gemma3) GGUF 量化模型（通过 omlx 引擎加速）
- 完成了四模型 benchmark（Gemma4、LLaVA、Moondream、MiniCPM）对比评测
- 对 **1,993 张真实照片**完成生产级批量标注，成功率 99.95%
- 三层稳定性防护：checkpoint 断点续传 + quality gate + crash recovery
- 设计了 `narrative_hint` prompt 防公式化机制——同一场景 30 次调用不出现重复句式

这层数据是"主题模式"（你一生都在拍什么）和"跨年叙事"（同一地点的 2020 与 2023）的基础。

---

## 主要功能

**地层视图** — 你的人生作为地质剖面  
每一年一个地层，每个月一个色块，宽度与照片数量成比例。已完成的月份发光。

**场地视图** — 自动聚类拍摄事件  
照片按时间间距（< 30 分钟 = 同一事件）聚类。进入任意事件开始决策。

**决策视图** — 发掘洞穴  
全屏照片 + 环境虚化背景，拍立得队列在侧，键盘优先，撤销栈。

**今日发掘** — 跨年同日发现  
每天推送同一日历日期跨年的照片（你的每一个5月21日）。最意外的功能：它让你看见自己多年来一直在看同一种东西。

**记忆画廊** — 你选择携带的  
按年浏览所有保留的照片。一个正在生长的收藏。

**软删除保护**  
所有"留在这里"的决定先进入 30 天缓冲区，不做永久删除。

**键盘优先**

| 按键 | 动作 |
|---|---|
| `K` 或 `→` | 带着它走（保留）|
| `D` 或 `←` | 留在这里（软删除）|
| `S` 或 `↑` | 之后再决定（跳过）|
| `Z` | 撤销 |
| `F` | 标记为书候选 |
| `Space` | 全屏灯箱 |

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + TypeScript + Framer Motion + Zustand |
| 后端 | Python 3.11 + FastAPI + SQLite |
| AI 推理 | omlx + gemma4:e4b GGUF（本地，无云依赖）|
| RAW 解码 | rawpy（libraw）— Sony ARW、Fuji RAF |
| 音频 | Web Audio API — 程序化生成，零外部文件 |
| Canvas | HTML Canvas `destination-out` 合成（土层刮开效果）|
| 字体 | Cormorant Garamond（标题）+ DM Sans（正文）|
| 存储 | 本地 SQLite — 刻意选择：本地优先，零依赖，单用户 |
| 后端复杂度 | RAW 解码、EXIF 解析、事件聚类算法、文件安全保障（软删除 + XMP sidecar 追踪 + 仅追加审计日志）、异步预览管道、GPS 聚类 |

---

## 快速开始

**前置条件：** Node 18+，Python 3.11+，一个照片文件夹

```bash
# 克隆
git clone https://github.com/rickyke2023-ctrl/unearth.git
cd unearth

# 后端
cd backend
pip install -r requirements.txt
# 编辑 config.py，把 PHOTO_ROOT 指向你的照片文件夹
python main.py
# 后端运行在 localhost:8000

# 前端（新开终端）
cd frontend
npm install
npm run dev
# 打开 localhost:5173
```

打开应用，点击"开始扫描"，让它索引你的照片。扫描 8,000 张大约需要 15 秒。

> **注意：** 目前为单用户 Mac 设计，照片按 `year/month/` 组织（Lightroom 导出结构）。支持 RAW（ARW、RAF）、JPEG、HEIF、PNG。

---

## 开发方式

这个项目是一次 **人机协作开发（Human-AI Co-development）** 的实验。

由我（产品与交互设计）和 AI 编码代理（Claude + Codex）协作构建：

- **我负责：** 产品方向、交互叙事、体验判断、技术架构决策、质量验收
- **AI 负责：** 代码实现、管道搭建、bug 修复、文档生成

核心工作时间约 **5 天**，完成了：前端五大视图、后端 API、RAW 解码管道、VLM 推理管道、1,993 张照片的批量 AI 标注与质量验收。

这不是"让 AI 帮我写代码"的工作流，而是把 AI 当作可调度的工程团队——我在做产品经理 + 首席设计师的角色。

---

## 路线图

**v0.2 — 已完成**
- [x] 完整决策循环（保留 / 留下 / 跳过 / 撤销 / 标星）
- [x] 地层、场地、决策、发掘、记忆画廊五大视图
- [x] 软删除 + 30 天缓冲区
- [x] 今日发掘 — 跨年同日推送
- [x] 程序化音频 + 8 层地质 Canvas 纹理
- [x] 故事模式后端（跨年同地、全天叙事）

**v0.3 — 当前**
- [x] VLM 本地推理管道 + 四模型 benchmark
- [x] 1,993 张照片批量 AI 叙事标注（`narrative_hint` + 情绪/构图/色调）
- [ ] 摄像头手势：用手在摄像头前刮开土层（MediaPipe Hands — 接口已预留）
- [ ] GPS 地理编码（更丰富的地点数据）

**v1.0 — 发现层**

*从"你评判照片"到"系统帮你理解自己"的转变。*

- [ ] **主题模式 — 你的执念：** 系统找出你一直在拍的东西——窗、雨、猫、空街道——作为跨年主题卷轴呈现。"原来你拍了 847 张窗的照片。"这个发现本身就是礼物。
- [ ] **故事模式 — 跨年叙事：** 同一 GPS 位置在 2020 和 2023。每年的每个月第一天。三座城市，同一种光。系统来写故事，你来经历它。
- [ ] **每日配额：** 每天 30 张，像每日诗歌。不是要清空的积压，而是值得回来的仪式。

**v2.0 — 开放工具**
- [ ] 打包为独立 Mac 应用（Tauri 或 Electron）
- [ ] 开源发布（MIT）

---

## 设计哲学

> 显影不是照片管理工具。  
> 它是一面镜子——你以为你在整理照片，  
> 它在帮你读懂，这些年你一直在看什么。

*Unearth is not a photo management tool.  
It's a mirror — you think you're organizing photos,  
it's helping you understand what you've been looking at all these years.*

---

*显影 · Unearth — v0.3.0 · 2026*
