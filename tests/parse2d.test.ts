/**
 * Task 5：2D 结构解析 parse2d 测试。
 *
 * 直接构造 Glyph 数组（手填 bbox/label/alts，不必走 segment），覆盖：
 *   - 计划 Step 1 的七个用例（①-⑦）；
 *   - ① 语境裁决：fracbar 上/下缺内容一律降级为 '-' op
 *     （长减号 / 浅斜 × 退化两个 fracbar / 分子负号三个场景）；
 *   - ③ 临界断言：0.7× 基线主高的"上标"归基线（反向断言）+ 连续多位指数；
 *   - 无 '=' → rhs=null；多个 '=' 取第一个、其余随 rhs 丢弃；
 *   - 边界：sqrt 空作用域、√(16) 括号组、孤立不配对括号按原样保留。
 *
 * R1-R15 为 T5 审查回归（P1 静默错值优先）：
 *   - R1-R3  node token 前的悬空数字串须即时结算（2(3+4) 倒置 / 2½ / 跨节点并串）
 *   - R4-R8  主高估计在层内小 glyph ≥ 半数时不得塌缩（2^10、3^99、2^100、10^235、
 *            10^(-23) 括号负指数，指数为裸 op 时不组 pow）
 *   - R9-R11 sqrt 作用域不吸二维 node（分数线写法 / 后随括号组 / 运算符截断）
 *   - R12-R15 未配对 "("、繁分数、(1/2)/(3/4)、多小数点防御路径
 */
import { describe, expect, it } from 'vitest';
import { parseEquation, parseExpr } from '../src/core/parse2d';
import type { BBox, ExprNode, Glyph, Stroke, SymbolLabel } from '../src/core/types';

let nextStrokeId = 1;

/** 手工构造 glyph：parse2d 只消费 bbox/label/alts，strokes 放一根覆盖 bbox 的占位对角线。 */
function gl(label: SymbolLabel, x0: number, y0: number, x1: number, y1: number): Glyph {
  const bbox: BBox = { x0, y0, x1, y1 };
  const stroke: Stroke = {
    id: nextStrokeId++,
    pts: [
      { x: x0, y: y0, t: 0 },
      { x: x1, y: y1, t: 10 },
    ],
  };
  return { strokes: [stroke], bbox, label, alts: [label], conf: 1 };
}

const num = (text: string): ExprNode => ({ kind: 'num', text });
const op = (o: '+' | '-' | '*' | '/'): ExprNode => ({ kind: 'op', op: o });
const seq = (...items: ExprNode[]): ExprNode => ({ kind: 'seq', items });

describe('parseExpr：基线与二维结构（计划 Step 1 七用例）', () => {
  it('① 1,2,+,3 同基线 → seq[num 12, op +, num 3]', () => {
    const ast = parseExpr([
      gl('1', 10, 20, 18, 40),
      gl('2', 22, 20, 30, 40),
      gl('+', 36, 24, 48, 38),
      gl('3', 54, 20, 62, 40),
    ]);
    expect(ast).toEqual(seq(num('12'), op('+'), num('3')));
  });

  it('② 3,.,5 → num "3.5"（连续数字与 . 拼接）', () => {
    const ast = parseExpr([
      gl('3', 10, 20, 18, 40),
      gl('.', 24, 36, 26, 38),
      gl('5', 32, 20, 40, 40),
    ]);
    expect(ast).toEqual(num('3.5'));
  });

  it('③ fracbar(1 上, 2 下) → frac(num 1, num 2)，单节点直接解包', () => {
    const ast = parseExpr([
      gl('1', 14, 8, 22, 24),
      gl('fracbar', 8, 30, 36, 30),
      gl('2', 14, 36, 22, 52),
    ]);
    expect(ast).toEqual({ kind: 'frac', num: num('1'), den: num('2') });
  });

  it('④ 2 后跟 0.5× 高且抬头的 3 → pow(num 2, num 3)', () => {
    const ast = parseExpr([gl('2', 10, 20, 20, 40), gl('3', 26, 10, 34, 20)]);
    expect(ast).toEqual({ kind: 'pow', base: num('2'), exp: num('3') });
  });

  it('⑤ sqrt 后跟 9 → sqrt(num 9)', () => {
    const ast = parseExpr([gl('sqrt', 10, 10, 22, 40), gl('9', 28, 14, 38, 38)]);
    expect(ast).toEqual({ kind: 'sqrt', arg: num('9') });
  });

  it('⑥ (,3,+,5,),×,2 → seq[括号组, op *, num 2]', () => {
    const ast = parseExpr([
      gl('(', 10, 8, 16, 44),
      gl('3', 22, 20, 30, 40),
      gl('+', 36, 24, 48, 38),
      gl('5', 54, 20, 62, 40),
      gl(')', 68, 8, 74, 44),
      gl('*', 80, 26, 92, 38),
      gl('2', 98, 20, 106, 40),
    ]);
    expect(ast).toEqual(seq(seq(num('3'), op('+'), num('5')), op('*'), num('2')));
  });

  it('⑦ 空输入 → 空 seq', () => {
    expect(parseExpr([])).toEqual(seq());
  });
});

