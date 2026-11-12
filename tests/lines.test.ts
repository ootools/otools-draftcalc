/**
 * Task 7：行状态机 lines 测试（假 pipeline：调用计数 + 可编程返回/抛错序列）。
 *
 * 覆盖计划行为规则 1-7 与 T4 审查附加契约：
 *   规则 1  addStroke 进当前 writing 行；仅对当前行跑 pipeline
 *           （Review Focus 4：9 条 done 行时新笔恰触发 1 次）；
 *   规则 2  pipeline 产出 eq 非 null（含 '='）→ status=done、result=返回值
 *           （rhs 空 → value，即 `12=` → 46；有 rhs → compare）；
 *   规则 3  done 行后新笔先判 rhs 续写（x 中心 > '=' bbox.x1 且 y 中心在
 *           行 bbox y ±1 容差内）→ 重开重算为 compare；否则一律开新行；
 *   规则 4  done 行上 undo/eraseAt → 重开 writing、result 清 null；
 *   规则 5  compare 行 rhs 续写：继续追加 rhs、重算、用户笔迹永不删除；
 *   规则 6  undo 全局撤最后一笔；eraseAt 按笔画 bbox 与橡皮圆相交（距离 ≤ r）删除；
 *   规则 7  setAlt 改 label 后仅重算该行；done 行按新 result 更新 status/result。
 *   T4 契约 pipeline.run 全部调用点 try/catch：非 warmup 故障视为暂态（保留笔画、
 *   status 维持 writing、重开的验算行保留旧 result）；捕获 WarmupError（message
 *   前缀 '识别预热中：'）经注入 scheduler 同拍延迟重跑；同一行连续 5 次
 *   WarmupError 停止自动重跑（用户动作重置计数）；两阶段假识别器 +
 *   createPipeline 真实管线验证 catch-and-rerun 闭环。
 *   补强（纠正持久化）：setAlt 写 overrides（glyph 归一化图 key → label），
 *   createPipeline 的 labelOverride 注入在每次重跑对每个 glyph 重新应用 ——
 *   纠正跨「追加新笔重跑 / rhs 续写重算」持久；循环切回原 top-1、clear 失效、
 *   undo 不清（同图重写仍命中）。测试用晚期绑定装配（Task 8 同款模式）。
 */
import { describe, expect, it } from 'vitest';
import { createPipeline, LineManager, type LinePipeline } from '../src/core/lines';
import type { EvalResult } from '../src/core/evaluate';
import type { Equation, ExprNode, Glyph, Stroke, SymbolLabel } from '../src/core/types';
import { hLine, polyline, vLine } from './helpers/synth';

// ---------------------------------------------------------------- 假 pipeline

/** pipeline.run 的一次返回（或抛出的 Error）。 */
interface RunOut {
  glyphs: Glyph[];
  eq: Equation | null;
  result: EvalResult | null;
}

/** 可编程假 pipeline：按 queue 顺序逐次消费；耗尽后默认返回空 writing 输出。 */
class FakePipeline implements LinePipeline {
  readonly calls: Stroke[][] = [];
  private script: Array<RunOut | Error> = [];

  queue(...items: Array<RunOut | Error>): void {
    this.script.push(...items);
  }

  run(strokes: Stroke[]): RunOut {
    this.calls.push([...strokes]);
    const next = this.script.shift();
    if (next instanceof Error) throw next;
    return next ?? { glyphs: [], eq: null, result: null };
  }

  get callCount(): number {
    return this.calls.length;
  }
}

// ---------------------------------------------------------------- 测试基建

interface Harness {
  fp: FakePipeline;
  m: LineManager;
  /** 注入 scheduler 捕获到的延迟重跑（按调度顺序）。 */
  scheduled: Array<() => void>;
}

function makeManager(): Harness {
  const fp = new FakePipeline();
  const scheduled: Array<() => void> = [];
  const m = new LineManager(fp, 40, (fn) => {
    scheduled.push(fn);
  });
  return { fp, m, scheduled };
}

// ---- glyph / RunOut 构造（LineManager 只消费 '=' bbox 与 result，其余占位）----

let nextGlStrokeId = 1;

function gl(label: SymbolLabel, x0: number, y0: number, x1: number, y1: number): Glyph {
  const bbox = { x0, y0, x1, y1 };
  const stroke: Stroke = {
    id: nextGlStrokeId++,
    pts: [
      { x: x0, y: y0, t: 0 },
      { x: x1, y: y1, t: 10 },
    ],
  };
  return { strokes: [stroke], bbox, label, alts: [label], conf: 1 };
}

const numNode = (text: string): ExprNode => ({ kind: 'num', text });
const EMPTY_SEQ: ExprNode = { kind: 'seq', items: [] };

const outWriting = (glyphs: Glyph[] = []): RunOut => ({ glyphs, eq: null, result: null });

const outValue = (glyphs: Glyph[], lhs: string, value: string): RunOut => ({
  glyphs,
  eq: { lhs: numNode(lhs), rhs: EMPTY_SEQ },
  result: { type: 'value', lhs, value },
});

const outCompare = (glyphs: Glyph[], lhs: string, rhs: string, match: boolean): RunOut => ({
  glyphs,
  eq: { lhs: numNode(lhs), rhs: numNode(rhs) },
  result: { type: 'compare', lhs, rhs, match },
});

