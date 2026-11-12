#!/usr/bin/env node
/**
 * wasm 冒烟断言（P0 防回归）。
 *
 * 用与插件运行时完全相同的路径加载并推理一次：
 *   onnxruntime-web 1.22.0（仓库 node_modules）+ executionProviders:['wasm']。
 *
 * 防护目标：quantize_dynamic 若把 Conv 量化成 ConvInteger，wasm CPU 后端无此
 * 算子，InferenceSession.create / run 会抛
 *   "Could not find an implementation for ConvInteger(10)"
 * ——训练侧完整 CPU EP 支持、离线评估全绿但插件端必炸。本脚本让它当场失败。
 *
 * 用法（仓库根，node >= 22.23，全离线不走 CDN）：
 *   node training/smoke_wasm.mjs                 # 验证入库物 public/model/recog.onnx
 *   node training/smoke_wasm.mjs <model.onnx>    # 验证任意 onnx（回归复现用）
 *
 * 成功输出 "SMOKE WASM OK" 并 exit 0；失败 exit 1。
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-web';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelPath = process.argv[2] ?? path.join(root, 'public', 'model', 'recog.onnx');

// 与 src/core/recognize.ts 的 OrtRecognizer 约定一致：wasm CPU 后端；
// wasm 二进制取本仓库 node_modules（全离线，禁止 CDN 兜底）。
ort.env.wasm.wasmPaths = path.join(root, 'node_modules', 'onnxruntime-web', 'dist') + path.sep;
ort.env.wasm.numThreads = 1;

const fail = (msg) => {
  console.error(`SMOKE WASM FAIL: ${msg}`);
  process.exit(1);
};

let session;
try {
  // 与浏览器一致按字节加载（node 下不走 fs 路径解析分支，行为最接近插件端）
  const modelBytes = new Uint8Array(readFileSync(modelPath));
  session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'] });
} catch (e) {
  fail(`wasm 后端加载失败 ${modelPath} -> ${e.message}`);
}

const inputName = session.inputNames[0];
const outputName = session.outputNames[0];
const inMeta = session.inputMetadata?.find?.((m) => m.name === inputName) ?? null;
const dims = inMeta?.shape ?? [1, 1, 28, 28];
if (JSON.stringify(dims) !== '[1,1,28,28]') {
  fail(`输入形状不符契约：期望 [1,1,28,28]，实际 ${JSON.stringify(dims)}`);
}

// 确定性测试输入：中央横线笔画（minus 形），非全零以覆盖真实算子路径
const data = new Float32Array(1 * 1 * 28 * 28);
for (let c = 5; c < 23; c++) {
  data[14 * 28 + c] = 1;
}
const feeds = { [inputName]: new ort.Tensor('float32', data, [1, 1, 28, 28]) };

let out;
try {
  out = await session.run(feeds);
} catch (e) {
  fail(`wasm 推理失败 -> ${e.message}`);
}
const logits = out[outputName];
if (!logits || JSON.stringify(logits.dims) !== '[1,17]') {
  fail(`输出形状不符契约：期望 [1,17]，实际 ${logits ? JSON.stringify(logits.dims) : 'null'}`);
}
const v = logits.data;
for (let i = 0; i < v.length; i++) {
  if (!Number.isFinite(v[i])) fail(`logits[${i}] 非有限值 ${v[i]}`);
}
let argmax = 0;
for (let i = 1; i < v.length; i++) if (v[i] > v[argmax]) argmax = i;

const LABELS = ['0','1','2','3','4','5','6','7','8','9','+','-','*','/','(',')','sqrt'];
console.log(`SMOKE WASM OK: model=${path.relative(root, modelPath)} backend=wasm ` +
  `logits=[${Array.from(v, (x) => x.toFixed(3)).join(', ')}] argmax=${argmax}(${LABELS[argmax]})`);
process.exit(0);
