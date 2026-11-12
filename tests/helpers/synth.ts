/**
 * 合成笔画生成器 —— Task 3（segment）/ Task 5（parse2d）/ Task 7（lines）测试共用。
 *
 * 所有生成器返回带自增 id 的 Stroke，t 按点序号均匀递增（与 strokes.test.ts
 * 的 mkStroke 约定一致）。坐标为整数像素，便于几何规则阈值断言。
 */
import type { Pt, Stroke } from '../../src/core/types';

let nextId = 1;

/** 基础折线构造：coords 为 [x, y] 序列。 */
function mk(coords: Array<[number, number]>): Stroke {
  const id = nextId++;
  return { id, pts: coords.map(([x, y], i) => ({ x, y, t: i * 10 }) satisfies Pt) };
}

/** 水平横线：(x0, y) → (x1, y)，bbox 高为 0。 */
export function hLine(x0: number, x1: number, y: number): Stroke {
  return mk([
    [x0, y],
    [x1, y],
  ]);
}

/** 竖直线：(x, y0) → (x, y1)，bbox 宽为 0。 */
export function vLine(x: number, y0: number, y1: number): Stroke {
  return mk([
    [x, y0],
    [x, y1],
  ]);
}

/** 小点：以 (cx, cy) 为中心、半边长 r（默认 1）的小方块轮廓，bbox 尺寸 2r×2r。 */
export function dot(cx: number, cy: number, r = 1): Stroke {
  return mk([
    [cx - r, cy - r],
    [cx + r, cy - r],
    [cx + r, cy + r],
    [cx - r, cy - r],
  ]);
}

/** 横竖交叉 "+"：返回 [横线, 竖线] 两笔，中心 (cx, cy)，臂长 arm（默认 10）。 */
export function cross(cx: number, cy: number, arm = 10): Stroke[] {
  return [hLine(cx - arm, cx + arm, cy), vLine(cx, cy - arm, cy + arm)];
}

/** 任意折线（可闭合）：对角线、方框数字、数字字形等均由此构造。 */
export function polyline(coords: Array<[number, number]>): Stroke {
  return mk(coords);
}