const WARMUP_ERR = (): Error => new Error('识别预热中：假识别器首见图，后台推理进行中');

// ---- 标准 `12=` 行：4 笔（'1' '2' '=' 两条横线），glyph '=' bbox x1=62，行 bbox y [15,45] ----

function strokes12Eq(): Stroke[] {
  return [
    polyline([
      [10, 15],
      [18, 45],
    ]),
    polyline([
      [24, 15],
      [34, 45],
    ]),
    hLine(44, 62, 26),
    hLine(44, 62, 34),
  ];
}

function glyphs12Eq(): Glyph[] {
  return [gl('1', 10, 15, 18, 45), gl('2', 24, 15, 34, 45), gl('=', 44, 26, 62, 34)];
}

/** rhs 续写一笔（'2'）：cx=80 > 62，cy=30 ∈ [14,46]。 */
function rhsStroke(): Stroke {
  return polyline([
    [75, 20],
    [85, 40],
  ]);
}

function glyphs12EqRhs2(): Glyph[] {
  return [...glyphs12Eq(), gl('2', 75, 20, 85, 40)];
}

/** 递进脚本建 done value 行 `12=`：前 3 笔 writing，第 4 笔完成出 46。返回实际笔画实例。 */
function addValueLine(h: Harness): Stroke[] {
  h.fp.queue(outWriting(), outWriting(), outWriting(), outValue(glyphs12Eq(), '12', '46'));
  const strokes = strokes12Eq();
  for (const s of strokes) h.m.addStroke(s);
  return strokes;
}

// ---- 标准 `12=24` compare 行：6 笔 ----

function strokes12Eq24(): Stroke[] {
  return [
    ...strokes12Eq(),
    polyline([
      [70, 15],
      [78, 45],
    ]),
    polyline([
      [84, 15],
      [92, 45],
    ]),
  ];
}

function glyphs12Eq24(): Glyph[] {
  return [...glyphs12Eq(), gl('2', 70, 15, 78, 45), gl('4', 84, 15, 92, 45)];
}

/** 递进脚本建 done compare 行 `12=24`。返回实际笔画实例。 */
function addCompareLine(h: Harness, match: boolean): Stroke[] {
  h.fp.queue(
    outWriting(),
    outWriting(),
    outWriting(),
    outWriting(),
    outWriting(),
    outCompare(glyphs12Eq24(), '12', '24', match),
  );
  const strokes = strokes12Eq24();
  for (const s of strokes) h.m.addStroke(s);
  return strokes;
}

// ---------------------------------------------------------------- 规则 1

describe('addStroke：当前 writing 行与流水线调用计数（规则 1）', () => {
  it('首笔建行 id=1、进 strokes、触发一次 pipeline', () => {
    const { fp, m } = makeManager();
    const s = polyline([
      [10, 15],
      [18, 45],
    ]);
    m.addStroke(s);
    expect(m.lines.length).toBe(1);
    const line = m.lines[0];
    expect(line.id).toBe(1);
    expect(line.strokes).toEqual([s]);
    expect(line.status).toBe('writing');
    expect(line.result).toBeNull();
    expect(line.glyphs).toEqual([]);
    expect(fp.callCount).toBe(1);
    expect(fp.calls[0]).toEqual([s]);
  });

  it('第二笔进同一行，每笔各触发一次 pipeline（调用收到全行笔画）', () => {
    const { fp, m } = makeManager();
    fp.queue(outWriting());
    const s1 = polyline([
      [10, 15],
      [18, 45],
    ]);
    m.addStroke(s1);
    fp.queue(outWriting());
    const s2 = polyline([
      [24, 15],
      [34, 45],
    ]);
    m.addStroke(s2);
    expect(m.lines.length).toBe(1);
    expect(m.lines[0].strokes).toEqual([s1, s2]);
    expect(fp.callCount).toBe(2);
    expect(fp.calls[1]).toEqual([s1, s2]);
  });

  it('Review Focus 4：9 条 done 行存在时，新笔恰触发 1 次 pipeline', () => {
    const { fp, m } = makeManager();
    for (let i = 0; i < 9; i++) addValueLine({ fp, m, scheduled: [] });
    expect(fp.callCount).toBe(36); // 9 行 × 4 笔，全部 done
    for (let i = 0; i < 9; i++) expect(m.lines[i].status).toBe('done');
    const s10 = polyline([
      [5, 200],
      [13, 230],
    ]); // cx=9 ≤ 62 且 cy=215 超出 y 容差 → 不触发 rhs 续写，开新行
    m.addStroke(s10);
    expect(fp.callCount).toBe(37); // 仅 +1：done 行永不重跑
    expect(fp.calls[36]).toEqual([s10]); // 该次调用只含新行笔画
    expect(m.lines.length).toBe(10);
    expect(m.lines[9].status).toBe('writing');
    expect(m.lines[9].strokes).toEqual([s10]);
  });
});

// ---------------------------------------------------------------- 规则 2

