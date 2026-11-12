/**
 * Task 6：语法校验 —— 在解析【前】按位置规则清理 glyph 序列。
 *
 * 只做结构性清理：删除非法位置的符号（被删项直接移除），绝不改写保留项的
 * label/alts/bbox/strokes，不基于语义改 CNN top-1 label（规则 5）。
 *
 * 规则（自左向右扫描 label 序列）：
 *   1. 连续运算符去重：保留第一个，删后续（[2,+,+]→[2,+]）。
 *      '-' 紧跟另一运算符时同样删除（[3,-,-,5]→[3,-,5]、[3,-,+,5]→删 '+'），
 *      即去重后一个数字前至多保留一个前缀负号。
 *   2. 行首运算符删除，'- 5' 例外（负号合法，含 '=' 之后与 '(' 之后的同位负号）；
 *      行尾运算符删除；紧贴 ')' 或 '=' 的悬空二元运算符同样删除。
 *      行首 fracbar 不删（parse2d 会把缺上/下内容的 fracbar 降级为 '-' op）。
 *   3. 不配对括号删除：栈匹配，先删多余 ')'，再删孤立 '('。
 *   4. '.' 规则：一个 num 串（连续数字/点段）内至多一个 '.'（两个连续 '.'
 *      删第二个）；'.' 前后都无数字 → 删除。
 *   5. 多余 '=' 删除：保留第一个（parse2d.ts 约定「多余 '=' 由 T6 解析前清理」）。
 *
 * 各 pass 只删除不改序。执行顺序：等号/括号/点号这些幂等结构 pass 先迭代至
 * 不动点（删除暴露的新悬空括号/点由下一轮清理），运算符 pass 最后【单趟】
 * 执行 —— 其前瞻基于清理后的邻接；去重保留的 run 首即使随之成为行尾也不再
 * 回删（计划钉死 [2,+,+]→[2,+]，与行尾单运算符 [5,+]→[5] 由同一趟前瞻区分）。
 * 无 DOM 依赖。
 */
import type { Glyph, SymbolLabel } from './types';

const isOp = (l: SymbolLabel | null): boolean =>
  l === '+' || l === '-' || l === '*' || l === '/';

const isDigit = (l: SymbolLabel | null): boolean =>
  l !== null && l.length === 1 && l >= '0' && l <= '9';

/** 多余 '=' 删除：保留第一个 '='。 */
function passEq(gs: Glyph[]): Glyph[] {
  let seen = false;
  return gs.filter((g) => {
    if (g.label !== '=') return true;
    if (seen) return false;
    seen = true;
    return true;
  });
}

/**
 * 运算符清理。expectOperand 表示当前位置应出现操作数（行首 / 运算符或
 * '('、'=' 之后）；此时仅保留「负号位 '-'」（前一保留符号不是运算符，且
 * 后面紧跟数字/'.'/ '('）。二元位（操作数之后）的运算符保留，除非其后
 * 无操作数（行尾 / 紧贴 ')' 或 '='）。
 */
function passOperators(gs: Glyph[]): Glyph[] {
  const out: Glyph[] = [];
  let expectOperand = true; // 行首
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i];
    const l = g.label;
    const next = i + 1 < gs.length ? gs[i + 1].label : null;
    if (isOp(l)) {
      if (expectOperand) {
        const prev = out.length > 0 ? out[out.length - 1].label : null;
        const unaryMinus =
          l === '-' && !isOp(prev) && (isDigit(next) || next === '.' || next === '(');
        if (unaryMinus) out.push(g); // 负号：期待操作数的状态不变
        // 其余删除（连续运算符的后续 / 行首二元运算符）
      } else if (next === null || next === ')' || next === '=') {
        // 悬空二元运算符（行尾/贴 ')'/'='）→ 删除；expectOperand 不变
      } else {
        out.push(g);
        expectOperand = true;
      }
      continue;
    }
    out.push(g);
    if (l === '(' || l === '=') expectOperand = true;
    else if (l === ')') expectOperand = false;
    else expectOperand = false; // 数字 / '.' / sqrt / fracbar
  }
  return out;
}

/**
 * 不配对括号删除：单趟栈扫描 —— 遇 ')' 栈空即删（多余 ')'）；扫描结束后
 * 栈内残留的均为孤立 '('，统一删除。
 */
function passParens(gs: Glyph[]): Glyph[] {
  const keep: boolean[] = new Array(gs.length).fill(true);
  const stack: number[] = [];
  for (let i = 0; i < gs.length; i++) {
    const l = gs[i].label;
    if (l === '(') stack.push(i);
    else if (l === ')') {
      if (stack.length > 0) stack.pop();
      else keep[i] = false;
    }
  }
  for (const i of stack) keep[i] = false;
  return gs.filter((_, i) => keep[i]);
}

/**
 * '.' 清理：inRun 标记当前处于连续数字/点段（一个 num 串）内；段内第一个
 * '.' 保留、后续删除。段外的 '.' 仅当紧邻（前一保留符号或下一 glyph）有
 * 数字时保留（".5"/"5." 合法），否则删除。
 */
function passDots(gs: Glyph[]): Glyph[] {
  const out: Glyph[] = [];
  let inRun = false;
  let dotKept = false;
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i];
    const l = g.label;
    if (isDigit(l)) {
      inRun = true;
      out.push(g);
    } else if (l === '.') {
      if (!inRun) {
        const prev = out.length > 0 ? out[out.length - 1].label : null;
        const next = i + 1 < gs.length ? gs[i + 1].label : null;
        if (!isDigit(prev) && !isDigit(next)) continue; // 前后都无数字 → 删除
        inRun = true;
        dotKept = false;
      }
      if (dotKept) continue; // 一个 num 串内至多一个 '.'
      dotKept = true;
      out.push(g);
    } else {
      inRun = false;
      dotKept = false;
      out.push(g);
    }
  }
  return out;
}

/**
 * 在解析前清理 glyph 序列：
 * ① 等号/括号/点号结构 pass 迭代至不动点（有界 8 轮）；
 * ② 运算符 pass 单趟执行（前瞻已清理的邻接；run 首保留后不回删）。
 */
export function correctGlyphs(glyphs: Glyph[]): Glyph[] {
  let cur = glyphs;
  for (let i = 0; i < 8; i++) {
    const next = passDots(passParens(passEq(cur)));
    if (next.length === cur.length) break;
    cur = next;
  }
  return passOperators(cur);
}
