/**
 * Task 7：行状态机 —— 稿纸「一行一条算式」的编排层。
 *
 * LineManager 只管行的生命周期与几何判定（分行 / rhs 续写 / 撤销 / 橡皮 /
 * 候选纠正），识别与求值全部经注入的 LinePipeline（依赖注入，测试用假实现）：
 *
 *   addStroke   → 笔画进当前 writing 行，随后【仅对该行】跑 pipeline；
 *                 done 行永不重跑（Review Focus 4：几十行后单笔增量 O(该行)）。
 *   done 判定   → pipeline 返回 eq 非 null（契约：仅当行内含 '=' 时非 null）
 *                 → status='done'、result=pipeline 返回值（rhs 空 → value 型，
 *                 即 `12=` → 46；有 rhs → compare 型）。
 *   rhs 续写    → done 行之后的新笔先判续写：行 glyphs 中存在 '=' glyph、
 *                 新笔 x 中心 > '=' bbox.x1 且 y 中心在该行 bbox y ±1px 内
 *                 → 重开该行（status='writing'，result 暂保留旧值以免闪烁），
 *                 笔画追加后重跑（新 result 应为 compare 型）。compare 行同样
 *                 适用（规则 5：用户笔迹永不删除/覆盖）。其余一律开新行。
 *   undo/eraseAt → done 行重开（status='writing'、result 清 null）后重算；
 *                 撤 '=' 或擦 '=' 后重算 eq=null → 结果消失可续写（手测 ⑰）。
 *   setAlt      → 替换 glyph label（alts 同步收录）后仅重算该行；done 行按
 *                 新 result 更新 status/result（手测 ⑲ 候选纠正即时重算）。
 *
 * T4 审查附加契约（识别引擎同步契约的暂态处理）：
 *   - pipeline.run 的全部调用点（addStroke/undo/eraseAt/rhs 续写/setAlt 以及
 *     由它们调度的延迟重跑）包 try/catch：捕获后保留笔画、status 维持
 *     'writing'（rhs 续写 / setAlt 重开的验算行保留旧 result；undo/eraseAt
 *     重开行按规则 4 已清 null），视为暂态，不向 UI 抛错。
 *   - 捕获 WarmupError（message 前缀 '识别预热中：'，见 recognize.ts）→ 经
 *     构造注入的 rerunScheduler（默认 queueMicrotask）在【同拍内】调度一次
 *     延迟重跑（重跑同样 try/catch；执行时行已 done/被移除则跳过）。
 *   - 重试上限：同一行【连续】5 次 WarmupError 后停止自动重跑（防无限循环）；
 *     行保持 writing、result 保持旧值/空。用户动作（addStroke/undo/eraseAt/
 *     setAlt）重置该行计数、成功重算也归零 —— 引擎热身完成后下次书写可自愈。
 *
 * createPipeline：默认真实管线 = segmentGlyphs（行高取行内非退化笔画高度
 * 中位数，退化时回退默认行高）→ correctGlyphs（解析前 alts 纠错）→
 * parseEquation → evalEquation；eq 仅在行内含 '=' 时非 null。
 */
import { evalEquation, type EvalResult } from './evaluate';
import { correctGlyphs } from './grammar';
import { parseEquation } from './parse2d';
import { segmentClassify } from './recognize';
import { segmentGlyphs, type ClassifyFn } from './segment';
import { bboxOf } from './strokes';
import type { BBox, Equation, Glyph, Stroke, SymbolLabel } from './types';

// ---------------------------------------------------------------- 钉死接口

/** 一行的状态：Vue reactive 由 Task 8 包一层，这里保持纯数据（字段可变）。 */
export interface LineState {
  id: number;
  strokes: Stroke[];
  glyphs: Glyph[];
  status: 'writing' | 'done';
  result: EvalResult | null;
}

/**
 * 一行的识别-求值流水线（依赖注入）。
 * 契约：行内含 '=' 时 eq 非 null（此时 result 为 evalEquation 的三态之一）；
 * 无 '=' 时 eq/result 均为 null。任何失败以抛错表达（由 LineManager 捕获）。
 */
export interface LinePipeline {
  run(strokes: Stroke[]): { glyphs: Glyph[]; eq: Equation | null; result: EvalResult | null };
}

// ---------------------------------------------------------------- 常量

/** WarmupError 判别前缀（recognize.ts 错误前缀契约；故障前缀 '识别引擎未就绪：' 不重跑）。 */
const WARMUP_PREFIX = '识别预热中：';
/** 同一行连续 WarmupError 自动重跑上限（含首次调用；防无限循环）。 */
const MAX_CONSECUTIVE_WARMUP = 5;
/** rhs 续写的 y 容差（px）：行 bbox y0/y1 外扩 1px 仍算该行。 */
const RHS_Y_TOL = 1;
/** 行高退化（无有效笔画高度）时的默认参考行高。 */
const DEFAULT_LINE_HEIGHT = 40;