describe('写完等号出结果（规则 2）', () => {
  it('`12=`：eq 非 null（rhs 空 seq）→ done + value result（46）', () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    const line = m.lines[0];
    expect(line.status).toBe('done');
    expect(line.result).toEqual({ type: 'value', lhs: '12', value: '46' });
    expect(line.glyphs.map((g) => g.label)).toEqual(['1', '2', '=']);
  });

  it('`12=24`：有 rhs → done + compare result', () => {
    const { fp, m } = makeManager();
    addCompareLine({ fp, m, scheduled: [] }, true);
    const line = m.lines[0];
    expect(line.status).toBe('done');
    expect(line.result).toEqual({ type: 'compare', lhs: '12', rhs: '24', match: true });
  });

  it('无 = （eq null）→ 保持 writing、result null', () => {
    const { fp, m } = makeManager();
    fp.queue(outWriting());
    m.addStroke(
      polyline([
        [10, 15],
        [18, 45],
      ]),
    );
    expect(m.lines[0].status).toBe('writing');
    expect(m.lines[0].result).toBeNull();
  });

  it('eq 非 null 但 result 为 null → done 且 result null（result 置为 pipeline 返回值）', () => {
    const { fp, m } = makeManager();
    fp.queue({ glyphs: [], eq: { lhs: numNode('12'), rhs: EMPTY_SEQ }, result: null });
    m.addStroke(
      polyline([
        [10, 15],
        [18, 45],
      ]),
    );
    expect(m.lines[0].status).toBe('done');
    expect(m.lines[0].result).toBeNull();
  });
});

// ---------------------------------------------------------------- 规则 3 / 5

describe('rhs 渐进续写（规则 3，Review Focus 3）', () => {
  it('value done 行右侧新笔 → 重开重算为 compare，用户笔迹保留', () => {
    const { fp, m } = makeManager();
    const base = addValueLine({ fp, m, scheduled: [] });
    fp.queue(outCompare(glyphs12EqRhs2(), '12', '2', false));
    const s = rhsStroke();
    m.addStroke(s);
    expect(m.lines.length).toBe(1);
    const line = m.lines[0];
    expect(line.status).toBe('done');
    expect(line.result).toEqual({ type: 'compare', lhs: '12', rhs: '2', match: false });
    expect(line.strokes.length).toBe(5); // 原 4 笔 + 新笔，无一删除
    expect(fp.calls.at(-1)).toEqual([...base, s]);
  });

  it('续写首跑抛 WarmupError → 重开行保留旧 result、调度重跑后闭环为 compare', () => {
    const { fp, m, scheduled } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    fp.queue(WARMUP_ERR());
    m.addStroke(rhsStroke());
    const line = m.lines[0];
    expect(line.status).toBe('writing'); // 重开
    expect(line.result).toEqual({ type: 'value', lhs: '12', value: '46' }); // 旧值暂保留
    expect(scheduled.length).toBe(1);
    fp.queue(outCompare(glyphs12EqRhs2(), '12', '2', false));
    scheduled[0]();
    expect(line.status).toBe('done');
    expect(line.result).toEqual({ type: 'compare', lhs: '12', rhs: '2', match: false });
  });

  it("'=' 左侧新笔 → 一律开新行，done 行不动", () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    fp.queue(outWriting());
    const s = polyline([
      [8, 60],
      [20, 90],
    ]); // cx=14 < 62
    m.addStroke(s);
    expect(m.lines.length).toBe(2);
    expect(m.lines[0].status).toBe('done');
    expect(m.lines[0].result).toEqual({ type: 'value', lhs: '12', value: '46' });
    expect(m.lines[1].strokes).toEqual([s]);
    expect(fp.calls.at(-1)).toEqual([s]);
  });

  it("x 在 '=' 右侧但 y 中心超出行 bbox 容差 → 新行", () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    fp.queue(outWriting());
    m.addStroke(
      polyline([
        [75, 200],
        [85, 220],
      ]),
    ); // cy=210 远离 [14,46]
    expect(m.lines.length).toBe(2);
    expect(m.lines[0].status).toBe('done');
  });

  it('y 中心恰在行 bbox 下缘 +1（容差边界）→ 仍续写', () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    fp.queue(outCompare(glyphs12EqRhs2(), '12', '2', false));
    m.addStroke(
      polyline([
        [75, 41],
        [85, 51],
      ]),
    ); // cy=46 = 45+1
    expect(m.lines.length).toBe(1);
    expect(m.lines[0].result).toEqual({ type: 'compare', lhs: '12', rhs: '2', match: false });
  });

  it("glyphs 中无 '=' 的 done 行 → 不续写，开新行", () => {
    const { fp, m } = makeManager();
    fp.queue({
      glyphs: [gl('2', 10, 15, 18, 45)],
      eq: { lhs: numNode('2'), rhs: null },
      result: null,
    });
    m.addStroke(
      polyline([
        [10, 15],
        [18, 45],
      ]),
    );
    expect(m.lines[0].status).toBe('done');
    fp.queue(outWriting());
    m.addStroke(
      polyline([
        [80, 15],
        [90, 45],
      ]),
    );
    expect(m.lines.length).toBe(2); // 无 '=' glyph 可参照 → 新行
    expect(m.lines[0].status).toBe('done');
  });
});

