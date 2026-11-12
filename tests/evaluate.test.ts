/**
 * Task 6：求值 evalEquation / formatValue 测试。
 *
 * 用例覆盖计划 Step 1 全部断言：
 *   12+34→"46"；1/3+1/6→"1/2"；0.1+0.2→"3/10"（小数有理化）；2^3→"8"；
 *   √9→"3"；√2→"≈ 1.41421"；1÷3→"1/3"；compare 100 vs 100/99；1/0→error。
 * 另覆盖：lhs 人读串（× ÷ √( )）、防御路径（非法 num 叶子、除零、复数结果）、
 * rhs 为空 seq 时按 value 处理（"12=" → 46，与 Task 7 行状态机衔接）。
 */
import { describe, expect, it } from 'vitest';
import { create, all } from 'mathjs';
import { evalEquation, formatValue } from '../src/core/evaluate';
import type { Equation, ExprNode } from '../src/core/types';

const num = (text: string): ExprNode => ({ kind: 'num', text });
const op = (o: '+' | '-' | '*' | '/'): ExprNode => ({ kind: 'op', op: o });
const seq = (...items: ExprNode[]): ExprNode => ({ kind: 'seq', items });
const frac = (n: ExprNode, d: ExprNode): ExprNode => ({ kind: 'frac', num: n, den: d });
const pow = (b: ExprNode, e: ExprNode): ExprNode => ({ kind: 'pow', base: b, exp: e });
const sqrt = (a: ExprNode): ExprNode => ({ kind: 'sqrt', arg: a });

/** 构造 mathjs Fraction 供 formatValue 直测（与求值通道同一实例语义）。 */
const math = create(all, { number: 'Fraction' });
const F = (n: number, d = 1) => math.fraction(n, d);

const evalValue = (lhs: ExprNode) => evalEquation({ lhs, rhs: null });
const evalCompare = (lhs: ExprNode, rhs: ExprNode) => evalEquation({ lhs, rhs });

describe('计划 Step 1：求值与结果格式', () => {
  it('12+34 → value "46"，lhs 人读串 "12+34"', () => {
    expect(evalValue(seq(num('12'), op('+'), num('34')))).toEqual({
      type: 'value',
      lhs: '12+34',
      value: '46',
    });
  });

  it('1/3+1/6 → "1/2"（精确分数）', () => {
    expect(evalValue(seq(frac(num('1'), num('3')), op('+'), frac(num('1'), num('6'))))).toEqual({
      type: 'value',
      lhs: '1/3+1/6',
      value: '1/2',
    });
  });

  it('0.1+0.2 → "3/10"（输入小数转精确分数，无浮点怪异分数）', () => {
    expect(evalValue(seq(num('0.1'), op('+'), num('0.2')))).toEqual({
      type: 'value',
      lhs: '0.1+0.2',
      value: '3/10',
    });
  });

  it('2^3 → "8"', () => {
    expect(evalValue(pow(num('2'), num('3')))).toEqual({
      type: 'value',
      lhs: '2^3',
      value: '8',
    });
  });

  it('√9 → "3"（Fraction 通道 sqrt 抛错回退 number 通道，整数结果）', () => {
    expect(evalValue(sqrt(num('9')))).toEqual({
      type: 'value',
      lhs: '√(9)',
      value: '3',
    });
  });

  it('√2 → "≈ 1.41421"（无理数 ≈ + 6 位有效）', () => {
    expect(evalValue(sqrt(num('2'))).value).toBe('≈ 1.41421');
  });

  it('1÷3 → "1/3"，lhs 显示 "1÷3"', () => {
    expect(evalValue(seq(num('1'), op('/'), num('3')))).toEqual({
      type: 'value',
      lhs: '1÷3',
      value: '1/3',
    });
  });
});

describe('lhs 人读串（乘除 × ÷、括号组、乘方）', () => {
  it('(3+5)×2 → lhs "(3+5)×2"，值 16', () => {
    expect(evalValue(seq(seq(num('3'), op('+'), num('5')), op('*'), num('2')))).toEqual({
      type: 'value',
      lhs: '(3+5)×2',
      value: '16',
    });
  });

  it('(1/2)^2 → "1/4"（pow 的 frac base 加括号求值）', () => {
    expect(evalValue(pow(frac(num('1'), num('2')), num('2'))).value).toBe('1/4');
  });

  it('5×(6+4)÷2 → 25', () => {
    expect(
      evalValue(
        seq(num('5'), op('*'), seq(num('6'), op('+'), num('4')), op('/'), num('2')),
      ).value,
    ).toBe('25');
  });

  it('√2+1 → "≈ 2.41421"', () => {
    expect(evalValue(seq(sqrt(num('2')), op('+'), num('1'))).value).toBe('≈ 2.41421');
  });

  it('3.5+1.25 → "19/4"（improper 分数原样显示）', () => {
    expect(evalValue(seq(num('3.5'), op('+'), num('1.25'))).value).toBe('19/4');
  });
});

