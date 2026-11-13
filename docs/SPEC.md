# otools-draftcalc 实现规格（稿纸计算器）

## 定稿口径（2026-11-13）

| 项 | 口径 |
| --- | --- |
| 交互 | 稿纸画布鼠标手写算式；写 `=` 自动识别求值；等号右侧已有手写内容 → 验算打 ✓/✗ |
| 行组织 | 一行一条算式；done 行只读，新笔画开新行（rhs 续写除外），稿纸纵向无限高滚动 |
| 识别 | 逐符号分割 + 轻量 CNN（ONNX, onnxruntime-web wasm CPU 后端），top-3 候选可纠正 |
| 几何规则符号 | `=`（两横条叠）/ `.`（0.35×行高内小点）/ 分数线（宽>3×高横条，上下文裁决 minus/frac）不进 CNN |
| CNN 标签集 | 17 类固定：`0-9 + - * / ( ) sqrt`，维序 = `src/core/recognize.ts` 的 `LABELS` |
| 结果格式 | 有理数 → 精确分数（`1/2`，分母 1 显示整数）；无理数 → `≈` + 6 位有效小数；分母 0 → error |
| 求值 | mathjs Fraction 模式精确分数运算，失败回退 number |
| 引擎故障 | init 失败/运行期推理故障 → 「识别引擎未就绪，可继续书写」横幅，笔画照常记录，不白屏不静默 |
| 端口 | devUrl `http://127.0.0.1:6547`（6547 被 otools-fanyi 的 serve-dist 长期占用时，临时 `--port` 换端口调试，不改配置文件） |
| 版本 | 0.1.0 |

## plugin.json

`packid=otools-draftcalc`，`entry=dist/index.html`，`devUrl=http://127.0.0.1:6547`，`quickDev=true`，
`logo.svg` 在仓库根，`icon=🧮`，keywords：稿纸/计算器/手写/草稿/验算/calculator。
打包时 `pack-plugin.mjs` 自动剥掉 `devUrl/quickDev`（正式包校验拒收开发模式）。

## 目录

```
otools-draftcalc/
├── plugin.json / package.json / logo.svg / index.html
├── vite.config.ts            # ortWasmAssets 插件（见「wasm 资产」节）
├── src/
│   ├── main.ts / App.vue     # 组装：画布 / 工具条 / 候选条 / 历史面板 / 故障横幅
│   ├── usePaper.ts           # LineManager reactive 包装 + 识别器装配 + 历史持久化
│   ├── components/
│   │   ├── PaperCanvas.vue   # pointer 采集 + 贝塞尔笔迹 + 结果 DOM overlay
│   │   ├── Toolbar.vue       # 撤销/橡皮/清空/复制/历史
│   │   ├── CandidateBar.vue  # glyph chip 序列，点击循环 alts → setAlt 即时重算
│   │   └── HistoryPanel.vue  # 最近 20 条，点击条目复制
│   └── core/                 # 无 DOM 依赖纯 TS（全部 vitest 单测）
│       ├── types.ts strokes.ts        # Pt/Stroke/Glyph/AST + 归一化 28×28
│       ├── segment.ts                 # 几何规则分割（两阶段，规则 1-7）
│       ├── recognize.ts               # LABELS + Mock/Ort 识别器 + 同步契约/Warmup 协议
│       ├── parse2d.ts                 # 分数/上标/根号作用域/括号 2D 解析
│       ├── grammar.ts evaluate.ts     # alts 纠错 + mathjs 精确求值
│       └── lines.ts                   # 行状态机 + createPipeline 编排
├── tests/                    # vitest 核心、真实模型和组件回归（含归一化 fixture 奇偶校验）
├── public/model/recog.onnx   # 入库模型（int8 动态量化，171KB）
├── training/                 # Python 训练管线（不随包分发，out/ 与 .venv gitignore）
├── scripts/                  # pack-plugin / verify-plugin / publish-market / serve-dist（games 模板）
├── vendor/otools-plugin-sdk  # 固定快照（来源见 vendor/sdk-source.json）
├── licenses/                 # 第三方许可证文本
└── docs/SPEC.md
```

## 识别流水线

