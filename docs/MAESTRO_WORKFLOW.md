# Maestro 工作流接入计划

更新时间：2026-05-25

目标：把当前“Claude Code 主控 + Codex 后端执行”的工作流，渐进升级成 Maestro 管理的多 agent 并行流程。不要一次性迁移全部开发流程；先用 3 天试点，确认它真的省时间、少出错，再扩大使用。

---

## 当前安装状态

已安装：

- App：`/Applications/Maestro.app`
- CLI：`/opt/homebrew/bin/maestro-cli`
- 版本：`0.15.4-RC`
- 验证命令：

```bash
maestro-cli --help
```

第一次打开：

```bash
open /Applications/Maestro.app
```

如果 macOS 提示安全确认，按系统提示允许打开即可。

---

## 我们的角色分工

### Claude Code / 主控

职责：

- 产品经理、产品顾问、体验判断
- 前端核心交互、叙事设计、最终整合
- 决定哪些任务可以并行、哪些必须串行
- 最终 review 和 merge

不交给别人的内容：

- 产品方向判断
- 真实照片删除 / trash / purge 的最终确认
- 影响主体验入口的前端改动

### Codex / 后端执行

职责：

- 后端 API、SQLite schema、scanner、staging/trash、安全逻辑
- 后端测试、迁移脚本、数据一致性排查
- 高风险文件操作相关任务

必须保留给 Codex 或主控：

- `backend/staging.py`
- `backend/scanner.py`
- `backend/database.py`
- 任何会移动、删除、purge 用户照片的代码

### Cheap Worker / OpenCode + DeepSeek 等便宜模型

职责：

- 只读代码调查
- 文档整理
- lint 机械修复草案
- i18n 文案补齐
- 生成任务 brief / checklist

限制：

- 不允许改 staging/trash/scanner/database
- 不允许运行真实扫描、删除、purge
- 产出必须由 Claude Code 或 Codex review 后才合并

### Reviewer / QA Agent

职责：

- 看 diff，找数据损坏、删除风险、schema 风险、遗漏测试
- 跑 `pytest`、`npm run build`、必要时跑 Playwright 截图
- 只报告问题，不做大范围重构

---

## Day 1：只用 Maestro 做任务看板和单 agent 派发

目标：熟悉 Maestro，不改变现有开发责任边界。

Checklist：

- [ ] 打开 Maestro：`open /Applications/Maestro.app`
- [ ] 添加本项目 workspace：`/Users/ricky/Downloads/照片整理工作流`
- [ ] 确认 Maestro 能识别当前 git repo 和分支 `feature/discovery`
- [ ] 在 Maestro 里连接现有 agent provider：Claude Code、Codex
- [ ] 不启用多 agent 并行，先只创建一个 Claude Code 主控 session
- [ ] 把 `PROJECT_MEMORY.md`、`SPEC.md`、`API.md`、`AGENT_LOG/STATUS.md` 作为启动上下文
- [ ] 用 Maestro 创建第一个小任务：
  - 任务名：`Read current project status`
  - 要求：只读，不改文件
  - 输出：项目现状、风险、下一步建议
- [ ] 验证 Maestro 的 session 历史和任务记录是否比现在手动窗口更清楚

Day 1 不做：

- 不开多个 worktree
- 不让多个 agent 同时改文件
- 不接 DeepSeek
- 不让 Maestro 自动 merge

成功标准：

- 能在 Maestro 里完整看见一次 agent 工作记录
- 没有破坏当前 repo
- 你觉得“任务上下文不容易丢”

---

## Day 2：两个 worktree 并行，但只做低风险任务

目标：验证并行开发是否真的减少等待。

建议创建两个 Maestro worktree：

### Worktree A：前端 lint 修复

Agent：Claude Code 或 Codex  
分支建议：`codex/fix-frontend-lint`

任务范围：

- `frontend/src/components/ExcavationView/index.tsx`
- `frontend/src/components/shared/CameraGestureController.tsx`
- `frontend/src/components/shared/ScanProgress.tsx`
- 其他 lint 报错文件

验证：

```bash
cd frontend
npm run lint
npm run build
```

禁止：

- 不改产品视觉方向
- 不重构路由
- 不改后端

### Worktree B：trash 自动清理错误调查

Agent：Codex  
分支建议：`codex/fix-auto-purge-audit`

任务范围：

- `backend/staging.py`
- `tests/test_decision_staging.py`

背景：

`data/audit.jsonl` 里出现多次：