describe('parseEquation：等号切分', () => {
  it('⑧ 12+34=46 → lhs/rhs 正确切分', () => {
    const eq = parseEquation([
      gl('1', 10, 20, 18, 40),
      gl('2', 22, 20, 30, 40),
      gl('+', 36, 24, 48, 38),
      gl('3', 54, 20, 62, 40),
      gl('4', 66, 20, 74, 40),
      gl('=', 90, 26, 110, 32),
      gl('4', 120, 20, 128, 40),
      gl('6', 134, 20, 142, 40),
    ]);
    expect(eq).toEqual({
      lhs: seq(num('12'), op('+'), num('34')),
      rhs: num('46'),
    });
  });

  it('⑨ 无 = → rhs 为 null', () => {
    const eq = parseEquation([gl('1', 10, 20, 18, 40), gl('2', 22, 20, 30, 40)]);
    expect(eq).toEqual({ lhs: num('12'), rhs: null });
  });

  it('⑩ 多个 = 取第一个切分，后续 = 随 rhs 丢弃（T6 在解析前清理）', () => {
    const eq = parseEquation([
      gl('1', 10, 20, 18, 40),
      gl('=', 30, 26, 50, 32),
      gl('2', 60, 20, 68, 40),
      gl('=', 80, 26, 100, 32),
      gl('3', 110, 20, 118, 40),
    ]);
    expect(eq).toEqual({ lhs: num('1'), rhs: seq(num('2'), num('3')) });
  });
});

describe('① 语境裁决：fracbar 上/下缺内容一律降级为 - op', () => {
  it('⑪ 上下都空的长横线 → op -（长减号），不产生 frac', () => {
    const ast = parseExpr([
      gl('2', 10, 20, 20, 40),
      gl('fracbar', 30, 28, 60, 28),
      gl('3', 70, 20, 80, 40),
    ]);
    expect(ast).toEqual(seq(num('2'), op('-'), num('3')));
  });

  it('⑫ 浅斜 × 退化的两个 fracbar（bbox 几乎重合、互不为上下）→ 两个 op -', () => {
    const ast = parseExpr([
      gl('2', 10, 20, 20, 40),
      gl('fracbar', 28, 24, 56, 32),
      gl('fracbar', 29, 24, 57, 32),
      gl('3', 66, 20, 76, 40),
    ]);
    expect(ast).toEqual(seq(num('2'), op('-'), op('-'), num('3')));
  });

  it('⑬ 分子负号：分子内的 fracbar 缺下内容 → 分子为 seq[op -, num 1]', () => {
    // 分数线 [8,44]×30，上方是负号 fracbar 与 1，下方是 2
    const ast = parseExpr([
      gl('fracbar', 12, 14, 26, 14),
      gl('1', 32, 8, 40, 24),
      gl('fracbar', 8, 30, 44, 30),
      gl('2', 20, 36, 28, 52),
    ]);
    expect(ast).toEqual({
      kind: 'frac',
      num: seq(op('-'), num('1')),
      den: num('2'),
    });
  });
});