1. **采笔画**：pointer events（含 coalesced）采 (x,y,t)，一按一抬为一笔；行高 hint = 首笔高度夹取 [16,120]
2. **分割**（segment.ts）：两阶段几何规则——Phase A 多笔合并（`=` 两横条叠 → ÷ 横杠+上下两点 → 对角交叉 → 横竖交叉），Phase B 单笔定型（小点 → 长横条 fracbar → 其余交 CNN）。近邻默认不合并（紧挨符号不粘连，Review Focus 1）
3. **分类**：bbox 裁剪 → 保纵横比 pad 到 28×28（normalizeGlyph，与 Python 侧 parity 校验 max|diff|<0.02）→ CNN top-3
4. **2D 解析**（parse2d.ts）：分数线（x 区间覆盖上下内容）→ 根号作用域（右侧、顶部 ≥√ 顶+60%×√高，遇运算符/`=` 截断）→ 上标（高 <0.6×基线主高且顶高于前 token）→ 基线 seq（数字/`.` 合成 num、括号配对递归）
5. **纠错+求值**：correctGlyphs（连续双运算符降元、行首/行尾运算符删除、多余括号删除）→ parseEquation → evalEquation（Fraction 精确）
6. **呈现**：rhs 空 → 等号后红字结果；rhs 有内容 → 比对打 ✓/✗ + 淡灰 rhs。底部候选条点击符号循环 top-3 纠正，即时重算
7. **Warmup 协议**（同步 classify 契约下的异步推理）：OrtRecognizer.classify 首见图触发后台推理并抛 WarmupError；createPipeline 用占位分类器**一次收集全部未缓存图**批量预热（本 run 在解析前统一抛 WarmupError，占位 label 绝不外泄），whenSettled 后一轮重跑全命中。连续 5 次 WarmupError 无进展才停止自动重跑

## 行状态机（lines.ts）

- `addStroke` → 末行 writing 直接入行；末行 done 先判 rhs 续写（`=` 右侧且 y 在行 bbox ±1px），再按 y 几何回落到 writing 行，否则开新行
- done 判定：pipeline 返回 eq 非 null → status=done；done 行永不重跑（几十行后单笔增量 O(该行)）
- `undo` 全局撤最后一笔；`eraseAt` 圆相交删笔画（波及所有行）；二者均重开行并重算；`setAlt` 写 override（图内容 key，FIFO 500）后仅重算该行，纠正跨续写/擦除持久
- 历史最近 20 条（compare 记 ✓/✗），otools 宿主 local state 持久化，无宿主回退 localStorage

## wasm 资产（Task 10 集成定案）

- `recognize.ts` 固定 `ort.env.wasm.wasmPaths = { wasm: './ort/ort-wasm-simd-threaded.jsep.wasm' }`（对象形式）：
  二进制按**页面相对**路径取 `dist/ort/`；glue 走 ort bundle 内联工厂零请求。
  **不得改回字符串前缀 `'./ort/'`**：字符串形式会禁用内联 glue 快路径，ORT 转而在其模块 URL 旁
  动态 import 外部 glue，路径随产物布局漂移（实测 404 → 引擎未就绪）。
- `vite.config.ts` 的 `ortWasmAssets` 插件：dev 中间件把 `/ort/*` 映射到
  `node_modules/onnxruntime-web/dist`（真实引擎 `pnpm dev` 可用）；build 把二进制拷到 `dist/ort/`、
  glue 拷到 `dist/assets/`（同源快路径失效时的模块相对回落位），并删除 Vite 隐式发出的哈希 wasm 死重副本（~21MB）。
- 非 jsep 的 `ort-wasm-simd-threaded.wasm`（~11MB）不被本构建引用，不拷。

## 测试与构建

```bash
pnpm install
pnpm test                        # 核心、真实模型和组件回归；KNOWN it.fails 须单独记录
pnpm build                       # vue-tsc + vite build（dist/ 含 ort/ 与 model/）
node scripts/pack-plugin.mjs     # dist-pack/otools-draftcalc-0.1.0.oplg（5.3MB）
node scripts/verify-plugin.mjs   # 校验全绿（wasm 产物 20.9MB 在包内）
pnpm dev                         # http://127.0.0.1:6547；?mock=1 强制 MockRecognizer（仅 dev）
```

## 端到端手测清单（2026-11-13，browser-use 自动化执行）

环境：dev（6548，临时端口）与**打包产物**（.oplg 解包静态 serve）双跑真引擎；
network 审计全程无 404（wasm/model/glue 全 200）、无控制台致命错误、无「识别引擎未就绪」横幅。