```text
auto_purge_expired: bad parameter or other API misuse
```

验证：

```bash
.venv/bin/python -m pytest tests backend/test_*.py
.venv/bin/python -m compileall backend
```

禁止：

- 不运行真实 purge
- 不对 `/Volumes/...` 做文件操作
- 测试必须用 `tmp_path`

Day 2 成功标准：

- 两个任务能并行推进，互不踩文件
- 每个 agent 输出 changed files、verification、risk
- 主控能分别 review 两个 diff

---

## Day 3：引入 Cheap Worker，但只做只读/文档任务

目标：测试 DeepSeek / OpenCode 这类便宜模型是否适合承担低风险工作。

建议任务：

### Cheap Worker Task 1：整理项目任务池

只读输入：

- `DEVLOG_20260523.md`
- `AGENT_LOG/STATUS.md`
- `CODEX_TASKS.md`
- `BUG_REPORT.md`

输出文件建议：

- `docs/TASK_BACKLOG.md`

输出结构：

- `Now`
- `Next`
- `Later`
- `Blocked`
- 每个任务标注：owner、risk、files、verification

限制：

- 只允许改 `docs/TASK_BACKLOG.md`
- 不允许改源码

### Cheap Worker Task 2：生成 EXIF schema migration 草案

只读输入：

- `backend/database.py`
- `backend/scanner.py`
- `DEVLOG_20260523.md`

输出文件建议：

- `docs/EXIF_SCHEMA_PROPOSAL.md`

要求：

- 只写方案，不改代码
- 列出新增字段、迁移策略、回填脚本、测试计划
- 标注风险：旧数据、RAW EXIF 读取、扫描耗时

Day 3 成功标准：

- Cheap Worker 能完成文档类工作
- 输出质量足够让 Claude/Codex 继续执行
- 没有引入源码噪音

---

## 推荐任务模板

给 Maestro agent 派任务时，尽量用这个格式：

```markdown
## Goal
一句话说明任务目标。

## Context
必须读取的文件：
- ...

## Allowed files
只能修改：
- ...

## Forbidden
禁止：
- ...

## Implementation notes
已有约束、设计方向、边界条件。

## Verification
必须运行：
- ...

## Final response
请列出：
- changed files
- verification result
- remaining risks
```

---

## 第一批推荐并行任务

优先级从高到低：

1. `fix-auto-purge-audit`
   - Owner：Codex
   - 风险：中
   - 原因：audit log 已有真实错误，需要优先确认 trash 自动清理可靠。

2. `fix-frontend-lint`
   - Owner：Claude Code / Codex
   - 风险：低到中
   - 原因：build 通过但 lint 失败，后面多人协作会放大噪音。

3. `exif-schema-proposal`
   - Owner：Cheap Worker
   - 风险：低
   - 原因：为《哈扎尔词典》做准备，但先只写方案。

4. `preview-generation-plan`
   - Owner：Cheap Worker
   - 风险：低
   - 原因：剩余约 12k 预览未生成，需要磁盘预算和分批策略。

5. `playwright-smoke-test`
   - Owner：Codex / QA Agent
   - 风险：中
   - 原因：现在 `check_all.sh` 不能覆盖真实前端交互。

---

## 合并规则

每个 worktree 完成后，主控必须检查：

```bash
git status --short
git diff --stat
git diff
```

后端任务至少跑：

```bash
.venv/bin/python -m pytest tests backend/test_*.py
.venv/bin/python -m compileall backend
```

前端任务至少跑：

```bash
cd frontend
npm run build
```

如果是 lint 任务，还要跑：

```bash
npm run lint
```

绝对不要让多个 agent 直接往同一个分支连续提交。先 worktree 分支，后 review，再合并。

---

## 什么时候不要用 Maestro

以下场景继续用主控直接做：

- 产品方向还没想清楚
- 需要大量即时审美判断
- 会移动、删除、purge 真实照片
- 任务横跨前端、后端、数据库、真实文件系统，边界不清
- bug 尚未复现，只是在猜

Maestro 适合“任务边界清楚”的执行和 review，不适合替代产品判断。

---

## 明天第一步建议

只做 Day 1。

打开 Maestro，接入当前 repo，创建一个只读任务，让一个 agent 总结项目状态。确认这个体验舒服后，再开始 Day 2 的两个并行 worktree。

这个流程的原则是：先把调度台放进工作流，再慢慢把执行迁进去。不要让工具反过来指挥项目。