describe('compare 行 rhs 续写（规则 5）', () => {
  it("新笔仍落 '=' 右侧 → 继续追加 rhs、重算、笔迹永不删除", () => {
    const { fp, m } = makeManager();
    addCompareLine({ fp, m, scheduled: [] }, true);
    fp.queue(outCompare([...glyphs12Eq24(), gl('5', 98, 15, 106, 45)], '12', '245', false));
    m.addStroke(
      polyline([
        [98, 15],
        [106, 45],
      ]),
    );
    const line = m.lines[0];
    expect(line.strokes.length).toBe(7); // 原 6 笔全保留
    expect(line.status).toBe('done');
    expect(line.result).toEqual({ type: 'compare', lhs: '12', rhs: '245', match: false });
  });

  it('连续两次续写：每笔各重算一次且 rhs 不断增长', () => {
    const { fp, m } = makeManager();
    addCompareLine({ fp, m, scheduled: [] }, true);
    const base = fp.callCount; // 6
    fp.queue(outCompare([...glyphs12Eq24(), gl('5', 98, 15, 106, 45)], '12', '245', false));
    m.addStroke(
      polyline([
        [98, 15],
        [106, 45],
      ]),
    );
    fp.queue(
      outCompare(
        [...glyphs12Eq24(), gl('5', 98, 15, 106, 45), gl('6', 112, 15, 120, 45)],
        '12',
        '2456',
        true,
      ),
    );
    m.addStroke(
      polyline([
        [112, 15],
        [120, 45],
      ]),
    );
    expect(fp.callCount).toBe(base + 2);
    const line = m.lines[0];
    expect(line.strokes.length).toBe(8);
    expect(line.status).toBe('done');
    expect(line.result).toEqual({ type: 'compare', lhs: '12', rhs: '2456', match: true });
  });
});

// ---------------------------------------------------------------- 规则 4 / 6

describe('undo：全局撤最后一笔（规则 4/6）', () => {
  it("done 行撤销 '=' 的第二条横线 → 重开 writing、result 清 null、重算剩余笔画", () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    m.undo();
    const line = m.lines[0];
    expect(line.strokes.length).toBe(3);
    expect(line.status).toBe('writing');
    expect(line.result).toBeNull();
    expect(fp.calls.at(-1)).toEqual(line.strokes); // 重算收到剩余 3 笔
  });

  it('compare 行撤销 rhs 尾笔 → 重算仍 done，result 按新 rhs 更新', () => {
    const { fp, m } = makeManager();
    addCompareLine({ fp, m, scheduled: [] }, true);
    fp.queue(outCompare([...glyphs12Eq(), gl('2', 70, 15, 78, 45)], '12', '2', false));
    m.undo();
    const line = m.lines[0];
    expect(line.strokes.length).toBe(5);
    expect(line.status).toBe('done'); // '=' 仍在 → 按规则 2 重新判定 done
    expect(line.result).toEqual({ type: 'compare', lhs: '12', rhs: '2', match: false });
  });

  it('跨行撤销：先清空尾行（行被移除），再撤销进入前一行并重开', () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    fp.queue(outWriting());
    m.addStroke(
      polyline([
        [10, 100],
        [18, 130],
      ]),
    );
    expect(m.lines.length).toBe(2);
    m.undo(); // 撤 L2 唯一笔 → L2 清空移除
    expect(m.lines.length).toBe(1);
    expect(m.lines[0].status).toBe('done'); // L1 不动
    m.undo(); // 撤 L1 尾笔 → 重开
    expect(m.lines[0].status).toBe('writing');
    expect(m.lines[0].result).toBeNull();
    expect(m.lines[0].strokes.length).toBe(3);
  });

  it('空 manager undo → 无操作不抛', () => {
    const { m } = makeManager();
    expect(() => m.undo()).not.toThrow();
    expect(m.lines.length).toBe(0);
  });

  it('writing 行撤销尾笔并重算剩余笔画', () => {
    const { fp, m } = makeManager();
    const s1 = polyline([
      [10, 15],
      [18, 45],
    ]);
    const s2 = polyline([
      [24, 15],
      [34, 45],
    ]);
    fp.queue(outWriting());
    m.addStroke(s1);
    fp.queue(outWriting());
    m.addStroke(s2);
    m.undo();
    expect(m.lines[0].strokes).toEqual([s1]);
    expect(fp.calls.at(-1)).toEqual([s1]);
  });
});

