import { beforeAll, describe, expect, it } from 'vitest';
import { createPipeline } from '../src/core/lines';
import { OrtRecognizer, WarmupError } from '../src/core/recognize';
import { segmentGlyphs } from '../src/core/segment';
import { bboxOf, normalizeGlyph } from '../src/core/strokes';
import type { Glyph, Stroke, SymbolLabel } from '../src/core/types';
import { cross, dot, hLine, polyline, vLine } from './helpers/synth';
import { scaleHandwriting, screenshotOnePlusFour, screenshotTwoPlusFive } from './fixtures/handwriting-screenshot';

const geometricClassify = () => [{ label: '1' as const, prob: 1 }];
const idsOf = (gs: Glyph[]) => gs.flatMap((g) => g.strokes.map((s) => s.id)).sort((a, b) => a - b);

/** Four full-height digits, three tilted minuses and two tilted equality bars: flats are the majority. */
function horizontalMajority(height: number, gapRatio: number): Stroke[] {
  const strokes: Stroke[] = [];
  for (let i = 0; i < 4; i++) {
    const x = i * height * 1.8;
    strokes.push(polyline([[x, 0], [x + height * 0.025, height]]));
    if (i < 3) strokes.push(polyline([[x + height * 0.55, height * 0.5], [x + height * 1.25, height * 0.54]]));
  }
  const x = height * 6.5;
  const lower = height * (0.29 + gapRatio);
  strokes.push(polyline([[x, height * 0.25], [x + height * 0.75, height * 0.29]]));
  strokes.push(polyline([[x + height * 0.025, lower], [x + height * 0.8, lower + height * 0.04]]));
  return strokes;
}

const cases = [40, 160, 240].flatMap((height) => [0.15, 0.28, 0.45].map((gapRatio) => ({ height, gapRatio })));

describe('main writing size is independent of the number of tilted horizontal strokes', () => {
  let rec: OrtRecognizer;
  beforeAll(async () => {
    rec = new OrtRecognizer('public/model/recog.onnx');
    await rec.init();
  }, 120_000);

  it.each(cases)('$height px writing, equality gap $gapRatio×height gives the exact whole expression', async ({ height, gapRatio }) => {
    const strokes = horizontalMajority(height, gapRatio);
    const pipeline = createPipeline((img) => rec.classify(img));
    try {
      pipeline.run(strokes);
    } catch (e) {
      expect(e).toBeInstanceOf(WarmupError);
      await rec.whenSettled();
    }
    const out = pipeline.run(strokes);
    expect(out.glyphs.map((g) => g.label)).toEqual(['1', 'fracbar', '1', 'fracbar', '1', 'fracbar', '1', '=']);
    expect(idsOf(out.glyphs)).toEqual(strokes.map((s) => s.id).sort((a, b) => a - b));
    expect(out.glyphs.at(-1)?.strokes).toEqual(strokes.slice(-2));
    expect(out.result).toEqual({ type: 'value', lhs: '1-1-1-1', value: '-2' });
  });

  it.each([40, 160, 240])('a skinny %s px digit is not a dot just because a tall enclosure inflates lineHeight', (height) => {
    const stroke = polyline([[20, 0], [22, height]]);
    const gs = segmentGlyphs([stroke], geometricClassify, height * 3.25);
    expect(gs.map((g) => g.label)).toEqual(['1']);
    expect(gs[0].strokes).toEqual([stroke]);
  });

  it('a high digit and decimal point stay distinct when sloped minuses outnumber the tall strokes', () => {
    const strokes = [
      vLine(0, 0, 160),
      polyline([[35, 155], [38, 158], [35, 158]]),
      vLine(70, 0, 160),
      ...[130, 250, 370, 490].map((x) => polyline([[x, 80], [x + 95, 86]])),
      polyline([[620, 65], [720, 71]]),
      polyline([[622, 110], [724, 116]]),
    ];
    const out = createPipeline(geometricClassify).run(strokes);
    expect(out.glyphs.map((g) => g.label)).toEqual(['1', '.', '1', 'fracbar', 'fracbar', 'fracbar', 'fracbar', '=']);
    // The unmatched minuses are not allowed to turn a malformed equation into a value.
    expect(out.result?.type).toBe('error');
  });
});

