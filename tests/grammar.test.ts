/**
 * Task 6：语法校验 correctGlyphs 测试。
 *
 * correctGlyphs 在解析【前】运行，按 label 序列规则做结构性清理：
 *   - 连续运算符去重（保留第一个，删后续；行首 '-' 负号例外）；
 *   - 行首/行尾运算符删除（'- 5' 负号例外）；
 *   - 不配对括号删除（先多余 ')'，再孤立 '('）；
 *   - '.' 规则（一个 num 串内至多一个 '.'；前后都无数字的 '.' 删除）；
 *   - 多余 '=' 删除（保留第一个，parse2d 约定 T6 在解析前清理）。
 *
 * 钉死约束：纠正只删除/保留 glyph，绝不改写保留项的 label/alts/bbox/strokes，
 * 不基于语义改 CNN top-1 label。测试用例来自计划 Step 1 与上游 parse2d.ts 的衔接约定。
 */
import { describe, expect, it } from 'vitest';
import { correctGlyphs } from '../src/core/grammar';
import type { BBox, Glyph, Stroke, SymbolLabel } from '../src/core/types';

let nextStrokeId = 1;

/** 手工构造 glyph：grammar 只消费 label（以及不触碰的 bbox/strokes/alts）。 */
function gl(
  label: SymbolLabel,
  x0 = 0,
  y0 = 0,
  x1 = 10,
  y1 = 20,
  alts: SymbolLabel[] = [label],
): Glyph {
  const bbox: BBox = { x0, y0, x1, y1 };
  const stroke: Stroke = {
    id: nextStrokeId++,
    pts: [
      { x: x0, y: y0, t: 0 },
      { x: x1, y: y1, t: 10 },
    ],
  };
  return { strokes: [stroke], bbox, label, alts, conf: 0.9 };
}

const labels = (gs: Glyph[]): SymbolLabel[] => gs.map((g) => g.label);

describe('连续运算符去重（保留第一个，删后续）', () => {
  it('计划用例：[2,+,+] → [2,+]', () => {
    expect(labels(correctGlyphs([gl('2'), gl('+'), gl('+')]))).toEqual(['2', '+']);
  });

  it('[3,-,-,5] → [3,-,5]（前缀负号不额外保留）', () => {
    expect(labels(correctGlyphs([gl('3'), gl('-'), gl('-'), gl('5')]))).toEqual([
      '3', '-', '5',
    ]);
  });

  it('[3,-,+,5] → 删 +，保留 [3,-,5]', () => {
    expect(labels(correctGlyphs([gl('3'), gl('-'), gl('+'), gl('5')]))).toEqual([
      '3', '-', '5',
    ]);
  });

  it('混合连续运算符 [2,+,*,/,5] → [2,+,5]', () => {
    expect(labels(correctGlyphs([gl('2'), gl('+'), gl('*'), gl('/'), gl('5')]))).toEqual([
      '2', '+', '5',
    ]);
  });

  it('乘号后的前缀负号同样被删（keep-first 钉死）：[5,*,-,3] → [5,*,3]', () => {
    // 审查钉死：'-' 跟在运算符后一律按 run 后续删除，不当作 3 的负号保留；
    // run 首 '*' 保留（与 [2,+,+]→[2,+] 同一语义）。注意若把 '*' 一并删掉
    // 会得到 [5,3] 并被 parse2d 合并成数字 53，故保留项必为 [5,*,3]。
    expect(labels(correctGlyphs([gl('5'), gl('*'), gl('-'), gl('3')]))).toEqual(['5', '*', '3']);
  });
});

describe('纠正不动 bbox/strokes/label/alts（计划 Step 1 断言）', () => {
  it('[2,+,+] 保留项的 bbox/strokes/alts/conf 与输入完全一致', () => {
    const two = gl('2', 10, 20, 18, 40, ['2', '3']);
    const plus1 = gl('+', 24, 24, 36, 38);
    const plus2 = gl('+', 40, 24, 52, 38);
    const input = [two, plus1, plus2];
    const result = correctGlyphs(input);
    expect(labels(result)).toEqual(['2', '+']);
    expect(result[0].bbox).toEqual({ x0: 10, y0: 20, x1: 18, y1: 40 });
    expect(result[0].strokes).toEqual(two.strokes);
    expect(result[0].alts).toEqual(['2', '3']);
    expect(result[0].conf).toBe(0.9);
    expect(result[1].bbox).toEqual({ x0: 24, y0: 24, x1: 36, y1: 38 });
    expect(result[1].strokes).toEqual(plus1.strokes);
    expect(result[1].alts).toEqual(['+']);
  });

  it('不变异输入数组', () => {
    const input = [gl('2'), gl('+'), gl('+')];
    const snapshot = input.map((g) => ({ ...g }));
    correctGlyphs(input);
    expect(input).toEqual(snapshot);
    expect(input).toHaveLength(3);
  });

  it('不基于语义改写 label：正常序列原样通过（fracbar/sqrt 不受运算符规则影响）', () => {
    const input = [gl('sqrt'), gl('9'), gl('+'), gl('5')];
    expect(labels(correctGlyphs(input))).toEqual(['sqrt', '9', '+', '5']);
  });

  it("行首 fracbar 不删（parse2d 把缺上/下内容的 fracbar 降级为 '-' op 的衔接约定）", () => {
    expect(labels(correctGlyphs([gl('fracbar'), gl('5')]))).toEqual(['fracbar', '5']);
  });
});

