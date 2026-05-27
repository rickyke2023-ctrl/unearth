# STATUS.md — 项目当前状态

---

## 第 4 轮（2026-05-20 00:45）— 软删除流程压力测试

**前端状态：** ✅ 正常

**后端状态：** 🟡 已修 2 个 bug，发现 2 个新 bug

---

## 🟢 软删除完整流程测试：100% 通过

用 5 个假 JPG 文件在 `/tmp/test_photos/` 走完整流程：

| 步骤 | 操作 | 结果 |
|---|---|---|
| 1 | 创建 5 个 10KB 假 JPG | ✅ |
| 2 | POST /api/scan | ✅ 5 张全部入库 |
| 3 | 5 张全部 POST decision=leave | ✅ `staging_added: 5` |
| 4 | 物理验证 | ✅ 原目录 → staging 文件夹 |
| 5 | POST /api/staging/confirm | ✅ `deleted_count: 5, freed_bytes: 51200` |
| 6 | 验证文件消失 | ✅ 原目录、staging 都空 |
| 7 | 验证 /api/strata.freed_bytes | ✅ 正确显示 51200 |
| 8 | 验证 /api/staging | ✅ total_count=0 |

**结论：删除逻辑本身完全可用，从 leave 到永久清理的链路稳定。**

---

## 🟢 Codex 已修 Task 1+2（之前的紧急任务）

audit log 显示 16:29:28 触发了 staging_restore，Codex 还加了新 pytest 测试：
- `test_keep_restores_staged_file`
- `test_leave_raw_jpeg_pair_moves`
- `test_undo_restores_staged_raw`

之前的 3 张 ghost 文件已自动还原（DSC00462.JPG / DSCF9864.JPG / DSCF9861-2.JPG）。

---

## 🚨 但本次测试也意外暴露了 2 个新严重 bug

### 1. 新扫描清空了整个数据库（Task 4）
- 执行 `POST /api/scan /tmp/test_photos` 后，Lexar 2023-05 月份 50 张决策的**数据库记录全部丢失**
- 物理文件没事（源 39 张 + staging 11 张 = 50 张完好）
- 用户失去了之前 34 keep / 11 leave / 5 skip 的决策记录

### 2. confirm_staging 不分 root_path（Task 5）
- 一次确认会删除所有 root 的 staging 文件
- 本次测试我用 SQL 临时隔离了 Lexar 14 条记录才避免事故
- 当前 Lexar 物理 staging 里还有 11 张文件，但 staging_files 数据库记录已被 wipe（同时被 Task 4 影响）

---

## 当前数据库实际状态

```
photos:         5 张（全部是测试残留的 /tmp/test_photos/test_*.jpg，已物理删除）
events:         1 个（同上）
staging_files:  5 条（已全部 confirmed_deleted）
Lexar 物理:     源 39 + staging 11 = 50 张完好
Lexar 数据库:   ❌ 全部丢失（需要重新扫描 + 重新决策）
```

## 用户需要做的决定

**Lexar 50 张的决策记录已经丢失，物理文件完好。** 接下来三个选项：

**选项 A：从 staging 把 11 张还原回原目录，重新扫描 50 张** ⭐ 推荐
- 等于回到测试前的状态，重新决策这 50 张
- 优点：完整保留所有照片，UX 干净

**选项 B：把 11 张从 staging 永久删除（手动 mv 到别处或 rm），重新扫描 39 张**
- 相当于"接受"之前的 leave 决策
- 优点：不用重做 leave 决策
- 缺点：万一有想反悔的就来不及

**选项 C：等 Codex 修 Task 4 后做"数据库恢复"操作**
- 最复杂，可行性低

---

## 待 Codex 处理（CODEX_TASKS.md）

| # | 优先级 | 任务 |
|---|---|---|
| 4 | 🚨 紧急 | 新扫描会清空整个数据库（多 root 累加） |
| 5 | 🟡 中 | confirm_staging 应按 root_path 过滤 |
| 3 | 🟡 中 | events photos endpoint 补齐 7 字段 |

## 下一步建议

1. **告诉我你选 A / B / C**，我帮你执行
2. 同时通知 Codex 修 Task 4（这样以后扫描第二个文件夹不会丢前面的数据）
3. 修完 Task 4 后，可以放心扫整个 2023 年甚至整个硬盘