describe('equality bars are an overlapping pair, not neighbouring minuses or fraction content', () => {
  it('the widely spaced screenshot equality merges at its actual bar length, not only at the main-height gap cutoff', () => {
    const strokes = scaleHandwriting(screenshotTwoPlusFive).filter((s) => s.id === 106 || s.id === 107);
    const gs = segmentGlyphs(strokes, geometricClassify, 160);
    expect(gs.map((g) => g.label)).toEqual(['=']);
    expect(gs[0].strokes).toEqual(strokes);
  });

  it('two equally long but remote horizontal lines do not become equality', () => {
    const strokes = [polyline([[0, 0], [100, 4]]), polyline([[0, 240], [100, 244]])];
    const gs = segmentGlyphs(strokes, geometricClassify, 160);
    expect(gs.map((g) => g.label)).toEqual(['fracbar', 'fracbar']);
  });

  it('two short adjacent minuses with a small x-overlap do not merge', () => {
    const strokes = [polyline([[0, 10], [20, 11]]), polyline([[18, 13], [38, 14]])];
    const gs = segmentGlyphs(strokes, geometricClassify, 24);
    expect(gs.map((g) => g.label)).toEqual(['fracbar', 'fracbar']);
    expect(gs.map((g) => g.strokes)).toEqual(strokes.map((s) => [s]));
  });

  it('a long fraction bar does not absorb a short numerator minus', () => {
    const strokes = [polyline([[0, 60], [120, 63]]), polyline([[40, 25], [72, 26]])];
    const gs = segmentGlyphs(strokes, geometricClassify, 80);
    expect(gs.map((g) => g.label)).toEqual(['fracbar', 'fracbar']);
    expect(gs.every((g) => g.label !== '=')).toBe(true);
    expect(idsOf(gs)).toEqual(strokes.map((s) => s.id).sort((a, b) => a - b));
  });

  it('stacked fraction bars with ink between them are not an equality pair', () => {
    const strokes = [polyline([[0, 30], [80, 31]]), vLine(40, 34, 40), polyline([[0, 43], [80, 44]])];
    const gs = segmentGlyphs(strokes, geometricClassify, 24);
    expect(gs.filter((g) => g.label === 'fracbar')).toHaveLength(2);
    expect(gs.some((g) => g.label === '=')).toBe(false);
    expect(idsOf(gs)).toEqual(strokes.map((s) => s.id).sort((a, b) => a - b));
  });
});

