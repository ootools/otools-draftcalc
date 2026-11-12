/**
 * Task 6：求值 —— AST → mathjs 表达式串，双通道求值（Fraction 精确优先，
 * 抛错回退 number），结果按既定格式输出。
 *
 * 结果格式（规格已定决策）：
 *   - 有理数 → 精确分数（improper 原样，如 19/4；分母 1 显示整数）；
 *   - 无理数 → "≈ " + 6 位有效数字（toPrecision(6) 去尾零）；
 *   - 输入含小数 → 转精确分数计算（见 numExprText 的有理化约束）。
 *
 * 小数有理化策略：不依赖 mathjs 对小数字面量的 Fraction 转换（对超长尾数会
 * 给出分母 >1e6 的怪异分数，如 0.30000000000000004 → 7500000000000001/2.5e16），
 * 而是在 AST→表达式串阶段就把小数字面量按「数字串」精确构造为整数分数：
 *   - 小数位 ≤6 且总位数 ≤15 → 精确（如 0.1 → (1/10)、3.5 → (7/2)）；
 *   - 小数位 >6 → 四舍五入到 6 位（math.round(x*1e6)/1e6 类策略，分母上限 1e6）；
 *   - 总位数 >15（超出手写场景）→ 原样交给 mathjs 的防御路径。
 * 因此 0.1+0.2 在 Fraction 通道恒为 3/10。
 *
 * 双通道：先 {number:'Fraction'} 精确求值；sqrt 一律抛错（mathjs 内部
 * BigNumber 转换），2^(1/2) 类非整数次幂返回 number —— 两者都接受；抛错或
 * 返回其它类型（如 sqrt(-4) 的 Complex）→ 回退 number 通道；number 通道
 * 得非 number（Complex）或 Infinity/NaN（除零）→ EvalResult error。
 *
 * compare：lhs/rhs 各自求值，任一失败 → error 且 message 注明哪侧；两侧
 * 成功 → 双 Fraction 精确相等（BigInt 交叉相乘），否则 number 相对容差
 * |a-b| ≤ 1e-9×max(1,|a|,|b|)。
 */
import { create, all } from 'mathjs';
import type { Fraction } from 'mathjs';
import type { Equation, ExprNode } from './types';

// ---------------------------------------------------------------- 钉死接口

export type EvalResult =
  | { type: 'value'; lhs: string; value: string }
  | { type: 'compare'; lhs: string; rhs: string; match: boolean }
  | { type: 'error'; message: string };

export function evalEquation(eq: Equation): EvalResult {
  try {
    const lhsHuman = toHuman(eq.lhs);
    const rhs = eq.rhs;
    if (rhs === null || isEmptyExpr(rhs)) {
      const v = evalBoth(toExpr(eq.lhs));
      return { type: 'value', lhs: lhsHuman, value: formatValue(v) };
    }
    const rhsHuman = toHuman(rhs);
    let lv: NumValue;
    try {
      lv = evalBoth(toExpr(eq.lhs));
    } catch {
      return { type: 'error', message: '左侧算式无法计算' };
    }
    let rv: NumValue;
    try {
      rv = evalBoth(toExpr(rhs));
    } catch {
      return { type: 'error', message: '右侧算式无法计算' };
    }
    return { type: 'compare', lhs: lhsHuman, rhs: rhsHuman, match: valuesEqual(lv, rv) };
  } catch {
    // 空算式 / 非法 num 叶子（如孤立括号、'fracbar' 叶子）/ 除零等一切求值失败
    return { type: 'error', message: '无法计算该算式' };
  }
}

export function formatValue(v: number | Fraction): string {
  if (typeof v === 'number') return formatNumber(v);
  const sign = Number(v.s) < 0 ? '-' : '';
  return Number(v.d) === 1 ? `${sign}${v.n}` : `${sign}${v.n}/${v.d}`;
}

// ---------------------------------------------------------------- 双通道求值

const fracMath = create(all, { number: 'Fraction' });
const numMath = create(all);

type NumValue = number | Fraction;

const isFractionValue = (v: unknown): v is Fraction =>
  typeof v === 'object' && v !== null && 'n' in v && 'd' in v && 's' in v;

/**
 * 双通道求值：Fraction 通道成功（Fraction 或有限 number，如 2^(1/2) 的回退
 * 值）直接采用；抛错或其它类型 → number 通道；number 通道非 number/非有限
 * （Complex / Infinity / NaN）→ 抛错（由 evalEquation 转 error）。
 */
function evalBoth(expr: string): NumValue {
  if (expr.trim() === '') throw new Error('空算式');
  try {
    const v: unknown = fracMath.evaluate(expr);
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error('无法计算该算式');
      return v;
    }
    if (isFractionValue(v)) return v;
  } catch {
    // Fraction 通道失败 → 落到 number 通道
  }
  const nv: unknown = numMath.evaluate(expr);
  if (typeof nv !== 'number' || !Number.isFinite(nv)) {
    throw new Error('无法计算该算式');
  }
  return nv;
}

function valuesEqual(a: NumValue, b: NumValue): boolean {
  if (isFractionValue(a) && isFractionValue(b)) {
    return (
      BigInt(a.s) * BigInt(a.n) * BigInt(b.d) === BigInt(b.s) * BigInt(b.n) * BigInt(a.d)
    );
  }
  const x = toNumberValue(a);
  const y = toNumberValue(b);
  return Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
}

