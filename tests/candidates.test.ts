import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import CandidateBar from '../src/components/CandidateBar.vue';
import type { LineState } from '../src/core/lines';
import type { Glyph } from '../src/core/types';

const glyph: Glyph = {
  strokes: [],
  bbox: { x0: 20, y0: 20, x1: 60, y1: 80 },
  label: '7',
  alts: ['7', ')', '3'],
  conf: 0.7,
};

async function renderCandidates(g: Glyph = glyph): Promise<string> {
  const line: LineState = { id: 4, strokes: [], glyphs: [g], status: 'writing', result: null };
  return renderToString(createSSRApp(CandidateBar, {
    lines: [line],
    activeLineId: line.id,
    setAlt: () => undefined,
  }));
}

function selectableLabels(html: string): string[] {
  return [...html.matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)]
    .map((match) => match[1])
    .filter(Boolean);
}

// The real chooser must expose a correct label even when CNN top-3 misses it.
// Restricting the production chooser to glyph.alts must break these tests.
describe('CandidateBar complete correction choices', () => {
  it('offers 2 when the screenshot glyph top-3 is 7, ), 3', async () => {
    expect(selectableLabels(await renderCandidates())).toContain('2');
  });

  it('keeps top-3 first and offers every digit, operator and geometry label once', async () => {
    const labels = selectableLabels(await renderCandidates());
    expect(labels.slice(0, 3)).toEqual(['7', ')', '3']);
    expect([...labels].sort()).toEqual([
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      '+', '-', '*', '/', '(', ')', 'sqrt', '.', '=', 'fracbar',
    ].sort());
  });

  it('includes a manual label absent from alts without duplicating repeated candidates', async () => {
    const labels = selectableLabels(await renderCandidates({
      ...glyph,
      label: '2',
      alts: ['7', ')', '7'],
    }));
    expect(labels.slice(0, 3)).toEqual(['7', ')', '2']);
    expect(labels.filter((label) => label === '2')).toHaveLength(1);
    expect(labels.filter((label) => label === '7')).toHaveLength(1);
    expect(labels).toHaveLength(20);
  });
});
