import { describe, it, expect } from 'vitest';
import { bboxOf, resample, normalizeGlyph } from '../src/core/strokes';
import type { BBox, Pt, Stroke } from '../src/core/types';

/** 合成笔画：coords 为 [x, y] 序列，t 按序号均匀生成。 */
function mkStroke(id: number, coords: Array<[number, number]>): Stroke {
  return { id, pts: coords.map(([x, y], i) => ({ x, y, t: i * 10 }) satisfies Pt) };
}

/** 统计 28×28 栅格（行主序）中的前景像素与行列跨度。 */
function inkStats(img: Float32Array): {
  ink: number; minCol: number; maxCol: number; minRow: number; maxRow: number;
} {
  let ink = 0;
  let minCol = 28, maxCol = -1, minRow = 28, maxRow = -1;
  for (let row = 0; row < 28; row++) {
    for (let col = 0; col < 28; col++) {
      if (img[row * 28 + col] > 0.5) {
        ink++;
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
      }
    }
  }
  return { ink, minCol, maxCol, minRow, maxRow };
}

describe('resample', () => {
  it('默认输出 32 点，且首末点与输入完全一致', () => {
    const pts: Pt[] = [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 40, t: 120 },
      { x: 30, y: 10, t: 250 },
    ];
    const out = resample(pts);
    expect(out).toHaveLength(32);
    expect(out[0].x).toBe(pts[0].x);
    expect(out[0].y).toBe(pts[0].y);
    expect(out[31].x).toBe(pts[2].x);
    expect(out[31].y).toBe(pts[2].y);
  });

  it('显式 n 参数改变输出点数', () => {
    const pts = mkStroke(0, [[0, 0], [8, 0], [8, 8]]).pts;
    expect(resample(pts, 8)).toHaveLength(8);
  });
});

describe('bboxOf', () => {
  it('对折线返回正确包围盒', () => {
    const s = mkStroke(0, [[2, 5], [10, 1], [6, 9], [14, 3]]);
    const bb = bboxOf([s]);
    expect(bb).toEqual({ x0: 2, y0: 1, x1: 14, y1: 9 } satisfies BBox);
  });

  it('多笔画取并集包围盒', () => {
    const a = mkStroke(0, [[0, 0], [4, 4]]);
    const b = mkStroke(1, [[10, -2], [12, 3]]);
    const bb = bboxOf([a, b]);
    expect(bb).toEqual({ x0: 0, y0: -2, x1: 12, y1: 4 } satisfies BBox);
  });
});

describe('normalizeGlyph', () => {
  it('返回长度 784 的 Float32Array，值域 [0,1]，前景占比 0.05–0.5', () => {
    // 闭合方形环（digit 形字形的墨量代表：周长约 4×20px，1px 线宽）
    const s = mkStroke(0, [[0, 0], [24, 0], [24, 24], [0, 24], [0, 0]]);
    const img = normalizeGlyph({ strokes: [s], bbox: bboxOf([s]) });

    expect(img).toBeInstanceOf(Float32Array);
    expect(img).toHaveLength(784);
    for (const v of img) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }

    const { ink } = inkStats(img);
    const ratio = ink / 784;
    expect(ratio).toBeGreaterThanOrEqual(0.05);
    expect(ratio).toBeLessThanOrEqual(0.5);
  });

  it('2:1 宽扁字形：前景列跨度 > 行跨度（纵横比保持）', () => {
    // 40×20 矩形轮廓 → 长边 40 缩放到 20px，短边等比到 10px，内容居中
    const s = mkStroke(0, [[0, 0], [40, 0], [40, 20], [0, 20], [0, 0]]);
    const img = normalizeGlyph({ strokes: [s], bbox: bboxOf([s]) });

    const { minCol, maxCol, minRow, maxRow } = inkStats(img);
    const colSpan = maxCol - minCol + 1;
    const rowSpan = maxRow - minRow + 1;
    expect(colSpan).toBeGreaterThan(rowSpan);
    // 宽扁不应被拉伸成方形：列跨度应明显大于行跨度
    expect(colSpan).toBeGreaterThanOrEqual(18);
    expect(rowSpan).toBeLessThanOrEqual(12);
  });

  it('单点笔画退化为居中一个前景像素', () => {
    const s = mkStroke(0, [[100, 100]]);
    const img = normalizeGlyph({ strokes: [s], bbox: bboxOf([s]) });
    const { ink } = inkStats(img);
    expect(ink).toBe(1);
    expect(img[14 * 28 + 14]).toBe(1);
  });
});