describe('eraseAt：按 bbox 与橡皮圆相交删除（规则 6）', () => {
  it('writing 行擦除命中一笔 → 移除并重算剩余', () => {
    const { fp, m } = makeManager();
    const s1 = polyline([
      [10, 15],
      [18, 45],
    ]);
    const s2 = polyline([
      [40, 15],
      [48, 45],
    ]);
    fp.queue(outWriting());
    m.addStroke(s1);
    fp.queue(outWriting());
    m.addStroke(s2);
    m.eraseAt({ x: 44, y: 30 }, 5); // s2 bbox 中心
    expect(m.lines[0].strokes).toEqual([s1]);
    expect(fp.calls.at(-1)).toEqual([s1]);
    expect(m.lines[0].status).toBe('writing');
  });

  it("done 行擦除 '=' 一条横线 → 重开、result 清 null、重算", () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    m.eraseAt({ x: 53, y: 34 }, 3); // 命中 y=34 横线（距 y=26 横线 8 > 3，不误伤）
    const line = m.lines[0];
    expect(line.strokes.length).toBe(3);
    expect(line.status).toBe('writing');
    expect(line.result).toBeNull();
    expect(fp.callCount).toBe(5); // 4 次建行 + 1 次重算
  });

  it('未命中 → 原样保留，不触发 pipeline', () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    const before = fp.callCount;
    m.eraseAt({ x: 500, y: 500 }, 10);
    expect(fp.callCount).toBe(before);
    expect(m.lines[0].status).toBe('done');
    expect(m.lines[0].result).toEqual({ type: 'value', lhs: '12', value: '46' });
    expect(m.lines[0].strokes.length).toBe(4);
  });

  it('半径边界：距 bbox 恰 r → 命中（≤ r）；r 更小 → 不命中', () => {
    const mk = (): Harness => {
      const h = makeManager();
      h.fp.queue(outWriting());
      h.m.addStroke(
        polyline([
          [40, 15],
          [48, 45],
        ]),
      );
      return h;
    };
    const hit = mk();
    hit.m.eraseAt({ x: 53, y: 30 }, 5); // 中心距 bbox 右缘 x=48 恰 5
    expect(hit.m.lines.length).toBe(0); // 唯一笔画被删 → 行擦空移除
    expect(hit.fp.callCount).toBe(1); // 擦空的行不重算
    const miss = mk();
    miss.m.eraseAt({ x: 53, y: 30 }, 4.9);
    expect(miss.m.lines.length).toBe(1);
    expect(miss.m.lines[0].strokes.length).toBe(1);
    expect(miss.fp.callCount).toBe(1); // 未命中不触发重算
  });

  it('一次擦除跨两行 → 各行各重算一次，done 行重开', () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    fp.queue(outWriting());
    const l2s1 = polyline([
      [10, 50],
      [18, 80],
    ]);
    m.addStroke(l2s1);
    fp.queue(outWriting());
    const l2s2 = polyline([
      [40, 50],
      [48, 80],
    ]);
    m.addStroke(l2s2);
    const before = fp.callCount; // 6
    m.eraseAt({ x: 12, y: 47 }, 5); // 同时命中 L1 首笔（bbox 下缘 45，距 2）与 L2 首笔（bbox 上缘 50，距 3）
    expect(m.lines.length).toBe(2);
    const l1 = m.lines[0];
    expect(l1.strokes.length).toBe(3); // L1 失去 '1'
    expect(l1.status).toBe('writing'); // done → 重开
    expect(l1.result).toBeNull();
    const l2 = m.lines[1];
    expect(l2.strokes).toEqual([l2s2]);
    expect(fp.callCount).toBe(before + 2); // 两行各重算一次
    expect(fp.calls.at(-2)).toEqual(l1.strokes);
    expect(fp.calls.at(-1)).toEqual([l2s2]);
  });

  it('擦空 done 行 → 行整体移除且不重算', () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    m.eraseAt({ x: 30, y: 30 }, 200); // 大半径全擦
    expect(m.lines.length).toBe(0);
    expect(fp.callCount).toBe(4); // 无多余重算
  });
});

// ---------------------------------------------------------------- 规则 7

describe('setAlt：候选纠正（规则 7）', () => {
  it('writing 行改 label → 仅重算该行，glyph label/alts 更新', () => {
    const { fp, m } = makeManager();
    const gs = [gl('1', 10, 15, 18, 45), gl('2', 24, 15, 34, 45)];
    const s1 = polyline([
      [10, 15],
      [18, 45],
    ]);
    const s2 = polyline([
      [24, 15],
      [34, 45],
    ]);
    fp.queue(outWriting(gs), outWriting(gs)); // fake 重跑输出同引用，模拟管线尊重纠正
    m.addStroke(s1);
    m.addStroke(s2);
    const before = fp.callCount;
    m.setAlt(1, 1, '3');
    expect(fp.callCount).toBe(before + 1); // 仅重算该行一次
    expect(fp.calls.at(-1)).toEqual([s1, s2]);
    expect(gs[1].label).toBe('3'); // setAlt 确实改写了 glyph label
    expect(gs[1].alts).toContain('3');
  });

  it('done 行 setAlt → 重算并按新 result 更新 status/result', () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    const gs = m.lines[0].glyphs; // ['1','2','=']
    fp.queue(outCompare([...gs, gl('4', 75, 20, 85, 40)], '13', '4', true));
    m.setAlt(1, 1, '3'); // '2' → '3'，lhs 变 13
    const line = m.lines[0];
    expect(gs[1].label).toBe('3');
    expect(line.status).toBe('done');
    expect(line.result).toEqual({ type: 'compare', lhs: '13', rhs: '4', match: true });
  });

  it('两行时 setAlt 只重算目标行（另一行不进 pipeline）', () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] }); // L1
    fp.queue(outWriting());
    const sL2 = polyline([
      [200, 115],
      [208, 145],
    ]); // cy=130 超出 L1 y 容差 → 不续写，开新行
    m.addStroke(sL2); // L2
    const before = fp.callCount;
    fp.queue(outWriting(m.lines[0].glyphs));
    m.setAlt(1, 0, '7');
    expect(fp.callCount).toBe(before + 1);
    expect(fp.calls.at(-1)).toEqual(m.lines[0].strokes); // 只含 L1 的 4 笔
  });

  it('未知 lineId / 越界 glyphIndex → 无操作不抛、不触发 pipeline', () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    const before = fp.callCount;
    expect(() => m.setAlt(999, 0, '3')).not.toThrow();
    expect(() => m.setAlt(1, 99, '3')).not.toThrow();
    expect(fp.callCount).toBe(before);
  });
});