describe('③ 上标：临界与多位指数', () => {
  it('⑭ 0.7× 基线主高的临界"上标"归基线（反向断言：不得产出 pow）', () => {
    // 上标写太大（14/20 = 0.7×）→ 按基线处理，与 2 拼成数字 23
    const ast = parseExpr([gl('2', 10, 20, 20, 40), gl('3', 26, 12, 36, 26)]);
    expect(ast).toEqual(num('23'));
  });

  it('⑮ 连续多个小 glyph 合成一个指数：10²³ → pow(num 10, num 23)', () => {
    const ast = parseExpr([
      gl('1', 10, 20, 16, 40),
      gl('0', 20, 20, 26, 40),
      gl('2', 32, 10, 40, 20),
      gl('3', 44, 10, 52, 20),
    ]);
    expect(ast).toEqual({ kind: 'pow', base: num('10'), exp: num('23') });
  });

  it('⑯ 上标可挂在括号组上：(1/2)² → pow(frac(1,2), 2)', () => {
    const ast = parseExpr([
      gl('(', 8, 10, 14, 54),
      gl('1', 20, 14, 28, 30),
      gl('fracbar', 14, 34, 36, 34),
      gl('2', 20, 40, 28, 56),
      gl(')', 42, 10, 48, 54),
      gl('2', 56, 4, 64, 14),
    ]);
    expect(ast).toEqual({
      kind: 'pow',
      base: { kind: 'frac', num: num('1'), den: num('2') },
      exp: num('2'),
    });
  });
});

describe('边界与下游衔接', () => {
  it('⑰ sqrt 右侧无内容 → arg 为空 seq（求值报错交给 T6）', () => {
    const ast = parseExpr([
      gl('3', 10, 20, 18, 40),
      gl('+', 24, 25, 36, 37),
      gl('sqrt', 44, 10, 56, 40),
    ]);
    expect(ast).toEqual(seq(num('3'), op('+'), { kind: 'sqrt', arg: seq() }));
  });

  it('⑱ sqrt 作用域含括号组：√(16) → sqrt(num 16)', () => {
    const ast = parseExpr([
      gl('sqrt', 10, 10, 22, 40),
      gl('(', 28, 8, 34, 44),
      gl('1', 40, 16, 48, 38),
      gl('6', 54, 16, 62, 38),
      gl(')', 68, 8, 74, 44),
    ]);
    expect(ast).toEqual({ kind: 'sqrt', arg: num('16') });
  });

  it('⑲ 孤立不配对括号按原样保留为叶子（T6 grammar 清理）', () => {
    const ast = parseExpr([
      gl('3', 10, 20, 18, 40),
      gl(')', 26, 16, 32, 44),
      gl('+', 38, 24, 50, 38),
      gl('4', 56, 20, 64, 40),
    ]);
    expect(ast).toEqual(seq(num('3'), num(')'), op('+'), num('4')));
  });
});

describe('P1 回归：node token 前的悬空数字串须即时结算', () => {
  it('R1 2(3+4) → seq[num 2, 括号组]（不得倒置为 seq[括号组, num 2]）', () => {
    const ast = parseExpr([
      gl('2', 10, 20, 18, 40),
      gl('(', 24, 8, 30, 44),
      gl('3', 36, 20, 44, 40),
      gl('+', 50, 24, 62, 38),
      gl('5', 68, 20, 76, 40),
      gl(')', 82, 8, 88, 44),
    ]);
    expect(ast).toEqual(seq(num('2'), seq(num('3'), op('+'), num('5'))));
  });

  it('R2 2½ 带分数 → seq[num 2, frac(1,2)]', () => {
    const ast = parseExpr([
      gl('2', 10, 20, 18, 40),
      gl('1', 24, 6, 30, 18),
      gl('fracbar', 22, 22, 36, 22),
      gl('2', 26, 28, 32, 40),
    ]);
    expect(ast).toEqual(seq(num('2'), { kind: 'frac', num: num('1'), den: num('2') }));
  });

  it('R3 2(3+4)5 → 数字不得跨节点并串（不得产出 num "25"）', () => {
    const ast = parseExpr([
      gl('2', 10, 20, 18, 40),
      gl('(', 24, 8, 30, 44),
      gl('3', 36, 20, 44, 40),
      gl('+', 50, 24, 62, 38),
      gl('5', 68, 20, 76, 40),
      gl(')', 82, 8, 88, 44),
      gl('5', 94, 20, 102, 40),
    ]);
    expect(ast).toEqual(seq(num('2'), seq(num('3'), op('+'), num('5')), num('5')));
  });
});