describe('ambiguous operators remain editable instead of silently becoming a shorter equation', () => {
  it('keeps a misread second plus with its digit alternative and returns an error, not 1 or 1+', () => {
    const strokes = scaleHandwriting(screenshotOnePlusFour);
    const four = strokes.filter((s) => s.id === 4 || s.id === 5);
    const plus = strokes.filter((s) => s.id === 2 || s.id === 3);
    const key = (ss: Stroke[]) => normalizeGlyph({ strokes: ss, bbox: bboxOf(ss) }).join(',');
    const labels = new Map<string, SymbolLabel>([
      [key([strokes[0]]), '1'], [key(plus), '+'], [key(four), '+'],
    ]);
    const out = createPipeline((img) => {
      const label = labels.get(img.join(','));
      if (!label) throw new Error('unexpected glyph image');
      return label === '+'
        ? [{ label, prob: 0.9 }, { label: '4', prob: 0.08 }, { label: '1', prob: 0.02 }]
        : [{ label, prob: 1 }];
    }).run(strokes);
    expect(out.glyphs.map((g) => g.label)).toEqual(['1', '+', '+', '=']);
    expect(idsOf(out.glyphs)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(out.glyphs[2].strokes.map((s) => s.id)).toEqual([4, 5]);
    expect(out.glyphs[2].alts).toContain('4');
    expect(out.result?.type).toBe('error');
  });

  it('does not compute 1+= as 1 by deleting the unfinished plus', () => {
    const strokes = scaleHandwriting(screenshotOnePlusFour).filter((s) => s.id !== 4 && s.id !== 5);
    const out = createPipeline((img) => {
      const ss = strokes.filter((s) => s.id === 2 || s.id === 3);
      const plus = normalizeGlyph({ strokes: ss, bbox: bboxOf(ss) }).join(',');
      return [{ label: img.join(',') === plus ? '+' : '1', prob: 1 }];
    }).run(strokes);
    expect(out.glyphs.map((g) => g.label)).toEqual(['1', '+', '=']);
    expect(idsOf(out.glyphs)).toEqual([1, 2, 3, 6, 7]);
    expect(out.result?.type).toBe('error');
  });
});

describe('two-stroke grouping only merges supported crossing/cap geometry', () => {
  it('a plain plus is still a plus, never a forced 4', () => {
    const strokes = cross(30, 30, 20);
    const gs = segmentGlyphs(strokes, () => [{ label: '+', prob: 0.9958 }, { label: '4', prob: 0.0042 }], 40);
    expect(gs.map((g) => g.label)).toEqual(['+']);
    expect(gs[0].strokes).toEqual(strokes);
  });

  it('a folded neighbouring stroke only touching a vertical at its endpoint does not merge', () => {
    const strokes = [polyline([[0, 0], [0, 40], [20, 40]]), vLine(20, 20, 60)];
    const gs = segmentGlyphs(strokes, geometricClassify, 40);
    expect(gs).toHaveLength(2);
    expect(gs.map((g) => g.strokes)).toEqual(strokes.map((s) => [s]));
  });

  it('a detached cap proposal cannot merge unless the complete glyph is model-confirmed as 5', () => {
    const strokes = [hLine(22, 42, 4), polyline([[20, 8], [20, 24], [28, 40]])];
    const gs = segmentGlyphs(strokes, geometricClassify, 40);
    expect(gs.map((g) => g.label)).toEqual(['1', 'fracbar']);
    expect(idsOf(gs)).toEqual(strokes.map((s) => s.id).sort((a, b) => a - b));
  });

  it('fraction content below a long bar remains separate even when the recognizer proposes 5', () => {
    const strokes = [hLine(0, 100, 4), polyline([[38, 8], [38, 26], [49, 40]])];
    const gs = segmentGlyphs(strokes, () => [{ label: '5', prob: 1 }], 40);
    expect(gs.map((g) => g.label)).toEqual(['fracbar', '5']);
    expect(gs.map((g) => g.strokes)).toEqual(strokes.map((s) => [s]));
  });
});

describe('new writing-size/grouping rules preserve existing mathematical structures', () => {
  const classify = (labelled: Array<{ label: SymbolLabel; strokes: Stroke[] }>) => {
    const table = new Map(labelled.map(({ label, strokes }) => [
      normalizeGlyph({ strokes, bbox: bboxOf(strokes) }).join(','), label,
    ]));
    return (img: Float32Array) => {
      const label = table.get(img.join(','));
      if (!label) throw new Error('unexpected image, likely an accidental grouping');
      return [{ label, prob: 1 }];
    };
  };

  it('decimal point 1.1= gives the exact fraction 11/10 with all ink present', () => {
    const digits = [vLine(0, 0, 160), vLine(70, 0, 160)];
    const strokes = [digits[0], dot(35, 155, 1.5), digits[1], hLine(110, 200, 60), hLine(112, 202, 95)];
    const out = createPipeline(classify(digits.map((s) => ({ label: '1', strokes: [s] })))).run(strokes);
    expect(out.glyphs.map((g) => g.label)).toEqual(['1', '.', '1', '=']);
    expect(out.result).toEqual({ type: 'value', lhs: '1.1', value: '11/10' });
    expect(idsOf(out.glyphs)).toEqual(strokes.map((s) => s.id).sort((a, b) => a - b));
  });

  it('large enclosing parentheses cannot make a compact full-size interior digit into a dot', () => {
    const left = polyline([[-10, -10], [-30, 55], [-10, 120]]);
    const digit = polyline([[20, 20], [40, 20], [40, 35], [20, 60], [40, 60]]);
    const right = polyline([[110, -10], [130, 55], [110, 120]]);
    const strokes = [left, digit, right, hLine(160, 200, 45), hLine(160, 200, 65)];
    const out = createPipeline(classify([
      { label: '(', strokes: [left] }, { label: '2', strokes: [digit] }, { label: ')', strokes: [right] },
    ])).run(strokes);
    expect(out.glyphs.map((g) => g.label)).toEqual(['(', '2', ')', '=']);
    expect(out.result).toEqual({ type: 'value', lhs: '2', value: '2' });
  });

  it('1/2 written across a fraction bar stays a fraction and evaluates to 1/2', () => {
    // A real slightly tilted '1' has nonzero width; a zero-width line has no x overlap for parse2d.
    const numerator = polyline([[38, 0], [40, 40]]);
    const denominator = polyline([[30, 70], [50, 70], [50, 90], [30, 110], [50, 110]]);
    const strokes = [numerator, hLine(0, 90, 55), denominator, hLine(130, 170, 45), hLine(130, 170, 65)];
    const out = createPipeline(classify([{ label: '1', strokes: [numerator] }, { label: '2', strokes: [denominator] }])).run(strokes);
    expect(out.eq?.lhs).toEqual({ kind: 'frac', num: { kind: 'num', text: '1' }, den: { kind: 'num', text: '2' } });
    expect(out.result).toEqual({ type: 'value', lhs: '1/2', value: '1/2' });
    expect(idsOf(out.glyphs)).toEqual(strokes.map((s) => s.id).sort((a, b) => a - b));
  });

  // Also reproduced against 73f2d7e: diagPair uses whole-stroke bbox/direction and merges the root with a broad 9.
  // Kept as an executable known defect, NOT as evidence that all root writing styles are supported.
  it.fails('KNOWN pre-existing bug: a broad 9 beneath a root overbar must not merge with the root', () => {
    const strokes = [
      polyline([[0, 55], [12, 65], [24, 0], [100, 0]]),
      polyline([[42, 25], [65, 25], [65, 40], [42, 40], [42, 25], [65, 25], [65, 65]]),
    ];
    const gs = segmentGlyphs(strokes, geometricClassify, 65);
    expect(gs.map((g) => g.strokes)).toEqual(strokes.map((s) => [s]));
  });

  it('a previously-supported narrow 9 under a one-stroke root keeps its root scope', () => {
    const root = polyline([[0, 55], [12, 65], [24, 0], [100, 0]]);
    const nine = polyline([[42, 25], [52, 25], [52, 40], [42, 40], [42, 25], [52, 25], [52, 65]]);
    const strokes = [root, nine, hLine(130, 175, 30), hLine(130, 175, 48)];
    const out = createPipeline(classify([{ label: 'sqrt', strokes: [root] }, { label: '9', strokes: [nine] }])).run(strokes);
    expect(out.eq?.lhs).toEqual({ kind: 'sqrt', arg: { kind: 'num', text: '9' } });
    expect(out.result).toEqual({ type: 'value', lhs: '√(9)', value: '3' });
    expect(idsOf(out.glyphs)).toEqual(strokes.map((s) => s.id).sort((a, b) => a - b));
  });

  it('multiple small raised digits do not collapse the base size in 2^111=', () => {
    const base = polyline([[0, 0], [100, 0], [100, 40], [0, 160], [100, 160]]);
    const exponent = [vLine(120, -60, 0), vLine(150, -60, 0), vLine(180, -60, 0)];
    const strokes = [base, ...exponent, hLine(240, 340, 60), hLine(242, 342, 100)];
    const out = createPipeline(classify([{ label: '2', strokes: [base] }, ...exponent.map((s) => ({ label: '1' as const, strokes: [s] }))])).run(strokes);
    expect(out.eq?.lhs).toEqual({ kind: 'pow', base: { kind: 'num', text: '2' }, exp: { kind: 'num', text: '111' } });
    expect(out.glyphs.map((g) => g.label)).toEqual(['2', '1', '1', '1', '=']);
    expect(out.result).toEqual({ type: 'value', lhs: '2^111', value: '2596148429267413814265248164610048' });
    expect(idsOf(out.glyphs)).toEqual(strokes.map((s) => s.id).sort((a, b) => a - b));
  });
});