// ---------------------------------------------------------------- LineManager

export class LineManager {
  /** 各行状态（按创建序）。数组引用只读，内容（行/字段）按语义可变。 */
  readonly lines: LineState[] = [];
  /** 行高参考（UI 布局可用；状态机几何判定均基于行自身 bbox）。 */
  readonly lineHeightHint: number;

  private readonly pipeline: LinePipeline;
  private readonly scheduleRerun: (fn: () => void) => void;
  /** 行 id → 连续 WarmupError 次数（用户动作/成功重算归零）。 */
  private readonly warmupFailures = new Map<number, number>();
  private nextLineId = 1;

  constructor(
    pipeline: LinePipeline,
    lineHeightHint?: number,
    rerunScheduler?: (fn: () => void) => void,
  ) {
    this.pipeline = pipeline;
    this.lineHeightHint = lineHeightHint ?? DEFAULT_LINE_HEIGHT;
    this.scheduleRerun = rerunScheduler ?? ((fn: () => void) => queueMicrotask(fn));
  }

  /**
   * 追加一笔：当前 writing 行存在则入该行；否则先判 done 尾行的 rhs 续写，
   * 不满足续写一律开新行。随后仅对受影响的一行跑 pipeline。
   */
  addStroke(s: Stroke): void {
    const last = this.lines[this.lines.length - 1] ?? null;
    if (last !== null && last.status === 'writing') {
      last.strokes.push(s);
      this.recomputeLine(last);
      return;
    }
    if (last !== null && this.isRhsContinuation(last, s)) {
      // 重开验算行：result 暂保留旧值，重算成功后替换为 compare（规则 3）
      last.status = 'writing';
      last.strokes.push(s);
      this.recomputeLine(last);
      return;
    }
    const line: LineState = {
      id: this.nextLineId++,
      strokes: [s],
      glyphs: [],
      status: 'writing',
      result: null,
    };
    this.lines.push(line);
    this.recomputeLine(line);
  }

  /**
   * 撤销全局最后一笔（按追加序，即最后一个非空行的最后一笔）。
   * 该行若因此清空则整行移除；否则 done 行重开（writing、result 清 null）并重算。
   */
  undo(): void {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const line = this.lines[i];
      if (line.strokes.length === 0) continue;
      line.strokes.pop();
      if (line.strokes.length === 0) {
        this.lines.splice(i, 1);
        return;
      }
      this.reopenLine(line, /* keepResult */ false);
      this.recomputeLine(line);
      return;
    }
  }

  /**
   * 橡皮：删除笔画 bbox 与橡皮圆（圆心 pt、半径 r，相交判定取点到 bbox 的
   * 最近距离 ≤ r）相交的笔画，波及所有行；被擦空的行整行移除；其余受影响行
   * done 重开（writing、result 清 null）后各重算一次。
   */
  eraseAt(pt: { x: number; y: number }, r: number): void {
    const affected: LineState[] = [];
    for (const line of this.lines) {
      const before = line.strokes.length;
      if (before === 0) continue;
      line.strokes = line.strokes.filter((st) => !strokeHitsCircle(st, pt, r));
      if (line.strokes.length !== before) affected.push(line);
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (this.lines[i].strokes.length === 0) this.lines.splice(i, 1);
    }
    for (const line of affected) {
      if (!this.lines.includes(line)) continue; // 已擦空移除，无需重算
      this.reopenLine(line, /* keepResult */ false);
      this.recomputeLine(line);
    }
  }

  /** 全清空（行 id 重新从 1 计数，重试状态一并丢弃）。 */
  clear(): void {
    this.lines.splice(0, this.lines.length);
    this.warmupFailures.clear();
    this.nextLineId = 1;
  }

  /**
   * 候选纠正：替换该行第 glyphIndex 个 glyph 的 label（alts 同步收录新值，
   * 供 UI 循环切换），随后仅重算该行。done 行重开时保留旧 result（重算成功
   * 后按新 result 更新 status/result；失败则停在 writing + 旧 result）。
   */
  setAlt(lineId: number, glyphIndex: number, label: SymbolLabel): void {
    const line = this.lines.find((l) => l.id === lineId);
    if (!line) return;
    const g = line.glyphs[glyphIndex];
    if (!g) return;
    g.label = label;
    if (!g.alts.includes(label)) g.alts.unshift(label);
    this.reopenLine(line, /* keepResult */ true);
    this.recomputeLine(line);
  }

  // ------------------------------------------------------------ 内部：几何判定

  /**
   * rhs 续写判定（规则 3/5，对 value/compare/error 型 done 行统一适用）：
   * 行 glyphs 存在 '=' glyph、新笔 x 中心 > '=' bbox.x1、y 中心在行 bbox
   * y ±RHS_Y_TOL 内。'=' 取 bbox.x0 最小者（与 parseEquation 取第一个 '=' 一致）。
   */
  private isRhsContinuation(line: LineState, s: Stroke): boolean {
    const eq = firstEqGlyph(line.glyphs);
    if (eq === null) return false;
    const bb = bboxOf([s]);
    const cx = (bb.x0 + bb.x1) / 2;
    const cy = (bb.y0 + bb.y1) / 2;
    if (cx <= eq.bbox.x1) return false;
    const lineBb = bboxOf(line.strokes);
    return cy >= lineBb.y0 - RHS_Y_TOL && cy <= lineBb.y1 + RHS_Y_TOL;
  }

  // ------------------------------------------------------------ 内部：行生命周期

  /** 重开一行：status='writing'；keepResult=false 时 result 清 null（undo/eraseAt）。 */
  private reopenLine(line: LineState, keepResult: boolean): void {
    line.status = 'writing';
    if (!keepResult) line.result = null;
  }

  /** 用户动作触发的重算：重置该行预热重试链后立即执行一次。 */
  private recomputeLine(line: LineState): void {
    this.warmupFailures.set(line.id, 0);
    this.runLine(line);
  }

  /**
   * 跑一行 pipeline 并落地结果（全部调用点的 try/catch 收口在此）。
   * 成功：glyphs/eq/result 按返回值更新，eq 非 null → done。
   * WarmupError：计数 +1，未达上限则经 scheduler 同拍延迟重跑（执行时校验
   * 行仍存在且 writing）；达上限停止。其它错误：视为暂态，保留现状不调度。
   */
  private runLine(line: LineState): void {
    try {
      const out = this.pipeline.run(line.strokes.slice());
      line.glyphs = out.glyphs;
      if (out.eq !== null) {
        line.status = 'done';
        line.result = out.result;
      } else {
        line.status = 'writing';
        line.result = null;
      }
      this.warmupFailures.set(line.id, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.startsWith(WARMUP_PREFIX)) return; // 故障：暂态，保留笔画与现状
      const failures = (this.warmupFailures.get(line.id) ?? 0) + 1;
      this.warmupFailures.set(line.id, failures);
      if (failures >= MAX_CONSECUTIVE_WARMUP) return; // 连续 5 次 → 停止自动重跑
      this.scheduleRerun(() => {
        if (!this.lines.includes(line)) return; // 行已被擦空/清空移除
        if (line.status !== 'writing') return; // 已在别处完成 → done 行永不重跑
        this.runLine(line);
      });
    }
  }
}