describe('P1 回归：主高估计在层内小 glyph ≥ 半数时不得塌缩', () => {
  it('R4 2^10 → pow(num 2, num 10)（不得并成 num "210"）', () => {
    const ast = parseExpr([
      gl('2', 10, 20, 20, 40),
      gl('1', 26, 10, 32, 20),
      gl('0', 36, 10, 42, 20),
    ]);
    expect(ast).toEqual({ kind: 'pow', base: num('2'), exp: num('10') });
  });

  it('R5 3^99 → pow(num 3, num 99)', () => {
    const ast = parseExpr([
      gl('3', 10, 20, 18, 40),
      gl('9', 26, 10, 34, 20),
      gl('9', 38, 10, 46, 20),
    ]);
    expect(ast).toEqual({ kind: 'pow', base: num('3'), exp: num('99') });
  });

  it('R6 2^100 → pow(num 2, num 100)', () => {
    const ast = parseExpr([
      gl('2', 10, 20, 20, 40),
      gl('1', 26, 10, 32, 20),
      gl('0', 36, 10, 42, 20),
      gl('0', 46, 10, 52, 20),
    ]);
    expect(ast).toEqual({ kind: 'pow', base: num('2'), exp: num('100') });
  });

  it('R7 10^235 → pow(num 10, num 235)', () => {
    const ast = parseExpr([
      gl('1', 10, 20, 16, 40),
      gl('0', 20, 20, 26, 40),
      gl('2', 32, 10, 40, 20),
      gl('3', 44, 10, 52, 20),
      gl('5', 56, 10, 64, 20),
    ]);
    expect(ast).toEqual({ kind: 'pow', base: num('10'), exp: num('235') });
  });

  it('R8 10^(-23) 括号负指数 → pow(num 10, seq[op -, num 23])（node 可入指数组且 exp 非裸 op）', () => {
    const ast = parseExpr([
      gl('1', 10, 20, 16, 40),
      gl('0', 20, 20, 26, 40),
      gl('(', 32, 10, 36, 20),
      gl('-', 38, 13, 44, 14),
      gl('2', 46, 10, 52, 20),
      gl('3', 54, 10, 60, 20),
      gl(')', 62, 10, 66, 20),
    ]);
    expect(ast).toEqual({ kind: 'pow', base: num('10'), exp: seq(op('-'), num('23')) });
  });
});

describe('P2 回归：sqrt 作用域不吸二维 node', () => {
  it('R9 √2/2 分数线写法 → √ 截断，不得产出 sqrt(frac(2,2))', () => {
    const ast = parseExpr([
      gl('sqrt', 6, 6, 18, 40),
      gl('2', 22, 8, 30, 26),
      gl('fracbar', 20, 30, 38, 30),
      gl('2', 26, 36, 34, 54),
    ]);
    expect(ast).toEqual(
      seq({ kind: 'sqrt', arg: seq() }, { kind: 'frac', num: num('2'), den: num('2') }),
    );
  });

  it('R10 √9(3) → 后随括号组不吸入作用域', () => {
    const ast = parseExpr([
      gl('sqrt', 10, 10, 22, 40),
      gl('9', 28, 14, 38, 38),
      gl('(', 52, 8, 58, 44),
      gl('3', 64, 16, 72, 38),
      gl(')', 78, 8, 84, 44),
    ]);
    expect(ast).toEqual(seq({ kind: 'sqrt', arg: num('9') }, num('3')));
  });

  it('R11 √9+3 → 作用域遇同级运算符截断', () => {
    const ast = parseExpr([
      gl('sqrt', 10, 10, 22, 40),
      gl('9', 28, 14, 38, 38),
      gl('+', 44, 24, 56, 38),
      gl('3', 62, 20, 70, 40),
    ]);
    expect(ast).toEqual(seq({ kind: 'sqrt', arg: num('9') }, op('+'), num('3')));
  });
});

