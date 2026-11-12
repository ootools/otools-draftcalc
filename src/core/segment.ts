/**
 * 符号分割：几何规则优先于 CNN 分类（几何命中即不打分类器）。
 *
 * 分两个阶段执行——多笔合并判定整体先于单笔定型。若严格按编号逐条短路，
 * 规则 4（÷）与规则 6（+）的横杠永远先被规则 3（fracbar）定型，规则即成死代码；
 * 两阶段化后编号顺序在各阶段内仍保持：
 *
 *   Phase A 多笔合并（按编号序 1 → 4 → 5 → 6，命中即消耗笔画）：
 *     1. 两横条上下叠且 x 区间重叠 → '='（conf=1，alts=[]，不打分类器）
 *     4. 横杠 + 上下两点（点心在杠 x 区间内、分别上下邻近）→ 合并交 classify（预期 '/'）
 *     5. 两笔对角交叉（各自非点/非横条、h/w<3、bbox 相交且中心互偏）→ 合并交 classify（预期 '*'）
 *     6. 横竖交叉（横条与竖条互相贯穿对方带宽）→ 合并交 classify（预期 '+'）
 *   Phase B 单笔定型（按编号序 2 → 3 → 7，按 x 序扫描）：
 *     2. bbox 两维均 < 0.35×lineHeight → '.'（conf=1，alts=[]，不打分类器）
 *     3. 单笔横条（宽 > 3×高）→ 'fracbar'（alts=['fracbar','-']，不打分类器；
 *        最终 minus/分数线由 Task 5 依上下文裁决）
 *     7. 其余单笔交 classify 取 top-3 为 alts（label=top1）
 *
 * 近邻默认不合并（Review Focus 1：紧挨符号不得粘连）。
 * glyph 的 bbox 一律在产出时用 bboxOf(strokes) 现算，保证与笔画严格一致。
 */
import { bboxOf, normalizeGlyph } from './strokes';
import type { BBox, Glyph, Stroke, SymbolLabel } from './types';

export type ClassifyFn = (img: Float32Array) => { label: SymbolLabel; prob: number }[];

/** 点判定：bbox 两维均小于 0.35×lineHeight。 */
const DOT_SIZE = 0.35;
/** 长/横/竖条判定：宽 > 3×高 为横条；高 > 3×宽 为竖条。 */
const BAR_ASPECT = 3;
/** '=' 两横条垂直间隙允许范围（×lineHeight）：允许轻微重叠到 0.6 倍行高间隙。 */
const EQ_GAP_MAX = 0.6;
const EQ_GAP_MIN = -0.15;
/** ÷ 上下两点到横杠的垂直间隙上限（×lineHeight）。 */
const DIV_DOT_GAP = 0.75;
/** 对角线判定：高 < 3×宽（排除竖条；横条与点另行显式排除以维持规则优先级）。 */
const DIAG_ASPECT = 3;
/** 对角交叉“中心互偏”阈值（×两笔最大边长），下限 1px。 */
const DIAG_OFFSET = 0.05;
/** 区间重叠判定容差。 */
const EPS = 1e-6;