function toNumberValue(v: NumValue): number {
  return typeof v === 'number' ? v : (Number(v.s) * Number(v.n)) / Number(v.d);
}

// ---------------------------------------------------------------- 结果格式化

function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return '无法计算该算式';
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-9) return String(r);
  const s = v.toPrecision(6);
  if (s.includes('e')) {
    // 指数形式只整理尾数部分的尾零（"1.00000e-7" → "1e-7"）
    const [m, e] = s.split('e');
    const mantissa = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m;
    return `≈ ${mantissa}e${e}`;
  }
  // 仅小数形式去尾零（"2.50000" → "2.5"）；整数形式如 "100000" 的尾零有效
  const trimmed = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  return `≈ ${trimmed}`;
}

// ---------------------------------------------------------------- AST → 表达式串

/** 小数字面量 → 精确整数分数串（分母上限 1e6），见文件头说明。 */
function numExprText(text: string): string {
  if (!/^[0-9.]+$/.test(text)) throw new Error(`非法数字串：${text}`);
  const dots = (text.match(/\./g) ?? []).length;
  if (dots > 1) throw new Error(`非法数字串：${text}`);
  if (!/[0-9]/.test(text)) throw new Error(`非法数字串：${text}`);
  if (dots === 0) return text.replace(/^0+(?=[0-9])/, ''); // "007"→"7"、"0"→"0"
  const [ip, fp = ''] = text.split('.');
  if (fp === '') return ip.replace(/^0+(?=[0-9])/, ''); // "5." → "5"
  const digits = ip + fp;
  if (digits.length <= 15 && fp.length <= 6) {
    // 精确构造：数字串直接当整数分子，分母为 10^小数位
    const numer = Number(digits);
    const denom = 10 ** fp.length;
    const g = gcd(numer, denom);
    return `(${numer / g}/${denom / g})`;
  }
  if (fp.length > 6) {
    // 有理化约束：分母上限 1e6（四舍五入到 6 位小数）
    const numer = Math.round(Number(text) * 1e6);
    const g = gcd(numer, 1e6);
    return `(${numer / g}/${1e6 / g})`;
  }
  // 总位数 >15 且小数位 ≤6：超出手写场景的防御路径，原样交给 mathjs
  return `${Number(ip) || 0}.${fp}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** pow 底数/指数为复合节点时加括号（num 直接裸写）。 */
function needsParen(n: ExprNode): boolean {
  return n.kind === 'seq' || n.kind === 'frac' || n.kind === 'pow';
}

/** AST → mathjs 表达式串：frac 全括号、pow 用 ^、sqrt 用 sqrt(...)。 */
function toExpr(node: ExprNode): string {
  switch (node.kind) {
    case 'num':
      return numExprText(node.text);
    case 'op':
      return node.op;
    case 'seq':
      // 子层 seq（括号组/多元素区域）加括号；括号相邻自然形成隐式乘法
      return node.items
        .map((it) => (it.kind === 'seq' ? `(${toExpr(it)})` : toExpr(it)))
        .join('');
    case 'frac':
      return `(${toExpr(node.num)})/(${toExpr(node.den)})`;
    case 'pow': {
      const b = needsParen(node.base) ? `(${toExpr(node.base)})` : toExpr(node.base);
      const e = needsParen(node.exp) ? `(${toExpr(node.exp)})` : toExpr(node.exp);
      return `${b}^${e}`;
    }
    case 'sqrt':
      return `sqrt(${toExpr(node.arg)})`;
  }
}

// ---------------------------------------------------------------- AST → 人读串

/** lhs/rhs 展示串：乘除用 × ÷、根号 √(...)、乘方 ^、分数 a/b。 */
function toHuman(node: ExprNode): string {
  switch (node.kind) {
    case 'num':
      return node.text;
    case 'op':
      return node.op === '*' ? '×' : node.op === '/' ? '÷' : node.op;
    case 'seq':
      return node.items.map((it) => (it.kind === 'seq' ? `(${toHuman(it)})` : toHuman(it))).join('');
    case 'frac':
      return `${humanWrapped(node.num)}/${humanWrapped(node.den)}`;
    case 'pow': {
      const b =
        node.base.kind === 'seq' || node.base.kind === 'frac' || node.base.kind === 'pow'
          ? `(${toHuman(node.base)})`
          : toHuman(node.base);
      const e =
        node.exp.kind === 'seq' || node.exp.kind === 'frac' || node.exp.kind === 'pow'
          ? `(${toHuman(node.exp)})`
          : toHuman(node.exp);
      return `${b}^${e}`;
    }
    case 'sqrt':
      return `√(${toHuman(node.arg)})`;
  }
}

function humanWrapped(n: ExprNode): string {
  return n.kind === 'seq' || n.kind === 'frac' || n.kind === 'pow'
    ? `(${toHuman(n)})`
    : toHuman(n);
}

// ---------------------------------------------------------------- 小工具

/** rhs 为空 seq（"12=" 场景，parseEquation 对空右半返回空 seq）→ 按 value 处理。 */
function isEmptyExpr(n: ExprNode): boolean {
  return n.kind === 'seq' && n.items.length === 0;
}
