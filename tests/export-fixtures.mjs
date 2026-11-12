/**
 * 一次性生成归一化奇偶校验 fixture：tests/fixtures/normalize_case1.json
 * 供 Task 9 training/parity_check.py 做同算法比对（crop → 长边 20px → 居中 pad
 * 28×28 → 1px Bresenham 栅格化，max|diff| < 0.02）。
 *
 * 用法：node tests/export-fixtures.mjs
 * （Node >= 22.18 默认启用 TS 类型剥离，直接 import src/core/strokes.ts 真实现，
 *  不经过任何二次实现，保证 fixture 就是 normalizeGlyph 的真实输出。）
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bboxOf, normalizeGlyph } from '../src/core/strokes.ts';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * 合成笔画（与 tests/strokes.test.ts 的取材风格一致），三笔一组：
 * 1. 手绘减号——横向长条，宽 48px、y 抖动 ±1.5px（宽高比约 17:1，浅斜率分支）
 * 2. 陡斜线——dx=15、dy=40（斜率 ~2.7，Bresenham 陡线分支）
 * 3. 45° 斜线——dx=dy=20（恰踩 steep/shallow 分支边界 e2<=dx 的临界形态）
 * 非整数缩放比（bbox 50×61 → 长边 20）+ 近退化高度 + 跨取整边界 + 三种斜率分支，
 * 是归一化管线里最容易在 TS/Python 间产生偏差的路径，作为 parity 用例最有代表性。
 */
const fixtureStrokes = [
  {
    id: 0,
    pts: [
      { x: 200, y: 311.0, t: 0 },
      { x: 208, y: 310.2, t: 33 },
      { x: 216, y: 312.4, t: 71 },
      { x: 224, y: 309.6, t: 104 },
      { x: 232, y: 311.8, t: 150 },
      { x: 240, y: 310.5, t: 188 },
      { x: 248, y: 311.6, t: 220 },
    ],
  },
  {
    id: 1,
    pts: [
      { x: 200, y: 330.0, t: 300 },
      { x: 205, y: 343.3, t: 345 },
      { x: 210, y: 356.8, t: 390 },
      { x: 215, y: 370.0, t: 440 },
    ],
  },
  {
    id: 2,
    pts: [
      { x: 230, y: 330.5, t: 500 },
      { x: 237, y: 337.2, t: 540 },
      { x: 243, y: 343.9, t: 580 },
      { x: 250, y: 350.4, t: 630 },
    ],
  },
];

const strokes = fixtureStrokes;
const bbox = bboxOf(strokes);
const expected = Array.from(normalizeGlyph({ strokes, bbox }));

const ink = expected.filter((v) => v > 0).length;
const rows = new Set();
const cols = new Set();
for (let r = 0; r < 28; r++) {
  for (let c = 0; c < 28; c++) {
    if (expected[r * 28 + c] > 0) {
      rows.add(r);
      cols.add(c);
    }
  }
}

const fixture = {
  description:
    'Three-stroke glyph (minus + steep diagonal + 45-degree diagonal). normalizeGlyph parity fixture: Python side (training/preprocess.py) must reproduce `expected` from `strokes` (crop -> long-edge 20px -> center pad 28x28 -> floor(v+0.5) rounding -> integer Bresenham 1px lines; ink=1, background=0, row-major img[row*28+col]).',
  algorithm: {
    size: 28,
    target: 20,
    rounding: 'floor(v + 0.5)',
    rasterize: 'integer Bresenham (err = dx + dy), 1px width',
    output: 'row-major Float32Array(784), background 0.0, ink 1.0',
  },
  strokes,
  bbox,
  expected,
};

const outPath = resolve(here, 'fixtures/normalize_case1.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');

console.log(`wrote ${outPath}`);
console.log(`strokes: ${strokes.length}, pts: ${strokes[0].pts.length}`);
console.log(`bbox: ${JSON.stringify(bbox)}`);
console.log(`ink pixels: ${ink}/784, rows: ${[...rows].sort((a, b) => a - b).join(',')} , cols: ${Math.min(...cols)}..${Math.max(...cols)} (${cols.size} cols)`);
