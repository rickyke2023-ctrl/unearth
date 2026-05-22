---
更新时间：2026-05-22 BookView + AlmanacView 完成

节点1 ✅  节点2 ✅  节点3 ✅  节点4 ✅

最近完成（本次 session）：
  ✅ BookView（精选册候选画廊）
      - frontend/src/components/BookView/index.tsx
      - StrataView 加「★ 精选册」金色入口按钮
      - 展示所有 is_book_candidate 照片，支持 JSON/CSV 导出链接
      - i18n: book.* 翻译键（中英双语）
  ✅ AlmanacView（年历 + 时段分布）
      - frontend/src/components/AlmanacView/index.tsx
      - StrataView 加「◈ 年历」蓝色入口按钮
      - Tab 1「拍摄日历」：全年热力图，hover 显示日期/决策/带走计数
      - Tab 2「时段分布」：48 个半小时柱状图，高亮峰值时段
      - 数据：GET /api/calendar?year=2023 + GET /api/time-distribution
      - i18n: almanac.* 翻译键（中英双语）
  ✅ Scan CLI + Calendar/Time APIs（Codex 完成）
      - backend/scripts/scan_cli.py：独立扫描入口，支持 --dry-run，不启动 FastAPI
      - GET /api/calendar?year=XXXX：按日返回 photo/decided/kept 计数
      - GET /api/time-distribution：48 个半小时桶 + peak label/count
      - 验证：py_compile、scan_cli --dry-run、FastAPI TestClient 通过
  ✅ StoryView 前端 — 今日故事(full_day) + 地方(themes) + 地方详情(ThemeDetail)
      - frontend/src/components/StoryView/index.tsx
      - StrataView 加「◎ Stories」绿色入口按钮
      - 类型: StoryPhoto, FullDayStory, Theme, ThemeDetail
      - API: getStoryToday(), getStoryThemes(), getThemeDetail()
      - i18n: 20条 story.* 翻译键
      - hover overlay 显示时间 + 城市
  ✅ GPS 批量地理编码脚本 — backend/scripts/geocode_all.py (Codex 完成)
      - --dry-run 验证通过：1张照片待地理编码
      - 分批处理，可中断恢复，进度输出
  ✅ 颂钵音效 + 默认英文 + ScrubReveal i18n 漏网修复

前端状态：正常
后端状态：正常
GitHub：已公开 → github.com/rickyke2023-ctrl/unearth

最近完成：
  ✅ GPS 批量地理编码脚本（geocode_all.py）
  ✅ 颂钵音效 — 替换发掘完成音（playSingingBowl：392 Hz 基频 + 非整数泛音，5s 衰减，LFO 颤动）
  ✅ 默认英文 — appStore language 改为 'en'，右上角显示「中」切换
  ✅ ScrubReveal i18n 漏网修复 — 拨开表土提示文字接入 excav.hint
  ✅ i18n 国际化 — 中英文切换（StrataView 右上角 EN/中 按钮）
      - frontend/src/i18n/index.ts（translation map + 格式化函数）
      - hooks/useTranslation.ts
      - appStore language + setLanguage
      - 9个组件全部替换（含 ScrubReveal）
      - 诗意文案英译（first_leave 等 milestone 文案）
  ✅ ExcavationView（今日发掘）— 8层地质纹理 + Web Audio + forwardRef接口
  ✅ KeptView（带走的记忆画廊）
  ✅ Task E：GET /api/photos/kept（分页 + year过滤）
  ✅ check_all.sh 验证脚本
  ✅ README.md（中英双语，6张截图，完整roadmap）
  ✅ 仓库设为 public

已完成功能（完整清单）：
  前端
  ✅ StrataView（地层视图，完成月份呼吸光晕）
  ✅ SiteView（事件列表，Masonry卡片）
  ✅ DecisionView 岩洞体验
      - 照片显影动画（brightness 0→1）
      - 岩层队列（右侧最多2张待决 Polaroid）
      - 记忆囊（右上角 kept 计数 + 脉冲动画）
      - 带走动画：上浮发光 → 缩向记忆囊
      - 留在这里动画：下沉入岩层
      - 背景压暗 brightness(0.18) + SVG 噪点纹理
      - 事件预告幕（进组前0.8s黑幕 + 日期 + 呼吸点）
      - MilestoneOverlay（里程碑仪式，4类×4条随机）
      - 按钮物理感（留在这里→留在这片土地上，带走→带入行囊）
      - AllDoneState（Polaroid网格 + 带走统计）
      - Lightbox（Space键全屏）
  ✅ ExcavationView（今日发掘）
      - ScrubReveal：8层地质纹理canvas，mouse拨土
      - Web Audio API：翻土音效 + 出土和弦（零外部文件）
      - forwardRef暴露 scrubAt(nx,ny)，为摄像头手势预留
      - 预加载后两张照片
  ✅ KeptView（带走的记忆画廊，年份tab + 瀑布网格）
  ✅ StagingConfirmDialog（双tab：待确认/回收站）
  ✅ TrashView（days_remaining badge，二次确认清空）

  后端
  ✅ 扫描 + 索引（8105张，2023全年）
  ✅ 决策 API（keep/leave/skip/undo）
  ✅ Staging 系统（Task A）
  ✅ Trash 缓冲层（Task C：30天软删除，auto_purge）
  ✅ Story 模式 API（Task B：cross_year + full_day + themes）
  ✅ 今日发掘 API（Task D：GET /api/excavation/today）
  ✅ 带走记忆 API（Task E：GET /api/photos/kept）
  ✅ audit log + 软删除保护

  工具链
  ✅ dispatch.sh（Codex 任务触发器）
  ✅ backup_db.sh（→ iCloud Drive，7天快照）
  ✅ check_all.sh（一键全检）
  ✅ GitHub 公开仓库（rickyke2023-ctrl/unearth）
  ✅ v0.2.0 tag

预览图进度：ready=5838 / 8105（pending=2267，后台持续生成中）

需要人决策：无

下一步（按优先级）：
  1. ✅ i18n 国际化 — 已完成
  2. 摄像头手势 MVP — MediaPipe Hands → scrubAt(nx,ny)
  3. 全盘 40K 扫描 — 等手势体验验证后
  4. GPS 地理编码 — 跑完后 Story模式themes才有内容
  5. StoryView 前端 — 等有足够GPS数据后

i18n 任务说明（下次开工用）：
  方案：简单 translation map，不引入外部库
  文件：新建 frontend/src/i18n/index.ts（所有字符串中英对照）
  Store：appStore.ts 加 language: 'zh' | 'en' + setLanguage action
  组件：所有硬编码中文替换为 t('key') hook
  入口：StrataView 右上角加 EN/中 切换按钮
  涉及文件（约8个）：
    StrataView, SiteView, DecisionView, ExcavationView,
    KeptView, StagingConfirmDialog, MilestoneOverlay, shared loading/error

不做（原因）：
  - Story模式前端：GPS数据只有1张，themes为空
  - 每日限额/V2功能：等V1真实使用稳定后再考虑
---