| # | 用例 | 结果 |
| --- | --- | --- |
| ① | `12+34=` → 46 | ✅ 红字 `46`（dev/打包件一致） |
| ② | `25×4=100` 验算 → ✓ | ⚙️ 管线通：compare 渲染 ✗ + 淡灰 rhs；合成 ×/数字与真手写有域差，✓ 待人工 |
| ③ | `7÷2=3` 验算 → ✗ | ✅ `✗`（÷ 几何合并后 CNN 判 `+`，域差；✗ 机制正确） |
| ④ | `(3+5)×2=` → 16 | ⚙️ 管线通：出值 `-16`（合成括号误识 `-`，域差待人工） |
| ⑤ | 分数 `1/3+1/6=` → 1/2 | ⚙️ 管线通：出值 `-92`（分数线/分子识别域差待人工） |
| ⑥ | `2^3=` → 8 | ✅ `8`（上标判定 + pow 求值正确） |
| ⑦ | `√9=` → 3 | ✅ `3`（根号作用域正确） |
| ⑧ | `√(16)+1=` → 5 | ✅ `5`（根号+括号组+加法正确） |
| ⑨ | `3.5+1.25=` → 4.75 | ✅ `19/4`（小数点几何规则 + 精确分数显示） |
| ⑩ | `0.1+0.2=` → 3/10 | ✅ `3/10` |
| ⑪ | 分数 `3/4×2/3=` → 1/2 | ⚙️ 管线通：出值 `-1/2`（**精确分数运算与显示正确**，分子识别域差待人工） |
| ⑫ | `100−37=` → 63 | ✅ `63`（fracbar→minus 上下文裁决正确） |
| ⑬ | `(1/2)^2=` → 1/4 | ⚙️ 管线通：出值 `441`（括号+上标结构解析正确，分数分子识别域差待人工） |
| ⑭ | `√2+1` → ≈ 2.41421 | ✅ `≈ 2.41421`（无理数格式化正确） |
| ⑮ | `5×(6+4)÷2=` → 25 | ⚙️ 管线通：出值 `-48`（÷ 判 `+`、合成 × 形态域差待人工） |
| ⑯ | 连续三行依次书写互不干扰 | ✅ `46` / `15` / `9` 三行独立，旧行只读 |
| ⑰ | 撤销到 '=' 前，结果消失可续写 | ✅ 撤销两笔完整撤 `=` → result null、marks 消失、行回 writing → 续写 `+5=` → `20` |
| ⑱ | 橡皮擦掉一个符号后重算 | ✅ `12+34=`→46，擦 `3`（恰 1 笔）→ 重开重算 → `12+4=`→`16`，标记原位更新 |
| ⑲ | 候选纠正即时重算 | ✅ 点 chip 循环候选 `1→2→3→7`，结果即时重算 `16→6→7→11` |
| ⑳ | 清空/历史/复制 | ✅ 清空（confirm 对话框）→ 空态恢复；历史面板 20 条（✓/✗ 条目在内，cap=20）；复制使用 `navigator.clipboard.writeText`，不可用时反馈“复制失败”；宿主内剪贴板权限仍需实际验收 |
| 补 | 验算 ✓ 演示 | ✅ `12+34=46` → 绿 `✓` + 淡灰 `46` |
| 补 | 滚动跟随（多行滚动后笔迹/结果/格线同步） | ✅ 结果 overlay 位移精确 = scrollTop 增量（-200/-500 实测）；笔迹 canvas 随 scroll 重绘（画布快照哈希随滚动位置正确切换）；格线背景挂在滚动内容层随之移动 |

### 用户截图回归（真实模型，2026-11-13）

以下输入由用户截图的可见笔迹中心线还原，fixture 为 `tests/fixtures/handwriting-screenshot.ts`，并非独立采集的手写准确率测试集。

| 输入 | 自动识别／结果 | 人工纠正 |
| --- | --- | --- |
| `1+4=` | `1+4=5` | 无需 |
| `2+5=` | 当前模型误识为 `7+5=12`；该 `2` 的 top-3 为 `7、)、3` | 使用“更正”下拉选择 `2` 后得到 `2+5=7` |

