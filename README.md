# otools-draftcalc · 稿纸计算器

OTools 独立插件：稿纸画布上用鼠标手写算式（四则、分数、乘方、根号），写完 `=` 自动识别求值；等号右侧已有手写内容时进入验算模式，在你写的答案旁自动打 ✓ / ✗。一行一条算式，纵向滚动；识别候选可逐符号纠正，纠正后即时重算。纯前端离线运行——无网络请求、无 API key，识别模型（171KB ONNX）随包分发，浏览器内 wasm 推理。

实现规格见 `docs/SPEC.md`（定稿口径 / 识别流水线 / 行状态机 / 手测清单 / 已知限制）。

## 功能

- 手写算式：数字、小数点、`+ − × ÷`、括号、`=`，以及二维结构——分数（横线一画上下各一串）、乘方（右上角上标）、根号 `√`（含作用域）
- 写下 `=` 且右侧为空 → 自动识别求值，红字结果显示在等号后；有理数显示精确分数（`1/2`），无理数显示 `≈` + 6 位有效小数
- 验算模式：等号右侧已有手写内容 → 左侧求值与右侧识别结果比对，答案旁打绿 ✓ / 红 ✗
- 一行一条：done 行只读，新笔画自动开新行；撤销（按笔）、橡皮（拖动擦除）、清空、复制最近结果、最近 20 条算式历史（宿主本地持久化）
- 识别纠错：底部候选条逐符号点击循环 top-3 候选，纠正即时重算；纠正跨续写/擦除持久
- 识别引擎故障时出「识别引擎未就绪，可继续书写」横幅，笔画照常记录，不白屏不静默

## 开发

Node ≥22.18（工作区用 nvm Node 22.23），pnpm：

```sh
pnpm install
pnpm dev      # http://127.0.0.1:6547（devUrl 与 plugin.json 一致；被占用时临时 --port 换端口）
pnpm test     # vitest 188 项
pnpm build    # vue-tsc + vite build → dist/
```

- `?mock=1` 强制 MockRecognizer（仅 dev 生效），供无模型调试 UI 链路
- 真实引擎的 wasm/model 资产路径由 `vite.config.ts` 的 `ortWasmAssets` 保证（dev 中间件 + build 拷贝），详见 SPEC「wasm 资产」节

## 打包与校验

```sh
pnpm build
node scripts/pack-plugin.mjs      # dist-pack/otools-draftcalc-<version>.oplg（自动剥 devUrl/quickDev）
node scripts/verify-plugin.mjs    # entry/logo/SHA256SUMS/wasm 产物校验
```

## 训练管线复现（一次性，不随包分发）

Python 3.14 + PyTorch（`training/` 内 venv，产物 gitignore）：

```sh
python3 -m venv training/.venv
. training/.venv/bin/activate
pip install -r training/requirements.txt

# ① 归一化奇偶校验：Python 侧与 TS normalizeGlyph 逐点对齐（max|diff| < 0.02，不齐禁止训练）
python training/parity_check.py
# ② 合成样本：( ) sqrt × 交叉等 bhmsds 缺口类别（training/synth.py）
python training/synth.py
# ③ 训练（bhmsds 0-9 与运算符 + 合成样本，90/10 留出切分）
python training/train.py
# ④ 验收线评估（数字合并 ≥97%、+ - * / ( ) 任一 ≥90%、sqrt ≥85%，不达标 exit 1）
python training/eval.py
# ⑤ wasm 后端冒烟：onnxruntime-web CPU EP 对入库模型真实推理一遍（防量化算子坑）
node training/smoke_wasm.mjs
# ⑥ 通过后拷模型入库
cp training/out/recog.onnx public/model/recog.onnx
```

数据集：[bhmsds](https://github.com/wblachowski/bhmsds)（MIT，27k 张手写数学符号；数字直接用其 0-9，未使用 MNIST），克隆到 `training/data/bhmsds`。留出集指标与逐类口径记录在 `training/out/metrics.json`。

## 发布

按工作区 `otools/AGENTS.md` 的权威流程（不在本仓库重复）：build → pack → verify → GitHub Release（tag `plugin-otools-draftcalc-v<version>`，附 .oplg 资产）→ `publish-market.mjs`（AUTH_MODE=pat）。发布属外发操作，需用户确认后执行。

## 许可

本仓库代码随宿主插件分发；第三方组件许可见 `THIRD_PARTY_NOTICES.md` 与 `licenses/`。
