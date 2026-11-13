import { beforeAll, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { createPipeline, LineManager, type LinePipeline } from '../src/core/lines';
import { ENGINE_DOWN_MESSAGE, wrapPipeline } from '../src/usePaper';
import { OrtRecognizer, WarmupError } from '../src/core/recognize';
import { segmentGlyphs } from '../src/core/segment';
import { bboxOf, normalizeGlyph } from '../src/core/strokes';
import { polyline } from './helpers/synth';
import type { Glyph, Stroke } from '../src/core/types';
import {
  scaleHandwriting,
  screenshotOnePlusFour,
  screenshotTwoPlusFive,
  reviewAdjacent21,
  reviewParenthesizedFraction11,
  reviewNegativeFraction,
  reviewScreenshotCapAsFraction,
  reviewRhsFractionDuringWarmup,
  type HandwritingFixture,
} from './fixtures/handwriting-screenshot';

function evidence(gs: Glyph[]): string {
  return JSON.stringify(gs.map((g) => ({
    label: g.label, alts: g.alts, conf: g.conf, ids: g.strokes.map((s) => s.id), bbox: g.bbox,
  })));
}

/** Same async boundary as the UI: reruns wait for actual ORT work, never for a fixed timeout. */
function realManager(rec: OrtRecognizer, decorate: (pipeline: LinePipeline) => LinePipeline = (pipeline) => pipeline) {
  const pending = new Set<Promise<void>>();
  let manager: LineManager;
  const pipeline = decorate(createPipeline((img) => rec.classify(img), 40, (img) => manager.labelOverride(img)));
  manager = new LineManager(pipeline, 40, (fn) => {
    const task = rec.whenSettled().then(fn);
    pending.add(task);
    void task.then(() => pending.delete(task));
  });
  return {
    manager,
    async settled() {
      while (pending.size > 0) await Promise.all([...pending]);
      await rec.whenSettled();
      expect(rec.lastError).toBeNull();
    },
  };
}

function scaledInk(strokes: Stroke[], scale: number): Stroke[] {
  return strokes.map((s) => ({ id: s.id, pts: s.pts.map((p) => ({ ...p, x: p.x * scale, y: p.y * scale })) }));
}

async function settledRun(rec: OrtRecognizer, strokes: Stroke[]) {
  const pipeline = createPipeline((img) => rec.classify(img));
  for (let i = 0; i < 4; i++) {
    try {
      return pipeline.run(strokes);
    } catch (e) {
      if (!(e instanceof WarmupError)) throw e;
      await rec.whenSettled();
    }
  }
  throw new Error('pipeline did not settle');
}

function expectInkPreserved(gs: Glyph[], strokes: Stroke[]) {
  const ids = gs.flatMap((g) => g.strokes.map((s) => s.id));
  expect(ids.sort((a, b) => a - b), evidence(gs)).toEqual(strokes.map((s) => s.id).sort((a, b) => a - b));
  for (const g of gs) {
    expect(g.bbox).toEqual(bboxOf(g.strokes));
    expect(g.alts).toContain(g.label);
  }
}

async function settledSegment(rec: OrtRecognizer, strokes: Stroke[], height: number) {
  // Segment alone aborts on its first missing image; bounded retries cover these two-stroke glyphs.
  for (let i = 0; i < 4; i++) {
    try {
      return segmentGlyphs(strokes, (img) => rec.classify(img), height);
    } catch (e) {
      if (!(e instanceof WarmupError)) throw e;
      await rec.whenSettled();
    }
  }
  throw new Error('segment did not settle');
}

describe('usePaper production pipeline wrapping', () => {
  it('forwards a present geometric-equality hook with the original strokes and inner receiver', () => {
    const strokes = scaleHandwriting(screenshotOnePlusFour);
    const inner = {
      reference: strokes,
      run: () => ({ glyphs: [], eq: null, result: null }),
      hasGeometricEquality(input: Stroke[]) {
        return this.reference === input && input.some((s) => s.id === 7);
      },
    };
    const wrapped = wrapPipeline(inner, ref<string | null>(null));
    expect(wrapped.hasGeometricEquality?.(strokes)).toBe(true);
    expect(wrapped.hasGeometricEquality?.(strokes.slice(0, -1))).toBe(false);
  });

  it('leaves the optional structure hook absent when the inner pipeline does not provide one', () => {
    const wrapped = wrapPipeline({ run: () => ({ glyphs: [], eq: null, result: null }) }, ref<string | null>(null));
    expect(wrapped.hasGeometricEquality).toBeUndefined();
  });

  it.each([
    { error: new WarmupError('识别预热中：后台推理进行中'), expected: null },
    { error: new Error('识别引擎未就绪：会话失败'), expected: ENGINE_DOWN_MESSAGE },
    { error: new Error('unrelated pipeline failure'), expected: null },
  ])('preserves the existing run error-prefix handling for $error.message', ({ error, expected }) => {
    const engineError = ref<string | null>(null);
    const wrapped = wrapPipeline({ run: () => { throw error; } }, engineError);
    let caught: unknown;
    try {
      wrapped.run([]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(error);
    expect(engineError.value).toBe(expected);
  });
});

describe('screenshot handwriting through the real WASM recognizer', () => {
  let rec: OrtRecognizer;
  beforeAll(async () => {
    rec = new OrtRecognizer('public/model/recog.onnx');
    await rec.init();
  }, 120_000);

  it('review adjacent 21 retains two numeral glyphs instead of treating a bottom sweep as a 4 crossbar', async () => {
    const out = await settledRun(rec, reviewAdjacent21);
    expect(out.glyphs.map((g) => g.strokes.map((s) => s.id)), evidence(out.glyphs)).toEqual([[501], [502], [503, 504]]);
    expect(out.glyphs.map((g) => g.label), evidence(out.glyphs)).toEqual(['2', '1', '=']);
    expect(out.result).toEqual({ type: 'value', lhs: '21', value: '21' });
    expectInkPreserved(out.glyphs, reviewAdjacent21);
  });

  it.each([0.5, 1, 2])('review large parentheses around 11/11 at scale %s preserve digits and exact result 1', async (scale) => {
    const strokes = scaledInk(reviewParenthesizedFraction11, scale);
    const out = await settledRun(rec, strokes);
    expect(out.glyphs.map((g) => g.label), evidence(out.glyphs)).toEqual(['(', 'fracbar', '1', '1', '1', '1', ')', '=']);
    expect(out.result).toEqual({ type: 'value', lhs: '11/11', value: '1' });
    expectInkPreserved(out.glyphs, strokes);
  });

  it('review negative fraction keeps the numerator minus distinct from its longer fraction bar', async () => {
    const out = await settledRun(rec, reviewNegativeFraction);
    expect(out.glyphs.filter((g) => g.label === '=').map((g) => g.strokes.map((s) => s.id)), evidence(out.glyphs)).toEqual([[525, 526]]);
    expect(out.eq?.lhs).toEqual({
      kind: 'frac', num: { kind: 'seq', items: [{ kind: 'op', op: '-' }, { kind: 'num', text: '1' }] }, den: { kind: 'num', text: '1' },
    });
    expect(out.result).toEqual({ type: 'value', lhs: '(-1)/1', value: '-1' });
    expectInkPreserved(out.glyphs, reviewNegativeFraction);
  });

  it('review negative fraction remains one writing row after every settled stroke until the final equality bar', async () => {
    const cold = new OrtRecognizer('public/model/recog.onnx');
    await cold.init();
    const engineError = ref<string | null>(null);
    const { manager, settled } = realManager(cold, (pipeline) => wrapPipeline(pipeline, engineError));
    const states: Array<{ id: number; status: string; result: unknown }> = [];
    for (let i = 0; i < reviewNegativeFraction.length; i++) {
      const stroke = reviewNegativeFraction[i];
      manager.addStroke(stroke);
      await settled();
      const snapshot = JSON.stringify(manager.lines.map((line) => ({
        ids: line.strokes.map((s) => s.id), status: line.status, result: line.result, glyphs: evidence(line.glyphs),
      })));
      expect(manager.lines, `after stroke ${stroke.id}: ${snapshot}`).toHaveLength(1);
      const line = manager.lines[0];
      expectInkPreserved(line.glyphs, reviewNegativeFraction.slice(0, i + 1));
      if (i < reviewNegativeFraction.length - 1) {
        expect(line.status, `after stroke ${stroke.id}: ${snapshot}`).toBe('writing');
        expect(line.result, `after stroke ${stroke.id}: ${snapshot}`).toBeNull();
      }
      states.push({ id: stroke.id, status: line.status, result: line.result });
    }
    expect(states).toEqual([
      { id: 521, status: 'writing', result: null },
      { id: 522, status: 'writing', result: null },
      { id: 523, status: 'writing', result: null },
      { id: 524, status: 'writing', result: null },
      { id: 525, status: 'writing', result: null },
      { id: 526, status: 'done', result: { type: 'value', lhs: '(-1)/1', value: '-1' } },
    ]);
    expect(manager.lines[0].strokes).toEqual(reviewNegativeFraction);
    expect(engineError.value).toBeNull();
  });

  it('an equality still merges when a digit is above both bars rather than aligned with a numerator minus', async () => {
    const digit = polyline([[75, -30], [77, -5]]);
    const bars = [polyline([[60, 20], [100, 20]]), polyline([[60, 40], [100, 40]])];
    const strokes = [digit, ...bars];
    const gs = await settledSegment(rec, strokes, 40);
    expect(gs.map((g) => g.label), evidence(gs)).toEqual(['=', '1']);
    expect(gs.find((g) => g.label === '=')?.strokes).toEqual(bars);
    expectInkPreserved(gs, strokes);
  });

  it('review screenshot 5 top bar is a fraction line when it has a numerator and denominator', async () => {
    const out = await settledRun(rec, reviewScreenshotCapAsFraction);
    expect(out.glyphs.find((g) => g.strokes.some((s) => s.id === 104))?.strokes.map((s) => s.id), evidence(out.glyphs)).toEqual([104]);
    expect(out.glyphs.find((g) => g.strokes.some((s) => s.id === 105))?.label, evidence(out.glyphs)).toBe('8');
    expect(out.result).toEqual({ type: 'value', lhs: '1/8', value: '1/8' });
    expectInkPreserved(out.glyphs, reviewScreenshotCapAsFraction);
  });

  it('review cold-cache RHS fraction denominator remains on the same equation despite its lower y interval', async () => {
    const cold = new OrtRecognizer('public/model/recog.onnx');
    await cold.init();
    const { manager, settled } = realManager(cold, (pipeline) => wrapPipeline(pipeline, ref<string | null>(null)));
    for (const stroke of reviewRhsFractionDuringWarmup) manager.addStroke(stroke);
    await settled();
    expect(manager.lines, JSON.stringify(manager.lines.map((line) => ({ ids: line.strokes.map((s) => s.id), result: line.result })))).toHaveLength(1);
    expect(manager.lines[0].result).toEqual({ type: 'compare', lhs: '1', rhs: '1/1', match: true });
    expectInkPreserved(manager.lines[0].glyphs, reviewRhsFractionDuringWarmup);
  });

  it('the complete slant-and-sweep 4 reaches the real model as one two-stroke glyph', async () => {
    const strokes = scaleHandwriting(screenshotOnePlusFour).filter((s) => s.id === 4 || s.id === 5);
    const fullCandidates = await rec.classifyAsync(normalizeGlyph({ strokes, bbox: bboxOf(strokes) }));
    expect(fullCandidates[0].label, JSON.stringify(fullCandidates)).toBe('4');
    const glyphs = await settledSegment(rec, strokes, 160);
    expect(glyphs, evidence(glyphs)).toHaveLength(1);
    expect(glyphs[0].strokes.map((s) => s.id)).toEqual([4, 5]);
    expect(glyphs[0].alts, evidence(glyphs)).toContain('4');
  });

  it('the screenshot 5 retains its detached top bar in the same correctable glyph', async () => {
    const strokes = scaleHandwriting(screenshotTwoPlusFive).filter((s) => s.id === 104 || s.id === 105);
    const fullCandidates = await rec.classifyAsync(normalizeGlyph({ strokes, bbox: bboxOf(strokes) }));
    expect(fullCandidates[0].label, JSON.stringify(fullCandidates)).toBe('5');
    const glyphs = await settledSegment(rec, strokes, 160);
    expect(glyphs, evidence(glyphs)).toHaveLength(1);
    expect(glyphs[0].strokes.map((s) => s.id).sort()).toEqual([104, 105]);
    expect(glyphs[0].alts, evidence(glyphs)).toContain('5');
  });

  it.each([40, 160, 240].flatMap((height) => [
    { height, fixture: screenshotOnePlusFour, automaticLabels: ['1', '+', '4', '='], automaticResult: { type: 'value', lhs: '1+4', value: '5' } },
    { height, fixture: screenshotTwoPlusFive, automaticLabels: ['7', '+', '5', '='], automaticResult: { type: 'value', lhs: '7+5', value: '12' } },
  ]))('$height px $fixture.name records the actual automatic result separately from explicit correction', async ({ height, fixture, automaticLabels, automaticResult }) => {
    const { manager, settled } = realManager(rec);
    const strokes = scaleHandwriting(fixture, height);
    for (let i = 0; i < strokes.length; i++) {
      manager.addStroke(strokes[i]);
      await settled();
      expect(manager.lines).toHaveLength(1);
      expectInkPreserved(manager.lines[0].glyphs, strokes.slice(0, i + 1));
      if (i < strokes.length - 1) {
        expect(manager.lines[0].status, evidence(manager.lines[0].glyphs)).toBe('writing');
        expect(manager.lines[0].result).toBeNull();
      }
    }
    const line = manager.lines[0];
    expect(line.glyphs.map((g) => g.label), evidence(line.glyphs)).toEqual(automaticLabels);
    expect(line.result, evidence(line.glyphs)).toEqual(automaticResult);
    expect(line.status).toBe('done');
    if (fixture === screenshotTwoPlusFive) {
      // Known model limitation: this exact hand-traced 2 is outside top-3, not an automatic pass.
      expect(line.glyphs[0].alts).toEqual(['7', ')', '3']);
      expect(line.glyphs[0].alts).not.toContain('2');
      manager.setAlt(line.id, 0, '2');
      await settled();
      expect(line.glyphs[0].label).toBe('2');
      expect(line.glyphs[0].alts).toContain('7');
      expect(line.glyphs[0].alts).toContain('2');
      expect(line.glyphs[0].conf).toBe(1);
    }
    expectInkPreserved(line.glyphs, strokes);
    expect(line.result).toEqual(fixture.expected);
  });

  it('bursts a whole cold-cache row including equality, naturally settles, then writes the next row', async () => {
    const cold = new OrtRecognizer('public/model/recog.onnx');
    await cold.init();
    const { manager, settled } = realManager(cold);
    const first = scaleHandwriting(screenshotOnePlusFour);
    const second = scaleHandwriting(screenshotTwoPlusFive, 160, { x: 20, y: 330 });
    for (const stroke of first) manager.addStroke(stroke);
    expect(manager.lines[0].status).toBe('writing');
    expect(manager.lines[0].result).toBeNull();
    await settled();
    expect(manager.lines[0].status).toBe('done');
    expect(manager.lines[0].result).toEqual(screenshotOnePlusFour.expected);
    expectInkPreserved(manager.lines[0].glyphs, first);
    for (const stroke of second) manager.addStroke(stroke);
    await settled();
    expect(manager.lines).toHaveLength(2);
    expect(manager.lines[1].status).toBe('done');
    expect(manager.lines[1].result).toEqual({ type: 'value', lhs: '7+5', value: '12' });
    expectInkPreserved(manager.lines[1].glyphs, second);
    manager.setAlt(manager.lines[1].id, 0, '2');
    await settled();
    expect(manager.lines[1].result).toEqual(screenshotTwoPlusFive.expected);
  });

  it('usePaper wrapPipeline preserves cold-cache 14-stroke burst routing and explicit 2 correction', async () => {
    const cold = new OrtRecognizer('public/model/recog.onnx');
    await cold.init();
    const engineError = ref<string | null>(null);
    const { manager, settled } = realManager(cold, (pipeline) => wrapPipeline(pipeline, engineError));
    const first = scaleHandwriting(screenshotOnePlusFour);
    const second = scaleHandwriting(screenshotTwoPlusFive, 160, { x: 20, y: 330 });
    const all = [...first, ...second];
    expect(all).toHaveLength(14);
    for (const stroke of all) manager.addStroke(stroke); // No awaits between equality and the next row.
    await settled();
    expect(engineError.value).toBeNull();
    expect(manager.lines, JSON.stringify(manager.lines.map((line) => ({ ids: line.strokes.map((s) => s.id), result: line.result })))).toHaveLength(2);
    expect(manager.lines.map((line) => line.status)).toEqual(['done', 'done']);
    expect(manager.lines.map((line) => line.result)).toEqual([
      { type: 'value', lhs: '1+4', value: '5' },
      { type: 'value', lhs: '7+5', value: '12' },
    ]);
    expectInkPreserved(manager.lines[0].glyphs, first);
    expectInkPreserved(manager.lines[1].glyphs, second);
    expect(manager.lines[1].glyphs[0].alts).toEqual(['7', ')', '3']);
    manager.setAlt(manager.lines[1].id, 0, '2');
    await settled();
    expect(manager.lines.map((line) => line.result)).toEqual([screenshotOnePlusFour.expected, screenshotTwoPlusFive.expected]);
    expectInkPreserved(manager.lines[1].glyphs, second);
    expect(manager.lines[1].glyphs[0].label).toBe('2');
    expect(engineError.value).toBeNull();
  });

  it('starts a second row immediately after a cold-cache equality without appending to the still-warming first row', async () => {
    const cold = new OrtRecognizer('public/model/recog.onnx');
    await cold.init();
    const { manager, settled } = realManager(cold);
    const first = scaleHandwriting(screenshotOnePlusFour);
    const second = scaleHandwriting(screenshotTwoPlusFive, 160, { x: 20, y: 330 });
    for (const stroke of first) manager.addStroke(stroke);
    expect(manager.lines[0].status).toBe('writing');
    for (const stroke of second) manager.addStroke(stroke);
    await settled();
    expect(manager.lines, JSON.stringify(manager.lines.map((l) => ({ id: l.id, ids: l.strokes.map((s) => s.id), result: l.result, glyphs: evidence(l.glyphs) })))).toHaveLength(2);
    expect(manager.lines[0].result).toEqual(screenshotOnePlusFour.expected);
    expectInkPreserved(manager.lines[0].glyphs, first);
    expect(manager.lines[1].result).toEqual({ type: 'value', lhs: '7+5', value: '12' });
    expectInkPreserved(manager.lines[1].glyphs, second);
    expect(manager.lines[0].strokes).toEqual(first); // Old deferred reruns never write to the new row.
    expect(manager.lines[1].strokes).toEqual(second);
    const firstResult = manager.lines[0].result;
    expect(manager.undo()).toBe(manager.lines[1].id); // Global history removes the last equality bar.
    await settled();
    expect(manager.lines[0].result).toEqual(firstResult);
    expect(manager.lines[1].strokes).toEqual(second.slice(0, -1));
    expect(manager.lines[1].status).toBe('writing');
    expect(manager.lines[1].result).toBeNull();
    expectInkPreserved(manager.lines[1].glyphs, second.slice(0, -1));
  });

  it('a same-height RHS added during warmup stays in the original row and yields a comparison', async () => {
    const cold = new OrtRecognizer('public/model/recog.onnx');
    await cold.init();
    const { manager, settled } = realManager(cold);
    const first = scaleHandwriting(screenshotOnePlusFour);
    for (const stroke of first) manager.addStroke(stroke);
    const rhs: Stroke = { id: 300, pts: [{ x: 710, y: 70, t: 300_000 }, { x: 710, y: 208, t: 300_016 }] };
    manager.addStroke(rhs);
    expect(manager.lines).toHaveLength(1);
    expect(manager.lines[0].result).toBeNull(); // No placeholder or stale value during warmup.
    await settled();
    expect(manager.lines[0].result).toEqual({ type: 'compare', lhs: '1+4', rhs: '1', match: false });
    expectInkPreserved(manager.lines[0].glyphs, [...first, rhs]);
  });

  it('one equality bar cannot close a warming row or permit a lower row split', async () => {
    const cold = new OrtRecognizer('public/model/recog.onnx');
    await cold.init();
    const { manager, settled } = realManager(cold);
    const first = scaleHandwriting(screenshotOnePlusFour).slice(0, -1);
    for (const stroke of first) manager.addStroke(stroke);
    const lower = scaleHandwriting(screenshotTwoPlusFive, 160, { x: 20, y: 330 })[0];
    manager.addStroke(lower);
    expect(manager.lines).toHaveLength(1);
    await settled();
    expect(manager.lines[0].status).toBe('writing');
    expect(manager.lines[0].result).toBeNull();
    expectInkPreserved(manager.lines[0].glyphs, [...first, lower]);
  });

  it('a fraction denominator and raised exponent appended during warmup are not new main rows', async () => {
    const cold = new OrtRecognizer('public/model/recog.onnx');
    await cold.init();
    const { manager, settled } = realManager(cold);
    const numerator = polyline([[40, 0], [42, 80]]);
    const bar = polyline([[0, 95], [160, 98]]);
    const denominator = polyline([[38, 115], [40, 195]]);
    const raised = polyline([[75, -50], [76, -15]]);
    for (const stroke of [numerator, bar, denominator, raised]) manager.addStroke(stroke);
    expect(manager.lines).toHaveLength(1);
    await settled();
    expect(manager.lines[0].status).toBe('writing');
    expect(manager.lines[0].result).toBeNull();
    expectInkPreserved(manager.lines[0].glyphs, [numerator, bar, denominator, raised]);
  });

  it('a below/above-row detail added after a geometric equality stays when still within the symbol-size band', async () => {
    const cold = new OrtRecognizer('public/model/recog.onnx');
    await cold.init();
    const { manager, settled } = realManager(cold);
    const first = scaleHandwriting(screenshotOnePlusFour);
    for (const stroke of first) manager.addStroke(stroke);
    const raised = polyline([[510, -50], [511, -10]]);
    const denominator = polyline([[470, 230], [471, 275]]);
    manager.addStroke(raised);
    manager.addStroke(denominator);
    expect(manager.lines).toHaveLength(1);
    await settled();
    expect(manager.lines).toHaveLength(1);
    expectInkPreserved(manager.lines[0].glyphs, [...first, raised, denominator]);
  });

  it('writes both screenshot rows in one real LineManager and persists candidate correction across RHS/undo', async () => {
    const { manager, settled } = realManager(rec);
    const rows: Array<{ fixture: HandwritingFixture; strokes: Stroke[] }> = [
      { fixture: screenshotOnePlusFour, strokes: scaleHandwriting(screenshotOnePlusFour, 160, { x: 20, y: 20 }) },
      { fixture: screenshotTwoPlusFive, strokes: scaleHandwriting(screenshotTwoPlusFive, 160, { x: 20, y: 330 }) },
    ];
    for (let row = 0; row < rows.length; row++) {
      const { fixture, strokes } = rows[row];
      for (let i = 0; i < strokes.length; i++) {
        manager.addStroke(strokes[i]);
        await settled();
        expect(manager.lines, JSON.stringify(manager.lines)).toHaveLength(row + 1);
        expectInkPreserved(manager.lines[row].glyphs, strokes.slice(0, i + 1));
        if (i < strokes.length - 1) expect(manager.lines[row].result).toBeNull();
      }
      const line = manager.lines[row];
      expect(line.status, evidence(line.glyphs)).toBe('done');
      // Choices are explicit; only the known screenshot-2 miss uses the full-symbol recovery entry.
      for (const symbol of fixture.symbols) {
        const index = line.glyphs.findIndex((g) => g.strokes.some((s) => s.id === symbol.strokeIds[0]));
        expect(index, evidence(line.glyphs)).toBeGreaterThanOrEqual(0);
        const g = line.glyphs[index];
        expect(g.strokes.map((s) => s.id).sort()).toEqual([...symbol.strokeIds].sort());
        if (symbol.label === '2') {
          expect(g.label).toBe('7');
          expect(g.alts).toEqual(['7', ')', '3']);
        } else {
          expect(g.alts, evidence(line.glyphs)).toContain(symbol.label);
        }
        if (g.label !== symbol.label) {
          manager.setAlt(line.id, index, symbol.label);
          await settled();
        }
      }
      expectInkPreserved(line.glyphs, strokes);
      expect(line.result).toEqual(fixture.expected);
    }
    expect(manager.lines.map((l) => l.result)).toEqual([screenshotOnePlusFour.expected, screenshotTwoPlusFive.expected]);

    // Force a real available wrong candidate and restore it, then append RHS and undo.
    const first = manager.lines[0];
    const fourIndex = first.glyphs.findIndex((g) => g.strokes.some((s) => s.id === 4));
    const wrong = first.glyphs[fourIndex].alts.find((label) => label !== '4');
    expect(wrong).toBeDefined();
    manager.setAlt(first.id, fourIndex, wrong!);
    await settled();
    expect(first.glyphs[fourIndex].label).toBe(wrong);
    expect(first.result).not.toEqual(screenshotOnePlusFour.expected);
    manager.setAlt(first.id, fourIndex, '4');
    await settled();
    expect(first.result).toEqual(screenshotOnePlusFour.expected);

    const second = manager.lines[1];
    const rhs: Stroke = { id: 201, pts: [{ x: 950, y: 375, t: 300_000 }, { x: 950, y: 510, t: 300_016 }] };
    manager.addStroke(rhs);
    await settled();
    // RHS vertical is the model's real '1'; the already-corrected 2+5 must survive inference.
    expect(second.result).toEqual({ type: 'compare', lhs: '2+5', rhs: '1', match: false });
    expectInkPreserved(second.glyphs, [...rows[1].strokes, rhs]);
    manager.undo();
    await settled();
    expect(second.result).toEqual(screenshotTwoPlusFive.expected);
    expectInkPreserved(second.glyphs, rows[1].strokes);
    expect(first.result).toEqual(screenshotOnePlusFour.expected);
  });
});