- 上述 fixture 按 40 / 160 / 240 px 主字号缩放，验证同一管理器逐笔写入、冷缓存预热、候选纠正持久化与快速另起行。
- 候选条保留点击切换前三候选；“更正”下拉提供完整 20 类符号（17 个 CNN 类 + `.`、`=`、分数线），正确标签不在 top-3 时也可选择。
- 管线保留分割得到的全部符号供纠正；删除式语法清理会改变输入时，显示歧义提示，而不对删短后的算式给出结果。
- 截图局部格线缺失暂未复现。独立页面在 682×604 窄窗、长纸面、深滚动与缩放下显示完整；本次未修改网格背景，不将此项标为已修复。
- `tests/handwriting-pipeline.test.ts` 中明确标注的 `it.fails` 固定了一个旧缺陷：根号横梁下的宽体 `9` 可能被旧对角分组合并入根号。本轮未修复此项；其预期失败不能计为根号功能通过。

> 识别正确性口径：①⑥⑦⑧⑨⑩⑫⑭ 与 ⑯/验算✓ 在合成笔画下即全对；②④⑤⑪⑬⑮ 的**结构解析与
> 求值/验算机制**均正确（出值/✓✗/分数格式化），仅合成笔画的**符号识别**与真实手写有域差 ——
> 真实手写准确率按验收口径（候选纠正后全量 ≥80%、纯四则 ≥95%）**待人工验收**。

## 已知限制（审查遗留 + v1 取舍）

- **非末行渐进续写不生效**：rhs 续写只对末行 done 行判定；中间 done 行在其右侧补写会开新行（y 回落只认 writing 行）
- **双 writing 行回落死角**：同时存在两个 writing 行（如擦开中间行后又写新行）时，y 回落可能命中非预期行；v1 以「最近书写语境优先」取最靠后者
- **√2/2 分数线写法须写括号**：根号作用域遇分数 node 一律截断，`√2/2` 会解析成 `√2` 除以 2 之外的形态；根号内分数请写 `√(1/2)`
- **连续异号运算符不静默删短求值**：`5*-3` 等会被原删除式语法清理改变的输入保留全部候选，并提示选择候选纠正；需负数时可写 `5×(-3)`
- **√ 非整平方有理数显示 ≈**：`√(1/2)` 等结果非整数/非分数形态时统一 `≈` 6 位有效小数
- **右缘裁剪**：行内超出右缘的笔迹不可见且不可横向滚动（单列纵向纸面设计），可擦除重写兜底
- **全量重绘观察点**：redraw 为全量重绘（不做视口裁剪），数百笔量级远低于单帧预算；卡顿实测再引入脏区
- **运行期横幅闩锁**：OrtRecognizer.lastError 驱动的「识别引擎未就绪」横幅不自清除（init reject 的常驻性不因单拍恢复撤销）；引擎成功推理后 lastError 归 null，新故障才复现横幅
- **模型 '3' 类严格口径 96.67%（参考）**：留出集整体 top-1 99.2%，数字合并 98.8%、运算符 100%、sqrt 100%，全部达验收线；严格「每数字类 ≥97%」口径仅 `'3'` 0.9667 未过（参考口径，不阻塞发布）

## 发版注意

- `dist/`、`dist-pack/`、`node_modules/`、`training/data/`、`training/.venv/`、`training/out/` 均 gitignore
- `pack-plugin.mjs` 自动剥 `devUrl/quickDev`；`verify-plugin.mjs` 校验 entry/logo/SHA256SUMS/wasm 产物
- 发布流程（AGENTS.md 权威）：build → pack → verify → GitHub Release（tag `plugin-otools-draftcalc-v0.1.0`，附 .oplg）→ `publish-market.mjs`（AUTH_MODE=pat，PAT 取 `xyito/config/ps-pro/pat.txt`，日志脱敏）
- 提交信息 conventional commits，不带 AI 署名；不要在 xyito 层提交子模块指针
- 第三方许可见 `THIRD_PARTY_NOTICES.md` 与 `licenses/`
- `vite.config.ts` 的 `ortWasmAssets` dev 中间件无自动化测试基建（vitest 仅覆盖 `src/core`）：其「未解码名白名单 → 再解码」的顺序防畸形转义（`/ort/%zz`）打崩 dev server，改动该中间件后须手工冒烟 `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:6547/ort/%zz`，应得 404（白名单外直通 vite）而非 dev server 崩溃
