/**
 * 符号分割：几何规则优先于 CNN 分类（几何命中即不打分类器）。
 *
 * 分两个阶段执行——多笔合并判定整体先于单笔定型。若严格按编号逐条短路，
 * 规则 4（÷）与规则 6（+）的横杠永远先被规则 3（fracbar）定型，规则即成死代码；
 * 两阶段化后编号顺序在各阶段内仍保持：
 *
 *   Phase A 多笔合并（按编号序 1 → 4 → 5 → 6，命中即消耗笔画）：
 *     1. 两条长度相近、主要 x 带重叠且中间无内容的横条 → '='（conf=1，alts=['=']，不打分类器）
 *     4. 横杠 + 上下两点（点心在杠 x 区间内、分别上下邻近）→ 合并交 classify（预期 '/'）
 *     5. 两笔对角交叉（各自非点/非横条、身高宽比 <3、bbox 相交且互不平行）→ 合并交 classify（预期 '*'）
 *     6. 横竖交叉（横条或折笔横挑穿过竖笔带宽；整根横条的角点搭接也算）
 *        → 合并交 classify（预期 '+' 或两笔 '4'）
 *     其后：分离顶横 + 下部笔画只有被完整图 CNN top-1 确认为 '5' 时才接合。
 *   Phase B 单笔定型（按编号序 2 → 3 → 7，按 x 序扫描）：
 *     2. bbox 两维均 < 0.35×lineHeight 且非细长横/竖形 → '.'（conf=1，alts=['.']，不打分类器）
 *     3. 单笔横条（宽 > 3×高）→ 'fracbar'（alts=['fracbar','-']，不打分类器；
 *        最终 minus/分数线由 Task 5 依上下文裁决）
 *     7. 其余单笔交 classify 取 top-3 为 alts（label=top1）
 *
 * 近邻默认不合并（Review Focus 1：紧挨符号不得粘连）。
 * glyph 的 bbox 一律在产出时用 bboxOf(strokes) 现算，保证与笔画严格一致。
 */
import { bboxOf, normalizeGlyph } from './strokes';
import type { BBox, Glyph, Stroke, SymbolLabel } from './types';

/**
 * 分类器契约：输入为 normalizeGlyph 产出的 28×28 归一化图（784，行主序，背景 0 笔迹 1），
 * 返回按置信度降序排列的候选列表。
 * 契约钉死：必须返回 ≥1 项（top-1 为当前生效标签，top-3 作为 glyph.alts）；
 * 返回空数组视为实现错误，segmentGlyphs 会抛出而非静默降级。
 */
export type ClassifyFn = (img: Float32Array) => { label: SymbolLabel; prob: number }[];

/** 点判定：bbox 两维均小于 0.35×lineHeight。 */
const DOT_SIZE = 0.35;
/** 长/横/竖条判定：宽 > 3×高 为横条；高 > 3×宽 为竖条。 */
const BAR_ASPECT = 3;
/** '=' 两横条垂直间隙主尺度（×lineHeight）；另由杠长补足宽间隙，轻微重叠允许至 -0.15。 */
const EQ_GAP_MAX = 0.6;
const EQ_GAP_MIN = -0.15;
/** ÷ 上下两点到横杠的垂直间隙上限（×lineHeight）。 */
const DIV_DOT_GAP = 0.75;
/** 对角线判定：身高宽比 < 3（高 < 3×宽，排除竖条；横条与点另行显式排除以维持规则优先级）。 */
const DIAG_ASPECT = 3;
/** 平行判定：两笔主方向夹角 < 20° 视为平行，平行斜线不合并（如斜写的 '11'）。 */
const PARALLEL_COS = Math.cos((20 / 180) * Math.PI);
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
  return p.w < DOT_SIZE * lineHeight && p.h < DOT_SIZE * lineHeight &&
    !isHBar(p) && !isVBar(p); // 小且点形：细长数字/上标/短减号不是点。
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

/**
 * 横杠的分数归属提示：与解析器同样要求横向覆盖和上下内容邻近。
 * 不用 label/模型候选；长竖/弯曲主体才是操作数，点和横条不能抢占该角色。
 */
function fractionSides(bar: Prepared, pool: Prepared[], lineHeight: number): { above: Prepared[]; below: Prepared[] } {
  const sides = { above: [] as Prepared[], below: [] as Prepared[] };
  if (!isHBar(bar)) return sides;
  for (const p of pool) {
    if (p === bar || isHBar(p) || isDot(p, lineHeight)) continue;
    const overlap = overlap1(bar.bb.x0, bar.bb.x1, p.bb.x0, p.bb.x1);
    if (overlap < -EPS || overlap < 0.3 * p.w) continue;
    if (p.cy < bar.cy && bar.bb.y0 - p.bb.y1 <= 0.75 * lineHeight) sides.above.push(p);
    if (p.cy > bar.cy && p.bb.y0 - bar.bb.y1 <= 0.75 * lineHeight) sides.below.push(p);
  }
  return sides;
}

