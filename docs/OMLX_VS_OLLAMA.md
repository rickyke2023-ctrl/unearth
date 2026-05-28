# oMLX vs Ollama Gemma4 Benchmark

生成时间：2026-05-29  
机器：MacBook Air M3, 24GB RAM, 512GB SSD  
测试集：`data/benchmark_set.json` 固定 30 张照片  
Prompt：复用 `backend/scripts/tag_photos.py` 的 `PROMPT` 常量  
图片输入：复用 `encode_preview()`，512x512 JPEG base64

## 环境与模型

- oMLX：v0.3.12，安装自 GitHub release 的 `oMLX-0.3.12-macos26-tahoe.dmg`。
- oMLX API：`http://localhost:8000/v1/chat/completions`，OpenAI-compatible。
- 实际 benchmark 模型：`mlx-community/gemma-4-e4b-it-4bit`。
- oMLX 服务内模型 id：`gemma-4-e4b-it-4bit`。
- 模型落盘目录：`~/.omlx/models/mlx-community/gemma-4-e4b-it-4bit`。

模型选择说明：

- 先测试了 `mlx-community/gemma-4-e4b-4bit`，但 smoke test 返回 `400 Bad Request`：`tokenizer.chat_template is not set`。这是非 instruct/chat 版本，不适合本次 chat/VLM benchmark。
- 改用 `mlx-community/gemma-4-e4b-it-4bit`。Hugging Face 页面标记为 MLX、4-bit、Any-to-Any，大小约 5.22GB，并说明它由 `google/gemma-4-e4b-it` 经 `mlx-vlm` 转换。
- oMLX v0.3.12 release notes 提到调整了 memory guard，对 memory-tight Macs 更友好；这与 24GB MacBook Air 场景匹配。

参考：

- https://huggingface.co/mlx-community/gemma-4-e4b-it-4bit
- https://github.com/jundot/omlx/releases/tag/v0.3.12

## 结果文件

- Ollama baseline：`data/benchmark_results/gemma4_e4b.json`
- oMLX benchmark：`data/benchmark_results/omlx_gemma4.json`
- oMLX log：`logs/bench_omlx.log`
- 脚本：`backend/scripts/run_benchmark_omlx.py`

## 核心指标

| 指标 | Ollama `gemma4:e4b` | oMLX `gemma-4-e4b-it-4bit` |
|---|---:|---:|
| JSON 解析成功率 | 30/30 (100%) | 30/30 (100%) |
| 平均推理时间 | 60.7s | 10.3s |
| 最快 / 最慢 | 42.4s / 84.6s | 6.1s / 15.4s |
| 相对速度 | 1.0x | 5.9x |
| 时间降低 | - | 83.1% |
| narrative_hint 空值数 | 0 | 0 |
| 所有 TAG_FIELDS 原始字段齐全 | 未记录 | 30/30 |

结论：在这组 30 张固定照片上，oMLX 的速度提升远超过 20-40%，达到约 5.9x。JSON 合规率没有退化，仍为 100%。

注意：完整 benchmark 前做过 1 张 smoke test，因此 oMLX 完整 30 张是在模型已热加载状态下跑的。对 1998 张批处理场景，这更接近真实长期运行状态；冷启动 smoke test 单张为 14.9s，仍明显快于 Ollama baseline。

## 字段完整率

以下统计为 normalized `tags` 非空数量。`people_description`、`weather`、`color_detail` 在 prompt 中允许为 `null`，所以非 30/30 不一定是错误。

| 字段 | Ollama | oMLX |
|---|---:|---:|
| has_people | 30/30 | 30/30 |
| people_count | 30/30 | 22/30 |
| people_description | 20/30 | 20/30 |
| main_subject | 30/30 | 30/30 |
| setting | 30/30 | 30/30 |
| light_quality | 30/30 | 30/30 |
| weather | 17/30 | 18/30 |
| time_of_day | 30/30 | 30/30 |
| dominant_colors | 30/30 | 30/30 |
| color_detail | 25/30 | 15/30 |
| mood | 30/30 | 30/30 |
| composition | 0/30 | 30/30 |
| narrative_hint | 30/30 | 30/30 |

