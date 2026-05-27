# VLM 视觉模型对比报告

**测试日期：** 2026-05-26  
**测试规模：** 各 100 张照片  
**Mac 配置：** Apple M3 · 24GB 统一内存 · Ollama 0.24.0

---

## 一句话结论

**Qwen2.5-VL-3B 可用，质量够产品使用；MiniCPM-V 4.6 被 Ollama 版本卡住无法运行。两阶段方案暂时挂起，先修 Ollama 版本兼容性，再决定是否需要粗筛层。**

---

## 一、MiniCPM-V 4.6（1.3B）—— 完全失败

**结果：** 100/100 失败  
**根因：**

```
llama_model_load: unknown model architecture: 'qwen35'
failed to create server model=openbmb/minicpm-v4.6:latest
```

MiniCPM-V 4.6 的 LLM 底座是 Qwen3.5-0.8B，其 GGUF 文件内写的架构名是 `qwen35`。当前 Ollama 0.24.0 尚未收录这个架构，因此每次推理请求都返回 HTTP 500。模型文件本身已成功下载（1.6GB），是运行时的兼容性问题，不是下载问题。

**修复路径：**
```bash
brew upgrade ollama   # 升级到支持 qwen35 架构的版本
```
升级后无需重新下载模型，`ollama list` 里的 `openbmb/minicpm-v4.6:latest` 仍然可用。

---

## 二、Qwen2.5-VL-3B —— 完全成功

### 基础指标

| 指标 | 数值 |
|---|---|
| 成功率 | **100/100（0 错误）** |
| 平均推理 | **9.8s / 张** |
| 最快 | 5.0s |
| 最慢 | 23.3s |
| 总运行时间 | **~16 分钟** |
| 输出文件 | `data/tags_qwen.json`（45KB） |

### 标签分布

**场景（setting）**

| 标签 | 数量 |
|---|---|
| outdoor | 58 |
| indoor | 42 |

合理。个人摄影室内外基本均衡。

**时段（time_of_day）**

| 标签 | 数量 |
|---|---|
| unknown | **40** |
| afternoon | 30 |
| evening | 15 |
| night | 10 |
| dawn | 2 |
| morning | 2 |
| daytime ⚠️ | 1 |

**问题：** `unknown` 占 40%——室内照片无明显光线线索时模型放弃判断，可以接受。`daytime` 是词汇表外的幻觉词，出现 1 次，需要在标准化层过滤。

**主体（main_subject）**

| 标签 | 数量 |
|---|---|
| portrait | **49** |
| landscape | 23 |
| abstract | 10 |
| street | 7 |
| nature | 7 |
| architecture | 4 |

`portrait` 占近一半——和个人相册以人为主体的拍摄习惯一致，不算偏差。

**构图（composition）**

| 标签 | 数量 |
|---|---|
| centered | 53 |
| complex | 44 |
| minimal | **3** |

⚠️ `minimal` 仅 3 张，`centered`/`complex` 几乎平分——构图感知过于二元化，这个字段的区分度较弱，后续可考虑删除或重定义。

**情绪（mood）**

```
melancholic: 7  · joyful: 3  · mysterious: 2  · peaceful: 1
```

⚠️ 情绪标签极度稀疏（大多数照片 mood 字段为空或只有 1 个），且有格式问题（见下）。

**色调（dominant_colors）**

```
neutral: 11 · colorful: 7 · warm: 3 · monochrome: 3 · cool: 2
⚠️ 越界词：'black', 'red' 各 1 次
```

---

### 叙事提示质量（最重要的字段）

从 100 张中抽 15 个样本：

| 年份 | 相机 | narrative_hint |
|---|---|---|
| 2026 | X-T4 | 秋天的公园里，人们在五彩斑斓的树叶中合影 |
| 2023 | X-T4 | 咖啡馆内部，模糊的人影 |
| 2018 | RX100 | 博物馆内，女子坐在长椅上 |
| 2023 | X-T4 | 夕阳下的砖墙建筑 |
| 2025 | RX100 | 城市街道上的狗 |
| 2024 | X-T4 | 一个人在户外的风景中低头沉思 |
| 2024 | X-T4 | 夜晚草地上的女性脚部特写 |
| 2026 | X-T4 | 海滩上的孩子们 |
| 2025 | RX100 | 城市建筑细节 |
| 2024 | X-T4 | 夜晚的优雅女子 |

**评价：** 质量达到预期。每句不超过 15 字，有具体场景感，能作为叙事触发器使用。部分（如"城市建筑细节"）偏泛，但总体可用。**narrative_hint 是这次测试中最有价值的字段。**

---

## 三、数据质量 Bug（需修复 tag_photos.py）