function isFractionBar(bar: Prepared, pool: Prepared[], lineHeight: number): boolean {
  const { above, below } = fractionSides(bar, pool, lineHeight);
  return above.length > 0 && below.length > 0;
}

/** 在等号预热时，仅检测新笔是否补入既有「横杠+分子」的分母区，不推理/求值。 */
export function continuesFraction(strokes: Stroke[], stroke: Stroke, lineHeight: number): boolean {
  const pool = prepare(strokes);
  const next = prepare([stroke])[0];
  if (next === undefined) return false;
  return pool.some((bar) => {
    const existing = fractionSides(bar, pool, lineHeight);
    const appended = fractionSides(bar, [bar, next], lineHeight);
    return existing.above.length > 0 && appended.below.includes(next);
  });
}

/** 规则 1：两条长度相近、主要 x 带重叠的横条上下叠，且两杠之间无其它内容。 */
function eqPair(a: Prepared, b: Prepared, lineHeight: number, pool: Prepared[]): boolean {
  if (!isHBar(a) || !isHBar(b)) return false;
  if (isFractionBar(a, pool, lineHeight) || isFractionBar(b, pool, lineHeight)) return false;
  const overlap = overlap1(a.bb.x0, a.bb.x1, b.bb.x0, b.bb.x1);
  if (overlap < 0.5 * Math.min(a.w, b.w)) return false;
  if (Math.min(a.w, b.w) < 0.5 * Math.max(a.w, b.w)) return false;
  const upper = a.cy <= b.cy ? a : b;
  const lower = a.cy <= b.cy ? b : a;
  // 分母尚未写入时，下横覆盖分子而上横位于分子左侧同一 y 带，是负号+待续分数线。
  // 只检查分子自身的横域/字身，不把旁边或仅在上方的数字泛当成等号禁区。
  const pendingNumerator = fractionSides(lower, pool, lineHeight).above;
  if (pendingNumerator.some((p) =>
    upper.bb.x1 < p.bb.x0 && overlap1(upper.bb.y0, upper.bb.y1, p.bb.y0, p.bb.y1) >= -EPS,
  )) return false;
  const gap = lower.bb.y0 - upper.bb.y1;
  // 字号是主尺度；细长的真实等号允许按两杠自身长度补足间隙，仍共用全部重叠/夹墨约束。
  const gapMax = Math.max(EQ_GAP_MAX * lineHeight, Math.max(a.w, b.w));
  if (gap > gapMax || gap < EQ_GAP_MIN * lineHeight) return false;
  const x0 = Math.max(a.bb.x0, b.bb.x0);
  const x1 = Math.min(a.bb.x1, b.bb.x1);
  return !pool.some((p) =>
    p !== a && p !== b && p.cy > upper.bb.y1 && p.cy < lower.bb.y0 &&
    overlap1(p.bb.x0, p.bb.x1, x0, x1) >= -EPS,
  );
}