// ---------------------------------------------------------------- clear

describe('clear：全清空', () => {
  it('清空所有行、行 id 重新从 1 计数', () => {
    const { fp, m } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    fp.queue(outWriting());
    m.addStroke(
      polyline([
        [10, 100],
        [18, 130],
      ]),
    );
    expect(m.lines.length).toBe(2);
    m.clear();
    expect(m.lines.length).toBe(0);
    fp.queue(outWriting());
    m.addStroke(
      polyline([
        [10, 15],
        [18, 45],
      ]),
    );
    expect(m.lines.length).toBe(1);
    expect(m.lines[0].id).toBe(1);
  });
});

// ---------------------------------------------------------------- T4 契约

describe('T4 契约：pipeline 异常与预热重试', () => {
  it('非 warmup 故障 → 笔画保留、status 维持 writing、不调度重跑', () => {
    const { fp, m, scheduled } = makeManager();
    fp.queue(new Error('识别引擎未就绪：模型缺失'));
    const s = polyline([
      [10, 15],
      [18, 45],
    ]);
    expect(() => m.addStroke(s)).not.toThrow();
    expect(m.lines[0].strokes).toEqual([s]);
    expect(m.lines[0].status).toBe('writing');
    expect(m.lines[0].result).toBeNull();
    expect(scheduled.length).toBe(0);
    expect(fp.callCount).toBe(1);
  });

  it('非 warmup 故障发生在 rhs 续写重开行 → 旧 result 保留', () => {
    const { fp, m, scheduled } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    fp.queue(new Error('识别引擎未就绪：会话释放'));
    m.addStroke(rhsStroke());
    const line = m.lines[0];
    expect(line.status).toBe('writing');
    expect(line.result).toEqual({ type: 'value', lhs: '12', value: '46' }); // 重开验算行保留旧 result
    expect(line.strokes.length).toBe(5);
    expect(scheduled.length).toBe(0);
  });

  it('WarmupError → 注入 scheduler 同拍延迟重跑一次并成功', () => {
    const { fp, m, scheduled } = makeManager();
    fp.queue(WARMUP_ERR());
    m.addStroke(
      polyline([
        [10, 15],
        [18, 45],
      ]),
    );
    expect(scheduled.length).toBe(1);
    expect(m.lines[0].status).toBe('writing');
    expect(m.lines[0].glyphs).toEqual([]);
    fp.queue(outWriting([gl('2', 10, 15, 18, 45)]));
    scheduled[0]();
    expect(fp.callCount).toBe(2);
    expect(m.lines[0].glyphs.length).toBe(1);
    expect(m.lines[0].status).toBe('writing');
  });

  it('同一行连续 5 次 WarmupError 后停止自动重跑；行保持 writing、result 保持空', () => {
    const { fp, m, scheduled } = makeManager();
    fp.queue(WARMUP_ERR(), WARMUP_ERR(), WARMUP_ERR(), WARMUP_ERR(), WARMUP_ERR());
    m.addStroke(
      polyline([
        [10, 15],
        [18, 45],
      ]),
    ); // run1 → warmup1 → schedule
    scheduled[0](); // run2 → warmup2 → schedule
    scheduled[1](); // run3 → warmup3 → schedule
    scheduled[2](); // run4 → warmup4 → schedule
    scheduled[3](); // run5 → warmup5 → 停止
    expect(fp.callCount).toBe(5);
    expect(scheduled.length).toBe(4); // 不再新增
    expect(m.lines[0].status).toBe('writing');
    expect(m.lines[0].result).toBeNull();
    expect(m.lines[0].strokes.length).toBe(1); // 笔画保留
  });

  it('上限触顶后的新用户动作重置重试链，重新获得重试机会', () => {
    const { fp, m, scheduled } = makeManager();
    fp.queue(WARMUP_ERR(), WARMUP_ERR(), WARMUP_ERR(), WARMUP_ERR(), WARMUP_ERR());
    m.addStroke(
      polyline([
        [10, 15],
        [18, 45],
      ]),
    );
    for (let i = 0; i < 4; i++) scheduled[i]();
    expect(fp.callCount).toBe(5);
    expect(scheduled.length).toBe(4);
    fp.queue(WARMUP_ERR());
    m.addStroke(
      polyline([
        [24, 15],
        [34, 45],
      ]),
    ); // 用户动作 → 计数重置 → run6 warmup → schedule
    expect(scheduled.length).toBe(5);
    expect(fp.callCount).toBe(6);
    fp.queue(outWriting());
    scheduled[4]();
    expect(fp.callCount).toBe(7);
    expect(m.lines[0].strokes.length).toBe(2);
    expect(m.lines[0].status).toBe('writing');
  });

  it('done 行 undo 遇 WarmupError → result 已清 null、status writing、调度重跑成功', () => {
    const { fp, m, scheduled } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    fp.queue(WARMUP_ERR());
    m.undo(); // 重开（result 清 null）→ 重算抛 warmup → 调度
    expect(m.lines[0].status).toBe('writing');
    expect(m.lines[0].result).toBeNull();
    expect(scheduled.length).toBe(1);
    fp.queue(outWriting());
    scheduled[0]();
    expect(fp.callCount).toBe(6);
    expect(m.lines[0].status).toBe('writing');
  });

  it('done 行 setAlt 遇 WarmupError → 旧 result 保留、status writing；重跑成功后按新 result 更新', () => {
    const { fp, m, scheduled } = makeManager();
    addValueLine({ fp, m, scheduled: [] });
    const gs = m.lines[0].glyphs;
    fp.queue(WARMUP_ERR());
    m.setAlt(1, 0, '7');
    expect(m.lines[0].status).toBe('writing');
    expect(m.lines[0].result).toEqual({ type: 'value', lhs: '12', value: '46' }); // 旧 result 保留
    fp.queue(outValue(gs, '72', '72'));
    scheduled[0]();
    expect(m.lines[0].status).toBe('done');
    expect(m.lines[0].result).toEqual({ type: 'value', lhs: '72', value: '72' });
  });
});

