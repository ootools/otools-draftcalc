/**
 * Task 3：符号分割 segmentGlyphs 几何规则测试。
 *
 * 计划 Step 1 的七个用例 + 空输入边界：
 *   ① 两条堆叠横线 → 1 glyph，label '='，classify 未被调用
 *   ② 小点 → '.'，classify 未被调用
 *   ③ 长横线（上下有笔）→ 'fracbar'，alts 含 '-'，横线本身不打分类器
 *   ④ 横竖交叉两笔 → 合并、注入的假 classify 收到的图有前景、label '+'
 *   ⑤ 横杠 + 上下两点 → 合并、label '/'
 *   ⑥ 两条对角线交叉 → 合并、label '*'
 *   ⑦ 相距 8px 的两个方框 → 2 个 glyph（Review Focus 1：近邻不粘连）
 *   ⑧ 共享 bbox 的正则 ×（第二笔画在第一笔 bbox 内）→ 合并为 1 glyph
 *     （P1 回归：旧"中心互偏"条件对中心差 ≤1px 的常见手写 × 漏合并）
 *   ⑨ 平行不相交的两条斜线 → 不合并（2 glyph）
 *     （P1 回归：旧"中心互偏"条件对中心差大于阈值、实际平行的斜线误合并）
 */
import { describe, it, expect } from 'vitest';
import { segmentGlyphs, type ClassifyFn } from '../src/core/segment';
import { bboxOf } from '../src/core/strokes';
import type { Glyph, SymbolLabel } from '../src/core/types';
import { cross, dot, hLine, polyline, vLine } from './helpers/synth';

/** 行内主字号参考（测试统一取 24px）。 */
const LH = 24;

type Candidate = { label: SymbolLabel; prob: number };

/** 可编程假分类器：记录每次收到的图，按队列依次返回 top-k；队列耗尽即失败。 */
function fakeClassify(queue: Candidate[][] = []) {
  const calls: Float32Array[] = [];
  const fn: ClassifyFn = (img) => {
    calls.push(img);
    const next = queue[calls.length - 1];
    if (!next) throw new Error('unexpected classify call');
    return next;
  };
  return { fn, calls };
}

/** glyph 的 bbox 必须与其 strokes 严格一致（Task 2 审查提醒的一致性隐患）。 */
function assertBboxConsistent(glyphs: Glyph[]): void {
  for (const g of glyphs) {
    expect(g.bbox).toEqual(bboxOf(g.strokes));
  }
}

