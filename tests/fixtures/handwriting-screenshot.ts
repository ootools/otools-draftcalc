import type { Stroke, SymbolLabel } from '../../src/core/types';

/** Hand-traced centre lines from the user's 682×604 screenshot, not model-generated glyphs. */
export interface HandwritingFixture {
  name: string;
  /** Screenshot pixels; the middle row's plus vertical spans 80px. */
  nominalHeight: number;
  origin: { x: number; y: number };
  strokes: Stroke[];
  symbols: Array<{ label: SymbolLabel; strokeIds: number[] }>;
  expected: { type: 'value'; lhs: string; value: string };
}

function ink(id: number, coords: Array<[number, number]>): Stroke {
  return { id, pts: coords.map(([x, y], i) => ({ x, y, t: id * 1000 + i * 16 })) };
}

export const screenshotOnePlusFour: HandwritingFixture = {
  name: 'screenshot 1+4=',
  nominalHeight: 80,
  origin: { x: 150, y: 210 },
  strokes: [
    ink(1, [[168, 241], [168, 266], [168, 286], [168, 301], [169, 310]]),
    ink(2, [[220, 262], [247, 262], [269, 262], [288, 261], [300, 260]]),
    ink(3, [[266, 220], [266, 253], [266, 282], [266, 297], [267, 300]]),
    // The first stroke of 4 slopes down-left, turns, and sweeps right through the vertical.
    ink(4, [[347, 223], [344, 229], [339, 239], [334, 249], [329, 260], [325, 270],
      [321, 282], [319, 292], [321, 293], [327, 290], [335, 285], [345, 281],
      [358, 277], [372, 274], [389, 269]]),
    ink(5, [[369, 238], [369, 256], [369, 280], [369, 307]]),
    ink(6, [[431, 252], [440, 252], [452, 254], [465, 254]]),
    ink(7, [[421, 275], [443, 275], [461, 275]]),
  ],
  symbols: [
    { label: '1', strokeIds: [1] },
    { label: '+', strokeIds: [2, 3] },
    { label: '4', strokeIds: [4, 5] },
    { label: '=', strokeIds: [6, 7] },
  ],
  expected: { type: 'value', lhs: '1+4', value: '5' },
};

export const screenshotTwoPlusFive: HandwritingFixture = {
  name: 'screenshot 2+5=',
  nominalHeight: 80,
  origin: { x: 150, y: 345 },
  strokes: [
    ink(101, [[165, 388], [187, 388], [200, 392], [208, 399], [211, 409],
      [212, 417], [209, 430], [200, 445], [187, 455], [174, 461],
      [197, 449], [220, 440], [245, 431], [269, 425]]),
    ink(102, [[295, 397], [326, 397], [350, 396], [377, 394], [408, 392]]),
    ink(103, [[381, 358], [381, 384], [381, 411], [381, 432]]),
    ink(104, [[456, 353], [478, 353], [502, 353]]),
    ink(105, [[435, 363], [435, 382], [436, 397], [440, 411], [450, 427],
      [463, 440], [477, 450], [479, 454], [473, 458], [463, 462],
      [451, 464], [440, 463], [434, 458], [427, 446]]),
    ink(106, [[528, 395], [541, 395], [555, 392], [572, 390]]),
    ink(107, [[528, 446], [552, 446], [580, 446]]),
  ],
  symbols: [
    { label: '2', strokeIds: [101] },
    { label: '+', strokeIds: [102, 103] },
    { label: '5', strokeIds: [104, 105] },
    { label: '=', strokeIds: [106, 107] },
  ],
  expected: { type: 'value', lhs: '2+5', value: '7' },
};

/** Fresh, independently mutable strokes for LineManager or a browser pointer replay. */
export function scaleHandwriting(
  fixture: HandwritingFixture,
  height = 160,
  offset = { x: 20, y: 20 },
): Stroke[] {
  const scale = height / fixture.nominalHeight;
  return fixture.strokes.map((s) => ({
    id: s.id,
    pts: s.pts.map((p) => ({
      x: (p.x - fixture.origin.x) * scale + offset.x,
      y: (p.y - fixture.origin.y) * scale + offset.y,
      t: p.t,
    })),
  }));
}

/** Review regressions: original coordinates are kept unchanged for real-browser replay. */
export const reviewAdjacent21: Stroke[] = [
  ink(501, [[0, 0], [20, 0], [20, 10], [0, 40], [30, 40]]),
  ink(502, [[25, 0], [25, 45]]),
  ink(503, [[60, 15], [95, 15]]),
  ink(504, [[60, 30], [95, 30]]),
];

export const reviewParenthesizedFraction11: Stroke[] = [
  ink(511, [[-10, -10], [-30, 55], [-10, 120]]),
  ink(512, [[20, 0], [22, 40]]),
  ink(513, [[40, 0], [42, 40]]),
  ink(514, [[0, 55], [90, 55]]),
  ink(515, [[20, 70], [22, 110]]),
  ink(516, [[40, 70], [42, 110]]),
  ink(517, [[110, -10], [130, 55], [110, 120]]),
  ink(518, [[160, 45], [200, 45]]),
  ink(519, [[160, 65], [200, 65]]),
];

export const reviewNegativeFraction: Stroke[] = [
  ink(521, [[0, 20], [60, 20]]),
  ink(522, [[75, 0], [77, 40]]),
  ink(523, [[0, 60], [100, 60]]),
  ink(524, [[75, 80], [77, 120]]),
  ink(525, [[140, 30], [180, 30]]),
  ink(526, [[140, 50], [180, 50]]),
];

export const reviewScreenshotCapAsFraction: Stroke[] = [
  ...screenshotTwoPlusFive.strokes.filter((s) => s.id === 104 || s.id === 105),
  ink(531, [[480, 295], [482, 335]]),
  ink(532, [[600, 375], [650, 375]]),
  ink(533, [[600, 405], [650, 405]]),
];

export const reviewRhsFractionDuringWarmup: Stroke[] = [
  ink(541, [[0, 0], [2, 40]]),
  ink(542, [[60, 15], [90, 15]]),
  ink(543, [[60, 30], [90, 30]]),
  ink(544, [[145, 0], [147, 40]]),
  ink(545, [[120, 50], [180, 50]]),
  ink(546, [[145, 80], [147, 120]]),
];