// ---------------------------------------------------------------- 两阶段假识别器 + 真实管线

describe('两阶段假识别器 + createPipeline：catch-and-rerun 闭环', () => {
  /** 首见图抛 WarmupError、settle() 后同图返回候选（模拟 OrtRecognizer 语义）。 */
  class TwoPhaseRecognizer {
    private readonly cache = new Map<string, { label: SymbolLabel; prob: number }[] | null>();
    private readonly imgs = new Map<string, Float32Array>();

    constructor(
      private readonly table: (img: Float32Array) => { label: SymbolLabel; prob: number }[],
    ) {}

    classify(img: Float32Array): { label: SymbolLabel; prob: number }[] {
      const key = img.join(',');
      this.imgs.set(key, img);
      const cached = this.cache.get(key);
      if (cached === undefined) {
        this.cache.set(key, null); // 标记预热中
        throw new Error('识别预热中：首见图，后台推理进行中');
      }
      if (cached === null) throw new Error('识别预热中：仍在预热');
      return cached;
    }

    /** 后台推理全部完成：预热中的图按查表产出候选。 */
    settle(): void {
      for (const [key, v] of this.cache) {
        if (v === null) this.cache.set(key, this.table(this.imgs.get(key)!));
      }
    }
  }

  it('首调预热 → 调度重跑成功出 value；rhs 续写预热 → 重跑产出 compare ✓', () => {
    const rec = new TwoPhaseRecognizer(() => [
      { label: '2', prob: 0.9 },
      { label: '3', prob: 0.07 },
      { label: '1', prob: 0.03 },
    ]);
    const scheduled: Array<() => void> = [];
    const m = new LineManager(
      createPipeline((img) => rec.classify(img)),
      40,
      (fn) => scheduled.push(fn),
    );

    // 第一笔 '2'（竖线形状）→ 首见图预热 → 行保持 writing
    m.addStroke(vLine(20, 15, 45));
    expect(m.lines[0].status).toBe('writing');
    expect(m.lines[0].glyphs).toEqual([]);
    rec.settle();
    scheduled[0](); // 同拍重跑 → 缓存命中
    expect(m.lines[0].glyphs.length).toBe(1);
    expect(m.lines[0].glyphs[0].label).toBe('2');

    // '=' 第一条横线：单横 → fracbar（无 '=' → writing；已见图缓存命中、无需重跑）
    m.addStroke(hLine(35, 55, 25));
    expect(m.lines[0].status).toBe('writing');
    expect(m.lines[0].glyphs.some((g) => g.label === 'fracbar')).toBe(true);
    // 第二条横线 → 两横堆叠成 '=' → done，value '2'
    m.addStroke(hLine(35, 55, 31));
    expect(m.lines[0].status).toBe('done');
    expect(m.lines[0].result).toEqual({ type: 'value', lhs: '2', value: '2' });

    // rhs 续写（新形状 → 预热）：重开保留旧 result，调度重跑
    m.addStroke(
      polyline([
        [62, 15],
        [72, 45],
        [62, 45],
      ]),
    );
    expect(m.lines[0].status).toBe('writing');
    expect(m.lines[0].result).toEqual({ type: 'value', lhs: '2', value: '2' });
    rec.settle();
    scheduled.at(-1)!();
    expect(m.lines[0].status).toBe('done');
    expect(m.lines[0].result).toEqual({ type: 'compare', lhs: '2', rhs: '2', match: true });
  });
});

// ---------------------------------------------------------------- 纠正持久化（setAlt 跨重跑）