describe('segmentGlyphs 几何规则', () => {
  it('① 两条堆叠横线 → 1 个 "=" glyph，不打分类器', () => {
    const { fn, calls } = fakeClassify();
    const glyphs = segmentGlyphs([hLine(4, 20, 10), hLine(4, 20, 18)], fn, LH);

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].label).toBe('=');
    expect(glyphs[0].alts).toEqual(['=']); // alts 至少含自身 label（types.ts 约定）
    expect(glyphs[0].conf).toBe(1);
    expect(glyphs[0].strokes).toHaveLength(2);
    expect(calls).toHaveLength(0);
    assertBboxConsistent(glyphs);
  });

  it('② 小点 → "."，不打分类器', () => {
    const { fn, calls } = fakeClassify();
    const glyphs = segmentGlyphs([dot(50, 50)], fn, LH);

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].label).toBe('.');
    expect(glyphs[0].alts).toEqual(['.']); // alts 至少含自身 label（types.ts 约定）
    expect(glyphs[0].conf).toBe(1);
    expect(glyphs[0].strokes).toHaveLength(1);
    expect(calls).toHaveLength(0);
    assertBboxConsistent(glyphs);
  });

  it('③ 长横线（上下有笔）→ "fracbar"，alts 含 "-"，横线本身不打分类器', () => {
    const { fn, calls } = fakeClassify([
      [{ label: '1', prob: 0.8 }, { label: '7', prob: 0.1 }, { label: '/', prob: 0.05 }],
      [{ label: '2', prob: 0.7 }, { label: '/', prob: 0.2 }, { label: '1', prob: 0.1 }],
    ]);
    // 上 '1'、分数线、下 '2' 的分数布局：横线宽 30px > 3×高
    const glyphs = segmentGlyphs([vLine(20, 5, 25), hLine(10, 40, 30), vLine(20, 35, 55)], fn, LH);

    expect(glyphs).toHaveLength(3);
    const bars = glyphs.filter((g) => g.label === 'fracbar');
    expect(bars).toHaveLength(1);
    expect(bars[0].alts).toContain('-');
    expect(bars[0].conf).toBe(1);
    expect(bars[0].strokes).toHaveLength(1);
    // 只有上下两笔进分类器；分数线走几何规则 3，不打分类器
    expect(calls).toHaveLength(2);
    assertBboxConsistent(glyphs);
  });

  it('④ 横竖交叉两笔 → 合并为 1 个 glyph，分类图有前景，label "+"', () => {
    const { fn, calls } = fakeClassify([
      [{ label: '+', prob: 0.93 }, { label: '4', prob: 0.04 }, { label: '1', prob: 0.03 }],
    ]);
    const glyphs = segmentGlyphs(cross(20, 20, 10), fn, LH);

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].label).toBe('+');
    expect(glyphs[0].conf).toBeCloseTo(0.93);
    expect(glyphs[0].alts).toEqual(['+', '4', '1']);
    expect(glyphs[0].strokes).toHaveLength(2);
    expect(calls).toHaveLength(1);
    // 注入的分类器收到的必须是 28×28=784 且含前景的归一化图（T2 链路接通）
    expect(calls[0]).toBeInstanceOf(Float32Array);
    expect(calls[0].length).toBe(784);
    expect(Array.from(calls[0]).some((v) => v > 0)).toBe(true);
    assertBboxConsistent(glyphs);
  });

  it('⑤ 横杠 + 上下两点 → 合并为 1 个 glyph，label "/"', () => {
    const { fn, calls } = fakeClassify([
      [{ label: '/', prob: 0.88 }, { label: '7', prob: 0.07 }, { label: '1', prob: 0.05 }],
    ]);
    const glyphs = segmentGlyphs([hLine(10, 30, 30), dot(20, 25), dot(20, 35)], fn, LH);

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].label).toBe('/');
    expect(glyphs[0].conf).toBeCloseTo(0.88);
    expect(glyphs[0].strokes).toHaveLength(3);
    expect(calls).toHaveLength(1);
    assertBboxConsistent(glyphs);
  });

  it('⑥ 两条对角线交叉 → 合并交分类，label "*"', () => {
    const { fn, calls } = fakeClassify([
      [{ label: '*', prob: 0.91 }, { label: '(', prob: 0.05 }, { label: ')', prob: 0.04 }],
    ]);
    const glyphs = segmentGlyphs(
      [polyline([[2, 26], [26, 2]]), polyline([[6, 2], [30, 26]])],
      fn,
      LH,
    );

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].label).toBe('*');
    expect(glyphs[0].conf).toBeCloseTo(0.91);
    expect(glyphs[0].strokes).toHaveLength(2);
    expect(calls).toHaveLength(1);
    assertBboxConsistent(glyphs);
  });

  it('⑦ 相距 8px 的两个方框 → 2 个独立 glyph（近邻默认不合并）', () => {
    const { fn, calls } = fakeClassify([
      [{ label: '0', prob: 0.9 }, { label: '8', prob: 0.06 }, { label: '6', prob: 0.04 }],
      [{ label: '0', prob: 0.9 }, { label: '8', prob: 0.06 }, { label: '6', prob: 0.04 }],
    ]);
    const box = (dx: number) =>
      polyline([[dx, 0], [dx + 20, 0], [dx + 20, 20], [dx, 20], [dx, 0]]);
    const glyphs = segmentGlyphs([box(0), box(28)], fn, LH);

    expect(glyphs).toHaveLength(2);
    expect(glyphs.map((g) => g.label)).toEqual(['0', '0']);
    expect(glyphs[0].strokes).toHaveLength(1);
    expect(glyphs[1].strokes).toHaveLength(1);
    expect(glyphs[0].bbox.x1).toBeLessThan(glyphs[1].bbox.x0); // 左右序输出
    expect(calls).toHaveLength(2);
    assertBboxConsistent(glyphs);
  });

  it('⑧ 共享 bbox 的正则 ×（第二笔画在第一笔 bbox 内）→ 合并为 1 glyph', () => {
    const { fn, calls } = fakeClassify([
      [{ label: '*', prob: 0.9 }, { label: '(', prob: 0.06 }, { label: ')', prob: 0.04 }],
    ]);
    // 第二笔端点完全落在第一笔 bbox 内，两笔 bbox 中心重合（手写 × 极常见）
    const glyphs = segmentGlyphs(
      [polyline([[0, 26], [26, 0]]), polyline([[4, 4], [22, 22]])],
      fn,
      LH,
    );

    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].label).toBe('*');
    expect(glyphs[0].strokes).toHaveLength(2);
    expect(calls).toHaveLength(1);
    assertBboxConsistent(glyphs);
  });

  it('⑨ 平行不相交的两条斜线 → 不合并（2 glyph）', () => {
    const { fn, calls } = fakeClassify([
      [{ label: '1', prob: 0.85 }, { label: '7', prob: 0.1 }, { label: '/', prob: 0.05 }],
      [{ label: '1', prob: 0.85 }, { label: '7', prob: 0.1 }, { label: '/', prob: 0.05 }],
    ]);
    // 两笔 bbox 重叠但方向平行（夹角 0° < 20°）：不得按 bbox 相交误合并
    const glyphs = segmentGlyphs(
      [polyline([[0, 20], [10, 0]]), polyline([[8, 20], [18, 0]])],
      fn,
      LH,
    );

    expect(glyphs).toHaveLength(2);
    expect(glyphs.map((g) => g.label)).toEqual(['1', '1']);
    expect(glyphs[0].strokes).toHaveLength(1);
    expect(glyphs[1].strokes).toHaveLength(1);
    expect(calls).toHaveLength(2);
    assertBboxConsistent(glyphs);
  });

  it('空输入返回空数组，不打分类器', () => {
    const { fn, calls } = fakeClassify();
    expect(segmentGlyphs([], fn, LH)).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