oMLX 的 `composition` 明显更符合 enum；Ollama baseline 的 `composition` 在 normalized 后为 0/30，延续既有报告里的枚举过滤问题。

## narrative_hint 示例

| photo_id | Ollama | oMLX |
|---|---|---|
| `48420678` | 身着深色衣物的男子，在古道上停下，举着相机，左侧可见光秃的树枝。 | 嶙峋的古迹残垣高耸在人物的身后，构成厚重的背景墙。 |
| `a2b183e1` | 深色衣物的身影，沿着泥土小路，走向远方朦胧的田野 | 他们沿着被灌木环绕的土路缓缓前行，远处的地平线在他们身后展开。 |
| `f23dede2` | 身着深色大衣的女子，侧身伫立在走廊，凝视着对面整齐的砖墙建筑。 | 女子身后的现代建筑群占据了画面的中景，背景是高耸的城市天际线。 |

## 重点案例

| 场景 | Ollama | oMLX | 观察 |
|---|---|---|---|
| 飞机窗日落 `8ddba63a` | 橙黄色的太阳缓缓沉入地平线，将温暖的光芒洒满平静的水面。 | 橙色的太阳球悬挂在圆形的窗格中央，映照着暮色。 | oMLX 更准确，避免了 Ollama 的“水面”幻觉。 |
| 白狗草地 `48d45897` | 白色的狗在开阔的草地上悠闲地行走，身后是深绿色的树木和林荫道 | 一只白色的狗安静地走在前景的草地上。 | 两者都正确；oMLX 更短。 |
| 古树鹿 `c7ae980d` | 巨大的古树投下阴影，白色的鹿在草地上悠闲吃草，背景有蓝白相间的云朵。 | 巨大的树干占据画面左侧，投下长长的阴影覆盖在前景的草地上。 | 图中确有白鹿；oMLX 没提鹿，保守但遗漏主体。 |
| 黄裙海滩 `abd2558d` | 身着黄色连衣裙的女子，坐在布满鹅卵石的沙滩上，凝视着远处平静的海浪。 | 她那双脚踝上露出白色的高跟鞋，轻轻触碰着散落的鹅卵石滩。 | oMLX 捕捉了鞋和鹅卵石细节，但主体叙事弱于 Ollama。 |
| 砖楼街道 `421e92c0` | 高耸的红砖建筑静静地两侧延伸，空旷的街道中央，一棵绿色的树木在远方等待着光线 | 远处的车停在中央的柏油路上，映衬着两侧高耸的砖墙。 | 图中确有远处车辆；oMLX 更具体。 |
| 英式街道 `267695ba` | 穿着深灰夹克的男子，低着头沿着人行道行走，背景是停靠的红色巴士。 | 两位男士伫立在街道旁，背景是现代建筑与公交车流线构成画面。 | Ollama 更具体，oMLX 偏概括。 |

## 幻觉与质量

明显幻觉：

- Ollama：`8ddba63a` 把飞机窗外天空写成“水面”。
- oMLX：本次未发现同等级明显幻觉。

oMLX 的主要质量问题不是 JSON 或识别崩溃，而是叙述风格：

- 有些 `narrative_hint` 偏构图分析，如“占据画面”“构成画面”“背景区域”，不完全符合 prompt 里“不要构图分析”的要求。
- 细节常更短、更硬，文学性和画面感弱于 Ollama 的部分样本。
- 对 `c7ae980d` 这类主体明确但环境复杂的照片，oMLX 选择保守描述树影，减少幻觉但会遗漏主体。

## 结论

值得切换进入下一阶段验证。

原因：

- 速度收益非常大：平均 10.3s vs 60.7s，约 5.9x。
- JSON 合规率保持 100%，没有复现此前 MLX/Gemma JSON 0% 合规的问题。
- `narrative_hint` 没有空值，且多数可用。

保留意见：

- 如果最终目标是高文学性标注，oMLX 的提示质量需要再抽样复核。
- 不建议修 prompt 后再和本次 benchmark 混比；如果要优化 oMLX 文风，应另开 v1.2 prompt 对比实验。
- 对 1998 张正式跑之前，建议先跑 100 张 warm-state validation，重点看 `narrative_hint` 是否过度构图化。