// ---------------------------------------------------------------- 真实管线

/**
 * 默认 LinePipeline：segmentGlyphs → correctGlyphs → parseEquation → evalEquation。
 * 行高 = 行内非退化笔画（高度 > 0）的 bbox 高度中位数（偶数取上中位），全退化
 * （如整行只有横条）时回退 fallbackLineHeight；eq 仅在纠错后仍含 '=' 时非 null。
 */
export function createPipeline(
  classify: ClassifyFn = segmentClassify(),
  fallbackLineHeight: number = DEFAULT_LINE_HEIGHT,
): LinePipeline {
  return {
    run(strokes: Stroke[]): { glyphs: Glyph[]; eq: Equation | null; result: EvalResult | null } {
      const glyphs = correctGlyphs(segmentGlyphs(strokes, classify, lineHeightOf(strokes, fallbackLineHeight)));
      if (!glyphs.some((g) => g.label === '=')) return { glyphs, eq: null, result: null };
      const eq = parseEquation(glyphs);
      return { glyphs, eq, result: evalEquation(eq) };
    },
  };
}

/** 行高参考：非退化笔画高度的中位数（偶数取上中位）；无有效高度回退 fallback。 */
function lineHeightOf(strokes: Stroke[], fallback: number): number {
  const heights: number[] = [];
  for (const s of strokes) {
    const bb = bboxOf([s]);
    const h = bb.y1 - bb.y0;
    if (h > 0) heights.push(h);
  }
  if (heights.length === 0) return fallback;
  heights.sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)];
}

// ---------------------------------------------------------------- 小工具

/** 行内第一个 '=' glyph（按 bbox.x0 最小，与 parseEquation 的切分语义一致）。 */
function firstEqGlyph(glyphs: Glyph[]): Glyph | null {
  let best: Glyph | null = null;
  for (const g of glyphs) {
    if (g.label !== '=') continue;
    if (best === null || g.bbox.x0 < best.bbox.x0) best = g;
  }
  return best;
}

/** 笔画 bbox 与橡皮圆相交：点到 bbox 最近点距离 ≤ r（bbox 退化为点/线同样适用）。 */
function strokeHitsCircle(s: Stroke, pt: { x: number; y: number }, r: number): boolean {
  const bb: BBox = bboxOf([s]);
  const nx = Math.max(bb.x0, Math.min(pt.x, bb.x1));
  const ny = Math.max(bb.y0, Math.min(pt.y, bb.y1));
  const dx = pt.x - nx;
  const dy = pt.y - ny;
  return dx * dx + dy * dy <= r * r;
}
