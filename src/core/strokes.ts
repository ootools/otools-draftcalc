/**
 * 笔画几何工具：包围盒、弧长重采样、字形归一化栅格化。
 *
 * normalizeGlyph 算法（与 Task 9 training/preprocess.py 的 Python 侧逐位对齐，
 * parity 容差 max|diff| < 0.02，实现时必须保持同一运算顺序）：
 *
 *   1. crop     ：以 bbox.x0/y0 为原点平移笔画；
 *   2. scale    ：长边（max(w,h)）缩放到 20px，短边等比；长边为 0（单点）时 s=1；
 *   3. pad      ：缩放后内容尺寸 w2=h*s, h2=h*s，偏移 off=(28-w2)/2 使内容居中于 28×28；
 *   4. rasterize：各点变换后按 floor(v+0.5) 取整到像素格点（不用 Math.round，
 *                 便于 Python 以 math.floor(v+0.5) 复现同一结果），
 *                 笔内相邻点之间画标准整数 Bresenham 线段（1px 线宽）；
 *   5. 输出     ：行主序 Float32Array(784)，白底黑字 → 背景 0.0、笔迹 1.0。
 *
 * 无任何 DOM/canvas 依赖，可在 node/vitest 下直接运行。
 */
import type { BBox, Pt, Stroke } from './types';

/** 输出栅格边长（28×28=784，CNN 输入尺寸）。 */
const SIZE = 28;
/** 内容长边目标像素（MNIST 风格：20px 内容 + 居中留白）。 */
const TARGET = 20;

/** 所有笔画的并集包围盒。无任何点时返回零包围盒。 */
export function bboxOf(strokes: Stroke[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    for (const p of s.pts) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0, y0, x1, y1 };
}

/**
 * 折线按弧长等距重采样为 n 点（默认 32）。首末点与输入严格一致；
 * 输入为单点/零长时输出 n 个重复点。t 随空间位置线性插值。
 */
export function resample(pts: Pt[], n: number = 32): Pt[] {
  if (pts.length === 0 || n <= 0) return [];
  if (n === 1) return [{ ...pts[0] }];
  if (pts.length === 1) return Array.from({ length: n }, () => ({ ...pts[0] }));

  // 累积弦长
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = cum[cum.length - 1];

  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) { out.push({ ...pts[0] }); continue; }
    if (i === n - 1) { out.push({ ...pts[pts.length - 1] }); continue; }
    const target = (total * i) / (n - 1);
    // 定位 target 所在段：cum[k] <= target <= cum[k+1]
    let k = 0;
    while (k < pts.length - 2 && cum[k + 1] < target) k++;
    const segLen = cum[k + 1] - cum[k];
    const t = segLen > 0 ? (target - cum[k]) / segLen : 0;
    out.push({
      x: pts[k].x + (pts[k + 1].x - pts[k].x) * t,
      y: pts[k].y + (pts[k + 1].y - pts[k].y) * t,
      t: pts[k].t + (pts[k + 1].t - pts[k].t) * t,
    });
  }
  return out;
}

/**
 * 字形归一化：crop → 长边 20px → 居中 pad 28×28 → 1px 线宽栅格化。
 * 返回行主序 Float32Array（img[row*28+col]，row=y、col=x），背景 0.0、笔迹 1.0。
 */
export function normalizeGlyph(g: { strokes: Stroke[]; bbox: BBox }): Float32Array {
  const img = new Float32Array(SIZE * SIZE);
  const { strokes, bbox } = g;
  const w = bbox.x1 - bbox.x0;
  const h = bbox.y1 - bbox.y0;
  const long = Math.max(w, h);
  const s = long > 0 ? TARGET / long : 1;
  const w2 = w * s;
  const h2 = h * s;
  const offX = (SIZE - w2) / 2;
  const offY = (SIZE - h2) / 2;

  for (const st of strokes) {
    const pix = st.pts.map((p) => ({
      x: Math.floor((p.x - bbox.x0) * s + offX + 0.5),
      y: Math.floor((p.y - bbox.y0) * s + offY + 0.5),
    }));
    if (pix.length === 1) {
      plot(img, pix[0].x, pix[0].y);
      continue;
    }
    for (let i = 0; i + 1 < pix.length; i++) {
      drawLine(img, pix[i].x, pix[i].y, pix[i + 1].x, pix[i + 1].y);
    }
  }
  return img;
}

/** 单像素落墨（越界忽略；正常输入经变换后必然落在 0..27 内）。 */
function plot(img: Float32Array, x: number, y: number): void {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  img[y * SIZE + x] = 1;
}

/**
 * 标准整数 Bresenham 直线（全八向，err=dx+dy 变体），1px 线宽。
 * 仅整数运算，Python 侧可逐位复现。
 */
function drawLine(img: Float32Array, x0: number, y0: number, x1: number, y1: number): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(img, x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
