---
更新时间：2026-05-21 commit 089beb4

前端状态：正常
最近完成：今日发掘完整实现（commit 089beb4）
  - ScrubReveal Canvas组件：destination-out擦除，72%阈值，鼠标/触摸
  - ExcavationView：20张/天，拨开→K/D决策，完成仪式页
  - App.tsx + StrataView 接入"今日发掘"入口按钮
  - GET /api/excavation/today (Task D by Codex)：同日跨年优先，< 5张自动补足

已完成功能（完整清单）：
  前端
  ✅ StrataView（地层视图，完成月份呼吸光晕）
  ✅ SiteView（事件列表，Masonry卡片）
  ✅ DecisionView 岩洞体验
      - 照片显影动画（brightness 0→1）
      - 岩层队列（右侧最多2张待决 Polaroid）
      - 记忆囊（右上角 kept 计数 + 脉冲动画）
      - 岩洞边距（72px 上下左，196px 右）
      - 带走动画：上浮发光 → 缩向记忆囊
      - 留在这里动画：下沉入岩层
      - 背景压暗 brightness(0.18) + SVG 噪点纹理
      - 事件预告幕（进组前0.8s黑幕 + 日期 + 呼吸点）
      - MilestoneOverlay（里程碑仪式，4类×4条随机）
      - 按钮物理感（留在这里→留在这片土地上，带走→带入行囊）
      - AllDoneState（Polaroid网格 + 带走统计）
      - Lightbox（Space键全屏）
  ✅ StagingConfirmDialog（双tab：待确认/回收站，缩略图网格，悬停恢复）
  ✅ TrashView（days_remaining badge，二次确认清空）

  后端
  ✅ 扫描 + 索引（8105张，2023全年）
  ✅ 决策 API（keep/leave/skip/undo）
  ✅ Staging 系统（Task A：完整照片详情）
  ✅ Trash 缓冲层（Task C：30天软删除，trashed_at，auto_purge）
  ✅ Story 模式 API（Task B：cross_year + full_day + themes + theme_story）
  ✅ 今日发掘 API（Task D：GET /api/excavation/today，同日跨年+补足逻辑）
  ✅ audit log + 软删除保护

  工具链
  ✅ dispatch.sh（Codex 任务触发器）
  ✅ backup_db.sh（→ iCloud Drive，7天快照）
  ✅ GitHub 私有仓库（rickyke2023-ctrl/unearth）
  ✅ v0.2.0 tag

后端状态：正常
预览图进度：ready=5838 / 8105（pending=2267，后台持续生成中）

需要人决策：无

下一步（按优先级）：
  1. 🎮 体验"今日发掘"模式 — 进入 StrataView 点"今日发掘"按钮
  2. 根据真实体验反馈做针对性微调（刷子大小、阈值、动画时长等）
  3. 扫全盘（40k张）— 等体验验证稳定后再做
  4. GPS地理编码 — 跑完后 Story模式themes才有内容
  5. 前端：StoryView — 等有足够GPS数据后再做

不做（原因）：
  - Story模式前端：GPS数据只有1张，themes为空，做了也看不到东西
  - 每日限额/V2功能：等V1真实使用稳定后再考虑
---