describe('纠正持久化：setAlt overrides 跨重跑不被 CNN top-1 覆盖', () => {
  /**
   * 真实 createPipeline + 晚期绑定纠正查询（lines.ts labelOverride 注释钉死的
   * Task 8 装配模式）+ 注入 scheduler。classify 桩：任何图恒返回同一 top-3
   * （top-1 '2'），与图像无关 → 重跑重分类结果可预言，纠正是否生效完全取决于
   * override 命中。
   */
  function makeRealManager(): { m: LineManager; scheduled: Array<() => void> } {
    const scheduled: Array<() => void> = [];
    let manager: LineManager | null = null;
    const pipeline = createPipeline(() => TOP3, 40, (img) => manager?.labelOverride(img) ?? null);
    const m = new LineManager(pipeline, 40, (fn) => {
      scheduled.push(fn);
    });
    manager = m;
    return { m, scheduled };
  }

  // 恒定 top-3（与图像无关）：top-1 '2'，候选含 '3' '1'。
  const TOP3 = [
    { label: '2' as SymbolLabel, prob: 0.9 },
    { label: '3' as SymbolLabel, prob: 0.07 },
    { label: '1' as SymbolLabel, prob: 0.03 },
  ];

  // 三个互不相同、均进 classify 的形状（无几何合并，图内容各异）。
  const shapeA = (): Stroke => vLine(20, 15, 45);
  const shapeB = (): Stroke =>
    polyline([
      [50, 15],
      [58, 45],
      [50, 45],
    ]);
  const shapeRhs = (): Stroke =>
    polyline([
      [62, 15],
      [72, 45],
      [62, 45],
    ]);

  it('① writing 行纠正后追加新笔画重跑，纠正仍生效（同图重分类命中 override）', () => {
    const { m } = makeRealManager();
    m.addStroke(shapeA());
    expect(m.lines[0].glyphs[0].label).toBe('2'); // 桩 top-1
    expect(m.lines[0].glyphs[0].conf).toBeLessThan(1);
    m.setAlt(1, 0, '3');
    // 重算即命中：label=override，原 top-1 '2' 插入 alts 首位，conf 置 1
    const g = m.lines[0].glyphs[0];
    expect(g.label).toBe('3');
    expect(g.alts).toEqual(['2', '3', '1']);
    expect(g.conf).toBe(1);
    // 追加新笔 → 整行重分割重分类 → A 的纠正仍生效，B 无纠正为 top-1
    m.addStroke(shapeB());
    expect(m.lines[0].glyphs.map((x) => x.label)).toEqual(['3', '2']);
    expect(m.lines[0].glyphs[0].alts[0]).toBe('2'); // 仍可循环切回
  });

  it("② done(value) 行 rhs 续写重算，LHS 纠正仍生效（compare 用纠正后的 lhs）", () => {
    const { m } = makeRealManager();
    m.addStroke(shapeA());
    m.addStroke(hLine(35, 55, 25)); // 单横 → fracbar（无 '=' → writing）
    m.addStroke(hLine(35, 55, 31)); // 两横堆叠 → '=' → done value '2'
    expect(m.lines[0].result).toEqual({ type: 'value', lhs: '2', value: '2' });
    m.setAlt(1, 0, '3'); // LHS 纠正 → 重算 value '3'
    expect(m.lines[0].result).toEqual({ type: 'value', lhs: '3', value: '3' });
    // rhs 续写 → 重跑重分割 → LHS 纠正跨重跑持久 → compare('3','2') 不匹配
    m.addStroke(shapeRhs());
    const line = m.lines[0];
    expect(line.glyphs[0].label).toBe('3');
    expect(line.status).toBe('done');
    expect(line.result).toEqual({ type: 'compare', lhs: '3', rhs: '2', match: false });
  });

  it('③ setAlt 循环切回原 top-1（override=原 label）→ label 复原、conf 置 1、不破坏后续重跑', () => {
    const { m } = makeRealManager();
    m.addStroke(shapeA());
    m.setAlt(1, 0, '3');
    expect(m.lines[0].glyphs[0].label).toBe('3');
    m.setAlt(1, 0, '2'); // 用户循环候选切回原 top-1 → override 改写为 '2'
    const g = m.lines[0].glyphs[0];
    expect(g.label).toBe('2');
    expect(g.conf).toBe(1); // override 命中（=原 label）同样置 1
    expect(g.alts[0]).toBe('2'); // alts 含当前 label
    // 再追加新笔重跑：override('2') 与 classify top-1 一致，纠正路径不引入偏差
    m.addStroke(shapeB());
    expect(m.lines[0].glyphs.map((x) => x.label)).toEqual(['2', '2']);
  });

  it('④ clear() 清空 overrides → 同图重写不再命中纠正', () => {
    const { m } = makeRealManager();
    m.addStroke(shapeA());
    m.setAlt(1, 0, '3');
    expect(m.lines[0].glyphs[0].label).toBe('3');
    m.clear();
    expect(m.lines.length).toBe(0);
    m.addStroke(shapeA()); // 同形状 → 同图
    expect(m.lines[0].glyphs[0].label).toBe('2'); // 纠正已随 clear 丢弃
  });

  it('⑤ undo/erase 移除笔画不清 overrides → 同图重写仍命中（图不变即持久）', () => {
    const { m } = makeRealManager();
    m.addStroke(shapeA());
    m.setAlt(1, 0, '3');
    expect(m.lines[0].glyphs[0].label).toBe('3');
    m.undo(); // 唯一笔画被撤 → 行移除，overrides 保留
    expect(m.lines.length).toBe(0);
    m.addStroke(shapeA()); // 同图重写
    expect(m.lines[0].glyphs[0].label).toBe('3'); // 纠正仍命中
  });
});
