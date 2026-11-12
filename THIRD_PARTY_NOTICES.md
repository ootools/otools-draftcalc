# Third-party notices

本仓库（otools-draftcalc）分发与构建依赖的第三方组件及其许可如下；对应许可证文本存于 `licenses/`。

## 运行时依赖（随 .oplg 分发）

| 组件 | 版本 | 许可 | 用途 | 文本 |
| --- | --- | --- | --- | --- |
| [mathjs](https://github.com/josdejong/mathjs) | ^14 | Apache-2.0 | Fraction 模式精确分数求值 | `licenses/mathjs-LICENSE`、`licenses/mathjs-NOTICE` |
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) | 1.22.0 | MIT | 手写符号 CNN 浏览器内推理（wasm CPU 后端） | `licenses/onnxruntime-web-LICENSE`（该 npm 包未附带 LICENSE 文件，文本取自上游仓库标准 MIT 许可） |
| [vue](https://github.com/vuejs/core) | 3.5.27 | MIT | UI 框架 | `licenses/vue-LICENSE` |
| otools-plugin-sdk（vendor 快照） | commit 735618e（`vendor/sdk-source.json` 记录来源仓库/commit/补丁摘要） | MIT | OTools 宿主桥类型与 vite shim | `vendor/otools-plugin-sdk/LICENSE`、`licenses/otools-plugin-sdk-LICENSE` |

## 构建期依赖（不随 .oplg 分发）

[vite](https://github.com/vitejs/vite)（MIT）与 [vitest](https://github.com/vitest-dev/vitest)（MIT）仅用于构建与测试，许可证文本分别存于 `licenses/vite-LICENSE.md`、`licenses/vitest-LICENSE.md`。版本以 `pnpm-lock.yaml` 为准。

## 模型训练数据

识别模型 `public/model/recog.onnx` 的训练数据来自 [bhmsds](https://github.com/wblachowski/bhmsds)（Basic Handwritten Math Symbols Dataset，MIT，Copyright (c) 2019 wblachowski），文本存于 `licenses/bhmsds-LICENSE`。`(`、`)`、`sqrt` 三类为参数化合成样本（`training/synth.py`）。**未使用 MNIST**（数字直接取 bhmsds 的 0-9）。