### Bug 1：列表字段类型不一致

模型有时把 `mood` 和 `dominant_colors` 返回为字符串而非数组：
- 正确：`"mood": ["melancholic"]`  
- 错误：`"mood": "melancholic"`（模型忘了加方括号）

**修复位置：** `backend/scripts/tag_photos.py` → `normalized_tags()` 函数，加一行类型规范化：

```python
def normalized_tags(parsed: dict) -> dict:
    tags = empty_tags()
    for field in TAG_FIELDS:
        val = parsed.get(field)
        # 列表字段：如果返回了字符串，包裹成列表
        if field in ('mood', 'dominant_colors') and isinstance(val, str):
            val = [val] if val else []
        tags[field] = val
    return tags
```

### Bug 2：词汇表越界词未过滤

出现了 `daytime`（应为 unknown）、`black`/`red`（不在颜色表）、`quiet/intimate`（复合词）。
**修复：** 在 `normalized_tags()` 里加一个枚举白名单过滤，越界词映射到 `unknown`/`None`。

---

## 四、系统负载报告

| 阶段 | 时间 | 关键指标 |
|---|---|---|
| 基线（推理前） | 21:20 | 空闲内存 ~52MB · wired 884MB · load 5.7 |
| Qwen 模型加载 | 21:22 | **wired 骤升至 3536MB**（+2.6GB）· 内存压力 **8%**（最低点） |
| 稳定推理期 | 21:23–21:38 | 空闲 14–26MB · wired 3450–3540MB · load 4–11 |
| 完成后 | 21:39 | 空闲恢复 **2735MB** · wired 826MB · Ollama 完全释放 |

**解读：**

- **加载冲击大，稳定后内存安全。** Qwen 3B 模型文件全量加载进 Metal GPU 内存后，wired 内存持续占用约 2.6GB，全程不释放（直到 `pkill ollama`）。8% 空闲内存的瞬间压力是模型首次加载时发生的，之后系统稳定维持在 19–24% 空闲。
- **推理 CPU 占用低。** Ollama 进程 CPU 率平均约 3–6%，实际计算在 Metal GPU 上完成，CPU 只做调度。
- **无 swap，无崩溃。** 整个推理过程中系统未触发 swap，也未出现内存压力报警。M3 + 24GB 对 3B 模型来说完全充裕。
- **MiniCPM 阶段不占内存。** 100 次 HTTP 500 立即返回，没有实际加载模型，因此负载图上那段空白是轻量的错误响应阶段。

---

## 五、两阶段方案的时间账

### 现实：全量 46K 张的时间估算

| 方案 | 每张耗时 | 总时长 |
|---|---|---|
| Qwen 3B 全量 | 9.8s | **~125 小时（5.2 天）** |
| MiniCPM 粗筛（待修复） | 预估 ~2–4s | ~34–67 小时 |
| 两阶段：MiniCPM 全量 + Qwen 30% | ~2s + ~3s×30% | **~40 小时** |

**结论：** 只用 Qwen 跑全量 46K 完全不现实（5 天）。两阶段方案在 MiniCPM 修好后的时间成本约 40 小时，可在后台分批过 2–3 个晚上完成。

### 替代方案

如果 Ollama 升级后 MiniCPM 仍有问题，备选轻量粗筛模型：
- **moondream2（1.8B）**：Ollama 官方原生支持，预估 3–5s/张
- **llava-phi3（3.8B）**：质量接近 Qwen，速度略慢

---

## 六、产品决策建议

**立刻可以做：**

1. `brew upgrade ollama`——解锁 MiniCPM，几分钟的事
2. 修 `tag_photos.py` 的两个 bug（类型规范化 + 越界词过滤）
3. 清理 `data/tags_minicpm.json`（100 条全是空数据，没有价值）

**确认后再推进：**

4. MiniCPM 跑通后，在同样 100 张上重测——验证粗筛质量和速度，再决定要不要两阶段
5. 全量 46K 推理建议分批跑（每批 5K）、夜间后台运行、每批结束确认无误再继续

**哈扎尔词典的直接收益：**

有了 `narrative_hint` + `main_subject` + `mood`，词典可以新增：
- **主体词条**：所有 `portrait` 照片入"人的痕迹"；所有 `landscape` 入"无人之境"
- **情绪词条**：所有标了 `melancholic` 的照片入"忧郁时刻"
- **叙事词条（最有意思）**：用 `narrative_hint` 聚类——"夕阳下的建筑"们集合在一起，这才是字典的真正质感

---

*报告生成时间：2026-05-26 · 数据来源：data/tags_qwen.json · 系统日志：logs/system_load_*.log*