/** 只读几何结构提示：不归一化、不调用分类器，也不生成可进入求值的占位数字。 */
export function hasGeometricEquality(strokes: Stroke[], lineHeight: number): boolean {
  const pool = prepare(strokes);
  return pool.some((a, i) => pool.slice(i + 1).some((b) => eqPair(a, b, lineHeight, pool)));
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

/**
 * 规则 5：两笔对角交叉——各自非点/非横条、身高宽比 < 3、bbox 严格相交、互不平行。
 * 不要求 bbox 中心互偏：手写正则 × 的两笔常共享/近共享 bbox（中心差 ≤1px），
 * 中心条件会漏合并且不可纠正；平行性由方向向量夹角把关。
 */
function diagPair(a: Prepared, b: Prepared, lineHeight: number): boolean {
  const eligible = (p: Prepared) =>
    !isDot(p, lineHeight) && !isHBar(p) && p.w > 0 && p.h < DIAG_ASPECT * p.w;
  if (!eligible(a) || !eligible(b)) return false;
  if (overlap1(a.bb.x0, a.bb.x1, b.bb.x0, b.bb.x1) <= EPS) return false;
  if (overlap1(a.bb.y0, a.bb.y1, b.bb.y0, b.bb.y1) <= EPS) return false;
  return !diagParallel(a, b);
}

/**
 * 两笔主方向（首→尾向量）夹角是否 < 20°（平行）。
 * 用 |cos| 对称处理：同一斜线的两种运笔方向（反向量）仍算平行。
 * 首尾重合的闭合回路方向未定义，视为不平行，交 classify 兜底。
 */
function diagParallel(a: Prepared, b: Prepared): boolean {
  const ax = a.s.pts[a.s.pts.length - 1].x - a.s.pts[0].x;
  const ay = a.s.pts[a.s.pts.length - 1].y - a.s.pts[0].y;
  const bx = b.s.pts[b.s.pts.length - 1].x - b.s.pts[0].x;
  const by = b.s.pts[b.s.pts.length - 1].y - b.s.pts[0].y;
  const la2 = ax * ax + ay * ay;
  const lb2 = bx * bx + by * by;
  if (la2 < 1e-12 || lb2 < 1e-12) return false;
  const cos = Math.abs((ax * bx + ay * by) / Math.sqrt(la2 * lb2));
  return cos > PARALLEL_COS;
}

/**
 * 规则 6：横竖交叉。横笔可为整根横条，也可为折笔里的横挑（手写两笔 '4'）；
 * 折笔只在字身内部回挑的实际横向线段严格穿过竖笔带宽时合并，底部收笔/邻字 bbox 相交不算。
 */
function hvPair(a: Prepared, b: Prepared): boolean {
  let h: Prepared;
  let v: Prepared;
  if (isVBar(b) && !isVBar(a)) {
    h = a;
    v = b;
  } else if (isVBar(a) && !isVBar(b)) {
    h = b;
    v = a;
  } else {
    return false;
  }
  const crosses = (bb: BBox, strict: boolean) =>
    v.bb.y0 <= bb.y0 + EPS && v.bb.y1 >= bb.y1 - EPS &&
    (strict
      ? bb.x0 < v.bb.x0 - EPS && bb.x1 > v.bb.x1 + EPS
      : bb.x0 <= v.bb.x0 + EPS && bb.x1 >= v.bb.x1 - EPS);
  if (isHBar(h)) return crosses(h.bb, false);
  for (let i = 1; i < h.s.pts.length; i++) {
    const start = h.s.pts[i - 1];
    const end = h.s.pts[i];
    const bb = {
      x0: Math.min(start.x, end.x), x1: Math.max(start.x, end.x),
      y0: Math.min(start.y, end.y), y1: Math.max(start.y, end.y),
    };
    // 折笔横挑必须位于字身内部（先下探再回挑），不能把 '2' 的底部收笔当成跨字横杠。
    if (bb.y1 < h.bb.y1 - EPS && bb.x1 - bb.x0 > BAR_ASPECT * (bb.y1 - bb.y0) && crosses(bb, true)) return true;
  }
  return false;
}

/**
 * 分离顶横的两笔数字（手写 '5'）：下笔从顶横左端附近向下起笔。
 * 几何只提出候选；分数线不可接合，完整两笔的 CNN top-1 还必须确认 '5'。
 */
function detachedCapPair(bar: Prepared, body: Prepared, lineHeight: number): boolean {
  if (!isHBar(bar) || isHBar(body) || isDot(body, lineHeight) || body.s.pts.length < 2) return false;
  const start = body.s.pts[0];
  const next = body.s.pts[1];
  if (start.y !== body.bb.y0 || next.y <= start.y || next.y - start.y <= BAR_ASPECT * Math.abs(next.x - start.x)) return false;
  const gap = body.bb.y0 - bar.bb.y1;
  if (gap < -EPS || gap > DOT_SIZE * lineHeight) return false;
  if (bar.cx <= start.x || overlap1(bar.bb.x0, bar.bb.x1, body.bb.x0, body.bb.x1) <= EPS) return false;
  return Math.hypot(bar.bb.x0 - start.x, bar.cy - start.y) < DOT_SIZE * lineHeight;
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
      if (eqPair(a, b, lineHeight, pool)) {
        take(a, b);
        glyphs.push(geometricGlyph([a, b], '=', ['=']));
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

  // 分离的顶横只在完整图被模型确认为两笔 '5' 时接合；不能吞掉旁边的减号/分数线。
  for (const bar of pool) {
    if (used.has(bar) || isFractionBar(bar, pool, lineHeight)) continue;
    for (const body of pool) {
      if (body === bar || used.has(body) || !detachedCapPair(bar, body, lineHeight)) continue;
      const candidate = classifyGroup([bar, body], classify);
      if (candidate.label !== '5') continue;
      take(bar, body);
      glyphs.push(candidate);
      break;
    }
  }

  // ---- Phase B：单笔定型（规则 2 → 3 → 7）----

  for (const p of pool) {
    if (used.has(p)) continue;
    take(p);
    if (isDot(p, lineHeight)) {
      // 规则 2：小点（不打分类器）
      glyphs.push(geometricGlyph([p], '.', ['.']));
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