describe('P3 补充路径', () => {
  it('R12 未配对 "(" → 保持顺序、括号保留为叶子', () => {
    const ast = parseExpr([
      gl('(', 10, 14, 16, 44),
      gl('3', 22, 20, 30, 40),
      gl('+', 36, 24, 48, 38),
      gl('4', 54, 20, 62, 40),
    ]);
    expect(ast).toEqual(seq(num('('), num('3'), op('+'), num('4')));
  });

  it('R13 繁分数（内层横线窄于外层）→ frac(frac(1,2), 3)', () => {
    const ast = parseExpr([
      gl('1', 14, 8, 22, 24),
      gl('fracbar', 12, 28, 26, 28),
      gl('2', 14, 34, 22, 50),
      gl('fracbar', 8, 56, 52, 56),
      gl('3', 26, 62, 34, 78),
    ]);
    expect(ast).toEqual({
      kind: 'frac',
      num: { kind: 'frac', num: num('1'), den: num('2') },
      den: num('3'),
    });
  });

  it('R14 (1/2)/(3/4) → seq[frac, op /, frac]', () => {
    const ast = parseExpr([
      gl('(', 8, 8, 14, 52),
      gl('1', 20, 12, 28, 28),
      gl('fracbar', 14, 32, 36, 32),
      gl('2', 20, 38, 28, 54),
      gl(')', 42, 8, 48, 52),
      gl('/', 56, 26, 68, 38),
      gl('(', 74, 8, 80, 52),
      gl('3', 86, 12, 94, 28),
      gl('fracbar', 80, 32, 102, 32),
      gl('4', 86, 38, 94, 54),
      gl(')', 108, 8, 114, 52),
    ]);
    expect(ast).toEqual(
      seq(
        { kind: 'frac', num: num('1'), den: num('2') },
        op('/'),
        { kind: 'frac', num: num('3'), den: num('4') },
      ),
    );
  });

  it('R15 多小数点 3.5.7 → 原样拼进 num.text（语法错误交 T6/求值报 error，防御路径钉死）', () => {
    const ast = parseExpr([
      gl('3', 10, 20, 18, 40),
      gl('.', 24, 36, 26, 38),
      gl('5', 32, 20, 40, 40),
      gl('.', 44, 36, 46, 38),
      gl('7', 52, 20, 60, 40),
    ]);
    expect(ast).toEqual(num('3.5.7'));
  });
});

describe('P2 复审回归：node 底数层的主高锚点不得塌缩到上标高度', () => {
  it('R16 (1/2)²³ → pow(frac(1/2), num 23)（底数为 node、plain 全是上标）', () => {
    // 与 ⑯ 同款几何，上标多一位 —— plain 只剩上标数字，锚点不得取上标高
    const ast = parseExpr([
      gl('(', 8, 10, 14, 54),
      gl('1', 20, 14, 28, 30),
      gl('fracbar', 14, 34, 36, 34),
      gl('2', 20, 40, 28, 56),
      gl(')', 42, 10, 48, 54),
      gl('2', 56, 4, 64, 14),
      gl('3', 68, 4, 76, 14),
    ]);
    expect(ast).toEqual({
      kind: 'pow',
      base: { kind: 'frac', num: num('1'), den: num('2') },
      exp: num('23'),
    });
  });

  it('R17 node 邻旁 0.7× 主高的普通字 → 归基线（即使抬头也不得误判为指数）', () => {
    // 重锚后高度门槛为 0.6×全体最高：0.7× 者必然过不了门槛（不变量钉死）
    const ast = parseExpr([
      gl('(', 8, 10, 14, 54),
      gl('1', 20, 14, 28, 30),
      gl('fracbar', 14, 34, 36, 34),
      gl('2', 20, 40, 28, 56),
      gl(')', 42, 10, 48, 54),
      gl('3', 56, 4, 64, 35),
    ]);
    expect(ast).toEqual(seq({ kind: 'frac', num: num('1'), den: num('2') }, num('3')));
  });
});