/** 预处理后的笔画：bbox、尺寸、中心。 */
interface Prepared {
  s: Stroke;
  bb: BBox;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/** 过滤空笔画并按 (x0, y0, id) 排序，保证扫描与输出确定性。 */
function prepare(strokes: Stroke[]): Prepared[] {
  return strokes
    .filter((s) => s.pts.length > 0)
    .map((s) => {
      const bb = bboxOf([s]);
      return { s, bb, w: bb.x1 - bb.x0, h: bb.y1 - bb.y0, cx: (bb.x0 + bb.x1) / 2, cy: (bb.y0 + bb.y1) / 2 };
    })
    .sort((a, b) => a.bb.x0 - b.bb.x0 || a.bb.y0 - b.bb.y0 || a.s.id - b.s.id);
}

function isDot(p: Prepared, lineHeight: number): boolean {
  return p.w < DOT_SIZE * lineHeight && p.h < DOT_SIZE * lineHeight;
}

/** 横向长条：宽 > 3×高（水平单点画线 h=0 时恒真）。 */
function isHBar(p: Prepared): boolean {
  return p.w > BAR_ASPECT * p.h;
}

/** 竖向长条：高 > 3×宽（竖直单点画线 w=0 时恒真）。 */
function isVBar(p: Prepared): boolean {
  return p.h > BAR_ASPECT * p.w;
}

/** 一维区间交叠长度（负值 = 间隙）。 */
function overlap1(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/** 规则 1：两横条上下叠且 x 区间重叠。 */
function eqPair(a: Prepared, b: Prepared, lineHeight: number): boolean {
  if (!isHBar(a) || !isHBar(b)) return false;
  if (overlap1(a.bb.x0, a.bb.x1, b.bb.x0, b.bb.x1) <= EPS) return false;
  const upper = a.cy <= b.cy ? a : b;
  const lower = a.cy <= b.cy ? b : a;
  const gap = lower.bb.y0 - upper.bb.y1;
  return gap <= EQ_GAP_MAX * lineHeight && gap >= EQ_GAP_MIN * lineHeight;
}

/** 规则 4：横杠 + 上下两点（点心在杠 x 区间内，分别在其上下邻近）→ [杠, 上点, 下点]。 */
function divGroup(bar: Prepared, dots: Prepared[], lineHeight: number): Prepared[] | null {
  if (!isHBar(bar)) return null;
  const near = dots.filter((d) => d.cx >= bar.bb.x0 && d.cx <= bar.bb.x1);
  const byCloseness = (a: Prepared, b: Prepared) =>
    Math.abs(a.cy - bar.cy) - Math.abs(b.cy - bar.cy);
  const top = near
    .filter((d) => d.cy < bar.cy && bar.bb.y0 - d.bb.y1 < DIV_DOT_GAP * lineHeight)
    .sort(byCloseness)[0];
  const bottom = near
    .filter((d) => d.cy > bar.cy && d.bb.y0 - bar.bb.y1 < DIV_DOT_GAP * lineHeight)
    .sort(byCloseness)[0];
  if (!top || !bottom) return null;
  return [bar, top, bottom];
}

/** 规则 5：两笔对角交叉——各自非点/非横条、h<3×w、bbox 严格相交、中心互偏。 */
function diagPair(a: Prepared, b: Prepared, lineHeight: number): boolean {
  const eligible = (p: Prepared) =>
    !isDot(p, lineHeight) && !isHBar(p) && p.w > 0 && p.h < DIAG_ASPECT * p.w;
  if (!eligible(a) || !eligible(b)) return false;
  if (overlap1(a.bb.x0, a.bb.x1, b.bb.x0, b.bb.x1) <= EPS) return false;
  if (overlap1(a.bb.y0, a.bb.y1, b.bb.y0, b.bb.y1) <= EPS) return false;
  const offset = Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy));
  const maxDim = Math.max(a.w, a.h, b.w, b.h);
  return offset > Math.max(1, DIAG_OFFSET * maxDim);
}

/** 规则 6：横竖交叉——横条与竖条互相贯穿对方带宽（真交叉，非角点搭接）。 */
function hvPair(a: Prepared, b: Prepared): boolean {
  let h: Prepared;
  let v: Prepared;
  if (isHBar(a) && isVBar(b)) {
    h = a;
    v = b;
  } else if (isHBar(b) && isVBar(a)) {
    h = b;
    v = a;
  } else {
    return false;
  }
  return (
    v.bb.y0 <= h.bb.y0 + EPS &&
    v.bb.y1 >= h.bb.y1 - EPS && // 竖笔贯穿横杠 y 带
    h.bb.x0 <= v.bb.x0 + EPS &&
    h.bb.x1 >= v.bb.x1 - EPS // 横笔贯穿竖笔 x 带
  );
}