describe('行首/行尾运算符删除（负号例外）', () => {
  it("行首 '+' 删除：[+,5] → [5]", () => {
    expect(labels(correctGlyphs([gl('+'), gl('5')]))).toEqual(['5']);
  });

  it("行首 '- 5' 例外：负号合法保留", () => {
    expect(labels(correctGlyphs([gl('-'), gl('5')]))).toEqual(['-', '5']);
  });

  it("行首 '*','/' 删除：[*,/,5] → [5]", () => {
    expect(labels(correctGlyphs([gl('*'), gl('/'), gl('5')]))).toEqual(['5']);
  });

  it("行尾 '+' 删除：[5,+] → [5]", () => {
    expect(labels(correctGlyphs([gl('5'), gl('+')]))).toEqual(['5']);
  });

  it("行尾 '-' 删除：[5,-] → [5]", () => {
    expect(labels(correctGlyphs([gl('5'), gl('-')]))).toEqual(['5']);
  });

  it("'-(' 行首负号后跟括号保留：[-,(,3,)] → [-,(,3,)]", () => {
    expect(labels(correctGlyphs([gl('-'), gl('('), gl('3'), gl(')')]))).toEqual([
      '-', '(', '3', ')',
    ]);
  });
});

describe('不配对括号删除（先多余 )，再孤立 ()', () => {
  it('计划用例：多余 ) 删除 [(,3,+,5,),)] → [(,3,+,5,)]（配对保留、多余删）', () => {
    expect(
      labels(correctGlyphs([gl('('), gl('3'), gl('+'), gl('5'), gl(')'), gl(')')])),
    ).toEqual(['(', '3', '+', '5', ')']);
  });

  it('无配对 ( 时所有 ) 均不配对：[3,+,5,),)] → [3,+,5]', () => {
    expect(labels(correctGlyphs([gl('3'), gl('+'), gl('5'), gl(')'), gl(')')]))).toEqual([
      '3', '+', '5',
    ]);
  });

  it('孤立 ( 删除：[(,3] → [3]', () => {
    expect(labels(correctGlyphs([gl('('), gl('3')]))).toEqual(['3']);
  });

  it('配对括号原样保留', () => {
    expect(labels(correctGlyphs([gl('('), gl('3'), gl('+'), gl('5'), gl(')')]))).toEqual([
      '(', '3', '+', '5', ')',
    ]);
  });

  it('多重嵌套缺一个 (：[(,(,3,)] → [(,3,)]', () => {
    expect(labels(correctGlyphs([gl('('), gl('('), gl('3'), gl(')')]))).toEqual([
      '(', '3', ')',
    ]);
  });
});

describe("'.' 规则（一个 num 串内至多一个 '.'；前后都无数字删除）", () => {
  it('连续两个 . 删第二个：[1,.,.,5] → [1,.,5]', () => {
    expect(labels(correctGlyphs([gl('1'), gl('.'), gl('.'), gl('5')]))).toEqual([
      '1', '.', '5',
    ]);
  });

  it('同一 num 串内第二个 . 删除（非连续）：[3,.,5,.,7] → [3,.,5,7]', () => {
    expect(labels(correctGlyphs([gl('3'), gl('.'), gl('5'), gl('.'), gl('7')]))).toEqual([
      '3', '.', '5', '7',
    ]);
  });

  it("前后都无数字的 '.' 删除：单独 [.] → []", () => {
    expect(correctGlyphs([gl('.')])).toEqual([]);
  });

  it("前有数字保留：[5,.] → [5,.]（由求值侧归一化 '5.'）", () => {
    expect(labels(correctGlyphs([gl('5'), gl('.')]))).toEqual(['5', '.']);
  });

  it("后有数字保留：[.,5] → [.,5]", () => {
    expect(labels(correctGlyphs([gl('.'), gl('5')]))).toEqual(['.', '5']);
  });

  it("运算符旁无数字的 '.' 删除：[5,+,.,)] → [5]", () => {
    expect(labels(correctGlyphs([gl('5'), gl('+'), gl('.'), gl(')')]))).toEqual(['5']);
  });
});

describe("多余 '=' 删除（parse2d 约定 T6 解析前清理）", () => {
  it('[1,=,2,=,3] → [1,=,2,3]', () => {
    expect(labels(correctGlyphs([gl('1'), gl('='), gl('2'), gl('='), gl('3')]))).toEqual([
      '1', '=', '2', '3',
    ]);
  });

  it("贴 '=' 的行尾运算符删除：[1,2,+,=,4,6] → [1,2,=,4,6]", () => {
    expect(labels(correctGlyphs([gl('1'), gl('2'), gl('+'), gl('='), gl('4'), gl('6')]))).toEqual([
      '1', '2', '=', '4', '6',
    ]);
  });

  it("'=' 后的 '+5' 删除、'-5' 负号保留", () => {
    expect(labels(correctGlyphs([gl('1'), gl('='), gl('+'), gl('5')]))).toEqual(['1', '=', '5']);
    expect(labels(correctGlyphs([gl('1'), gl('='), gl('-'), gl('5')]))).toEqual([
      '1', '=', '-', '5',
    ]);
  });
});

describe('综合与边界', () => {
  it('组合清理：[5,+,+,(,3,+,+,5,),)] → [5,+,(,3,+,5,)]', () => {
    expect(
      labels(
        correctGlyphs([
          gl('5'), gl('+'), gl('+'), gl('('), gl('3'), gl('+'), gl('+'), gl('5'), gl(')'), gl(')'),
        ]),
      ),
    ).toEqual(['5', '+', '(', '3', '+', '5', ')']);
  });

  it('空输入 → 空输出', () => {
    expect(correctGlyphs([])).toEqual([]);
  });

  it('运算符悬空于括号前：[5,+,)] → [5]', () => {
    expect(labels(correctGlyphs([gl('5'), gl('+'), gl(')')]))).toEqual(['5']);
  });
});