describe('compare 验算', () => {
  it('100 = 100 → match true，两侧填人读串', () => {
    expect(evalCompare(num('100'), num('100'))).toEqual({
      type: 'compare',
      lhs: '100',
      rhs: '100',
      match: true,
    });
  });

  it('100 vs 99 → match false', () => {
    const r = evalCompare(num('100'), num('99'));
    expect(r).toMatchObject({ type: 'compare', lhs: '100', rhs: '99', match: false });
  });

  it('两侧均为无理数：√2 vs √2 → true（number 通道）', () => {
    expect(evalCompare(sqrt(num('2')), sqrt(num('2')))).toMatchObject({
      type: 'compare',
      match: true,
    });
  });

  it('分数 vs 小数：1/3 vs 0.333333 → false（精确比较不等）', () => {
    expect(evalCompare(frac(num('1'), num('3')), num('0.333333')).match).toBe(false);
  });

  it('分数精确相等：2/4 vs 1/2 → true', () => {
    expect(evalCompare(frac(num('2'), num('4')), frac(num('1'), num('2'))).match).toBe(true);
  });
});

describe('error 路径', () => {
  it('1/0 → error "无法计算该算式"', () => {
    expect(evalValue(seq(num('1'), op('/'), num('0')))).toEqual({
      type: 'error',
      message: '无法计算该算式',
    });
  });

  it('0/0 → error', () => {
    expect(evalValue(seq(num('0'), op('/'), num('0'))).type).toBe('error');
  });

  it('num 叶子含非数字字符（孤立括号防御路径）→ error', () => {
    expect(evalValue(seq(num('3'), num(')'), op('+'), num('4'))).type).toBe('error');
  });

  it('空 lhs → error', () => {
    expect(evalValue(seq()).type).toBe('error');
  });

  it('compare 左侧失败 → error 且 message 含「左侧」', () => {
    const r = evalCompare(num(')'), num('5'));
    expect(r.type).toBe('error');
    expect(r.type === 'error' && r.message).toContain('左侧');
  });

  it('compare 右侧失败（空根号）→ error 且 message 含「右侧」', () => {
    const r = evalCompare(num('5'), sqrt(seq()));
    expect(r.type).toBe('error');
    expect(r.type === 'error' && r.message).toContain('右侧');
  });

  it('sqrt(-4)（number 通道复数结果）→ error，不静默输出', () => {
    expect(evalValue(sqrt(seq(op('-'), num('4')))).type).toBe('error');
  });
});

describe('rhs 空.seq 按 value 处理（"12=" 衔接 Task 7）', () => {
  it('{lhs 12, rhs seq()} → value "12"', () => {
    expect(evalEquation({ lhs: num('12'), rhs: seq() })).toEqual({
      type: 'value',
      lhs: '12',
      value: '12',
    });
  });
});

describe('formatValue 直测', () => {
  it('Fraction 分母 1 → 整数字符串', () => {
    expect(formatValue(F(46))).toBe('46');
    expect(formatValue(F(0))).toBe('0');
    expect(formatValue(F(-46))).toBe('-46');
  });

  it('Fraction improper 原样 a/b，负号在前', () => {
    expect(formatValue(F(7, 3))).toBe('7/3');
    expect(formatValue(F(-1, 2))).toBe('-1/2');
    expect(formatValue(F(19, 4))).toBe('19/4');
  });

  it('number 接近整数 → 整数串', () => {
    expect(formatValue(46)).toBe('46');
    expect(formatValue(-3)).toBe('-3');
    expect(formatValue(3.0000000001)).toBe('3');
    expect(formatValue(-0)).toBe('0');
  });

  it('number 无理数 → "≈ " + 6 位有效去尾零', () => {
    expect(formatValue(Math.sqrt(2))).toBe('≈ 1.41421');
    expect(formatValue(2.5)).toBe('≈ 2.5');
    expect(formatValue(-2.5)).toBe('≈ -2.5');
    expect(formatValue(0.30000000000000004)).toBe('≈ 0.3');
    expect(formatValue(100000.2)).toBe('≈ 100000');
  });

  it('巨大整数：十进制意图 ≤6 位有效时精确整串，否则 ≈ + 6 位有效（钉住指数路径）', () => {
    expect(formatValue(1e21)).toBe('1e+21');
    expect(formatValue(1.234567e21)).toBe('≈ 1.23457e+21');
  });
});