/** 几何定型 glyph：conf=1，bbox 由 strokes 现算。 */
function geometricGlyph(group: Prepared[], label: SymbolLabel, alts: SymbolLabel[]): Glyph {
  const strokes = group.map((p) => p.s);
  return { strokes, bbox: bboxOf(strokes), label, alts, conf: 1 };
}

/** 交 CNN 分类 glyph：normalizeGlyph 归一化 → classify → top-3 为 alts。 */
function classifyGroup(group: Prepared[], classify: ClassifyFn): Glyph {
  const strokes = group.map((p) => p.s);
  const bbox = bboxOf(strokes);
  const results = classify(normalizeGlyph({ strokes, bbox }));
  if (results.length === 0) throw new Error('classify 未返回任何候选');
  return {
    strokes,
    bbox,
    label: results[0].label,
    alts: results.slice(0, 3).map((r) => r.label),
    conf: results[0].prob,
  };
}

/**
 * 符号分割主入口：一行笔画 → 按几何规则合并/定型，其余交分类器。
 * 返回 glyph 按 bbox 左缘（同列按上缘）从左到右排序，供 Task 5 顺序解析。
 */
export function segmentGlyphs(
  strokes: Stroke[],
  classify: ClassifyFn,
  lineHeight: number,
): Glyph[] {
  const pool = prepare(strokes);
  const used = new Set<Prepared>();
  const glyphs: Glyph[] = [];
  const take = (...ps: Prepared[]) => ps.forEach((p) => used.add(p));

  // ---- Phase A：多笔合并（规则 1 → 4 → 5 → 6）----

  // 规则 1：两横条上下叠且 x 重叠 → '='（不打分类器）
  for (const a of pool) {
    if (used.has(a)) continue;
    for (const b of pool) {
      if (b === a || used.has(b)) continue;
      if (eqPair(a, b, lineHeight)) {
        take(a, b);
        glyphs.push(geometricGlyph([a, b], '=', []));
        break;
      }
    }
  }

  // 规则 4：横杠 + 上下两点 → 合并交 classify（预期 '/'）
  for (const bar of pool) {
    if (used.has(bar)) continue;
    const dots = pool.filter((p) => p !== bar && !used.has(p) && isDot(p, lineHeight));
    const group = divGroup(bar, dots, lineHeight);
    if (group) {
      take(...group);
      glyphs.push(classifyGroup(group, classify));
    }
  }

  // 规则 5：两笔对角交叉 → 合并交 classify（预期 '*'）
  for (const a of pool) {
    if (used.has(a)) continue;
    for (const b of pool) {
      if (b === a || used.has(b)) continue;
      if (diagPair(a, b, lineHeight)) {
        take(a, b);
        glyphs.push(classifyGroup([a, b], classify));
        break;
      }
    }
  }

  // 规则 6：横竖交叉 → 合并交 classify（预期 '+'）
  for (const a of pool) {
    if (used.has(a)) continue;
    for (const b of pool) {
      if (b === a || used.has(b)) continue;
      if (hvPair(a, b)) {
        take(a, b);
        glyphs.push(classifyGroup([a, b], classify));
        break;
      }
    }
  }

  // ---- Phase B：单笔定型（规则 2 → 3 → 7）----

  for (const p of pool) {
    if (used.has(p)) continue;
    take(p);
    if (isDot(p, lineHeight)) {
      // 规则 2：小点（不打分类器）
      glyphs.push(geometricGlyph([p], '.', []));
    } else if (isHBar(p)) {
      // 规则 3：单笔横条 → fracbar，minus/分数线由 Task 5 裁决（不打分类器）
      glyphs.push(geometricGlyph([p], 'fracbar', ['fracbar', '-']));
    } else {
      // 规则 7：单笔独立成 glyph，交 classify 取 top-3
      glyphs.push(classifyGroup([p], classify));
    }
  }

  glyphs.sort((g1, g2) => g1.bbox.x0 - g2.bbox.x0 || g1.bbox.y0 - g2.bbox.y0);
  return glyphs;
}
