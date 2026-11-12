/**
 * Task 5：2D 结构解析（seshat 风格简化）。
 *
 * 输入分割/分类后的 Glyph 序列，输出算式 AST（types.ts 的 ExprNode/Equation）。
 * 每层递归按固定顺序裁决：
 *
 *   ① fracbar：x 区间能覆盖其上方与下方内容（上/下各至少 1 个 token、与横线 bbox
 *      在 x 上重叠 ≥30% 内容宽、垂直方向紧邻）→ frac 节点，上/下递归；多个有效
 *      横线取最宽者先归约（嵌套/宽横线的外层先吃掉内容，繁分数由此成立）。
 *      上方或下方缺内容的 fracbar 一律降级为 '-' op glyph —— 这是 T3 审查发现的
 *      「浅斜 × 退化两个 fracbar」与「分子负号」场景的语境裁决点。
 *   ② sqrt 作用域：√ 右侧（x0 > √.x0）、顶部不低于 √ 顶部 + 60%×√ 高度的连续
 *      token 序列，遇 + - * / = 截断（根号只绑定紧跟的操作数，括号内算子不受影响）。
 *      二维 node 不吸入（审查 P2）：frac（分数线写法）一律截断——要进根号须写
 *      括号 √(1/2)；括号组仅当紧跟 √（x0 ≤ √.x1 + 0.5×基线主高）才视为 radicand
 *      （√9(3) 的 (3) 不吸入，√(16) 吸入）。
 *      右侧无内容 → arg 取空 seq（求值时报错，由 T6 处理）。
 *   ③ 上标：高度 < 0.6×当前层基线主高、bbox 顶高于前一基线 token 顶、x 在其后 →
 *      前一个基线 token 为 base 组成 pow。上标可以是连续多个 glyph（10 的两位
 *      指数）或小型抬头的括号组（10^(-23)，审查 P2）；整组递归解析，组内首位
 *      '-' 视为负号并入（exp = seq[op -, …]）；指数为裸 op 时不组 pow、按普通
 *      内容展开。0.6× 为阈值：0.7× 高度的临界上标归基线。
 *   ④ 余下按 x 升序为基线 seq：连续数字与 '.' 合成 num（'.' 允许多次属语法错误，
 *      此处只拼进 text 由下游报错）、+ - * / → op（降级 fracbar 记 '-'）、
 *      孤立不配对括号按原样保留为叶子（T6 grammar 清理）。
 *      任何基线元素落盘前先结算悬空数字串（审查 P1）：2(3+4)5 →
 *      seq[num 2, 括号组, num 5]，数字绝不跨 node 并串或倒置。
 *   '=' 在 parseEquation 层按第一个切分 lhs/rhs；多余 '=' 随 rhs 丢弃
 *      （真实管线中 T6 correctGlyphs 在解析前已清理）。
 *
 * 实现要点：
 * - 括号配对前置为 tokenize（先于 ①②③），把每对 ( … ) 归约成一个 node token，
 *   使分数/根号的区域切分不会撕裂括号组（如 √(1/2)、(1/2)²）。
 * - 基线主高 = 该层非上标 glyph 高度中位数。估计器（审查 P1）：以 plain glyph 的
 *   最高者为基线锚点（上标/降级横线不会是层内最高的 plain；无 plain token 时
 *   退化为全体最高者），取「高度 ≥ 0.6×锚点」子集的中位数 —— 层内小 glyph 达到
 *   半数以上时（2^10、2^100）全集中位数会被上标拉低而失效，较高子集对上标
 *   数量不敏感。底数为 node、plain 全是上标小字时（(1/2)²³，复审 P2）plain
 *   锚点会塌缩，此时改用全体最高者重锚；重锚后 0.7× 全体最高者仍必然归基线。
 * - 所有递归都作用在严格缩小的 token 子集上，必然终止；无 DOM 依赖。
 */
import type { BBox, Equation, ExprNode, Glyph, SymbolLabel } from './types';

// ---------------------------------------------------------------- 几何小工具

const midY = (b: BBox): number => (b.y0 + b.y1) / 2;
const midX = (b: BBox): number => (b.x0 + b.x1) / 2;
const hOf = (b: BBox): number => b.y1 - b.y0;
const wOf = (b: BBox): number => b.x1 - b.x0;

/** x 区间重叠宽度（≤0 表示不相交）。 */
function xOverlap(a: BBox, b: BBox): number {
  return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
}

function hull(a: BBox, b: BBox): BBox {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

function hullAll(bs: BBox[]): BBox {
  return bs.reduce(hull);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 按 x 升序（x 相同按 y0）排序比较器。 */
function byX(a: BBox, b: BBox): number {
  return a.x0 - b.x0 || a.y0 - b.y0;
}

function isDigit(l: SymbolLabel): boolean {
  return l.length === 1 && l >= '0' && l <= '9';
}

// ---------------------------------------------------------------- 层内 token

/**
 * 一层内的 token：
 * - plain：单个 glyph（degraded 标记「上/下缺内容而降级为 '-'」的 fracbar）；
 * - node：已归约的子树，bbox 为其几何外包；nodeKind 记录来源
 *   （paren=括号组 / frac=分数线 / sqrt=根号），供 ② 的作用域约束使用。
 */
type Tok =
  | { kind: 'plain'; g: Glyph; degraded?: boolean }
  | { kind: 'node'; nodeKind: 'paren' | 'frac' | 'sqrt'; node: ExprNode; bbox: BBox };

type PlainTok = Extract<Tok, { kind: 'plain' }>;

const tokBBox = (t: Tok): BBox => (t.kind === 'plain' ? t.g.bbox : t.bbox);

/**
 * 基线主高：该层非上标 glyph 高度中位数的估计。
 * 以 plain glyph 的最高者为锚点（无 plain token 时用全体最高者），
 * 取「高度 ≥ 0.6×锚点」子集的中位数。
 * 复审修正：底数为 node、层内 plain 全是上标小字时（(1/2)²³），plain 锚点会
 * 塌缩到上标高度致上标判定失效 —— 此时（plainMax < 0.6×全体最高）改用全体
 * 最高者重估锚点。重锚后高度门槛为 0.6×全体最高，任何 ≥0.7×全体最高的 glyph
 * 必然过不了门槛（0.7× 临界归基线的不变量不受重锚影响）。
 */
function mainHeight(tokens: Tok[]): number {
  const allHs = tokens.map((t) => hOf(tokBBox(t)));
  if (allHs.length === 0) return 0;
  const plainHs = tokens
    .filter((t): t is PlainTok => t.kind === 'plain')
    .map((t) => hOf(t.g.bbox));
  const allMax = Math.max(...allHs);
  let anchor = plainHs.length > 0 ? Math.max(...plainHs) : allMax;
  if (anchor < 0.6 * allMax) anchor = allMax;
  const mains = allHs.filter((h) => h >= 0.6 * anchor);
  return median(mains.length > 0 ? mains : allHs);
}

// ---------------------------------------------------------------- 括号配对前置

/**
 * 括号配对前置：每对匹配的 ( … ) 归约成一个 node token（内部递归 parseTokens），
 * 未配对的括号保持 plain token（④ 按原样保留为叶子）。
 * 前置使 ①② 的区域切分不会撕裂括号组。
 */
function tokenize(sorted: Glyph[]): Tok[] {
  const toks: Tok[] = [];
  const frames: { paren: Glyph; inner: Tok[] }[] = [];
  const emit = (t: Tok): void => {
    const top = frames[frames.length - 1];
    if (top) top.inner.push(t);
    else toks.push(t);
  };
  for (const g of sorted) {
    if (g.label === '(') {
      frames.push({ paren: g, inner: [] });
    } else if (g.label === ')' && frames.length > 0) {
      const f = frames.pop()!;
      const node = parseTokens(f.inner);
      const bbox = hullAll([f.paren.bbox, ...f.inner.map(tokBBox), g.bbox]);
      emit({ kind: 'node', nodeKind: 'paren', node, bbox });
    } else {
      emit({ kind: 'plain', g });
    }
  }
  // 未配对的 '('：括号本身与其已收集内容按原位置顺序保留为 plain token
  for (const f of frames) {
    toks.push({ kind: 'plain', g: f.paren });
    toks.push(...f.inner);
  }
  return toks;
}

// ---------------------------------------------------------------- ① fracbar

interface BarSplit {
  left: Tok[];
  right: Tok[];
  barNode: Tok;
}

/**
 * 在当前层找有效 fracbar（上、下各有 ≥1 个 x 重叠 ≥30% 内容宽且垂直紧邻的
 * token），取最宽者（同宽取最左）归约为 frac 节点；无有效横线返回 null。
 * 紧邻容差 = 0.75×基线主高（只约束最贴近横线的内容，嵌套内层可更远）。
 */
function splitByBar(tokens: Tok[]): BarSplit | null {
  const tol = 0.75 * mainHeight(tokens);
  const bars = tokens.filter(
    (t): t is PlainTok => t.kind === 'plain' && t.g.label === 'fracbar' && !t.degraded,
  );
  const scored = bars.map((bar) => {
    const bb = bar.g.bbox;
    const above: Tok[] = [];
    const below: Tok[] = [];
    for (const t of tokens) {
      if (t === bar) continue;
      const tb = tokBBox(t);
      const ov = xOverlap(tb, bb);
      // x 覆盖：与横线 bbox 在 x 上重叠 ≥30% 内容宽（避免紧邻同级符号被误吸入）
      if (ov <= 0 || ov < 0.3 * wOf(tb)) continue;
      if (midY(tb) < midY(bb)) above.push(t);
      else if (midY(tb) > midY(bb)) below.push(t);
    }
    if (above.length === 0 || below.length === 0) return null;
    // 垂直紧邻：靠得最近的内容与横线的间隙在容差内
    const gapAbove = bb.y0 - Math.max(...above.map((t) => tokBBox(t).y1));
    const gapBelow = Math.min(...below.map((t) => tokBBox(t).y0)) - bb.y1;
    if (gapAbove > tol || gapBelow > tol) return null;
    return { bar, above, below };
  });
  const valid = scored.filter((s): s is NonNullable<typeof s> => s !== null);
  if (valid.length === 0) return null;
  valid.sort(
    (a, b) =>
      wOf(b.bar.g.bbox) - wOf(a.bar.g.bbox) || a.bar.g.bbox.x0 - b.bar.g.bbox.x0,
  );
  const { bar, above, below } = valid[0];
  const bb = bar.g.bbox;
  const left: Tok[] = [];
  const right: Tok[] = [];
  for (const t of tokens) {
    if (t === bar) continue;
    const tb = tokBBox(t);
    const ov = xOverlap(tb, bb);
    const member = ov > 0 && ov >= 0.3 * wOf(tb);
    if (member && midY(tb) < midY(bb)) continue; // 已入 above
    if (member && midY(tb) > midY(bb)) continue; // 已入 below
    if (tb.x1 <= bb.x0 || (ov > 0 && midX(tb) < midX(bb))) left.push(t);
    else right.push(t);
  }
  const node: ExprNode = {
    kind: 'frac',
    num: parseTokens(above),
    den: parseTokens(below),
  };
  const barNode: Tok = {
    kind: 'node',
    nodeKind: 'frac',
    node,
    bbox: hullAll([bb, ...above.map(tokBBox), ...below.map(tokBBox)]),
  };
  return { left, right, barNode };
}

// ---------------------------------------------------------------- ② sqrt 作用域

/**
 * 归约左数第一个 sqrt 的作用域：√ 右侧、顶部 ≤ √顶 + 60%×√高 的连续 token，
 * 遇 + - * / =（含降级 fracbar）截断。二维 node 不吸入：
 * - frac node 一律截断（分数线写法的 √2/2 不得变成 sqrt(frac(2,2))，要进根号
 *   须写括号 √(1/2)——括号组归 tokenize、其内部递归不受影响）；
 * - 括号组仅当紧跟 √（x0 ≤ √.x1 + 0.5×基线主高）才属 radicand（√9(3) 不吸入）。
 * 右侧无内容（或首 token 即不满足）→ arg 为空 seq。返回替换后的 token 列表；
 * 无 sqrt 返回 null。
 */
function applySqrt(tokens: Tok[]): Tok[] | null {
  const idx = tokens.findIndex((t) => t.kind === 'plain' && t.g.label === 'sqrt');
  if (idx < 0) return null;
  const s = tokens[idx] as PlainTok;
  const sb = s.g.bbox;
  const topLimit = sb.y0 + 0.6 * hOf(sb);
  const attachTol = 0.5 * mainHeight(tokens);
  const scope: Tok[] = [];
  let rest = tokens.length;
  for (let i = idx + 1; i < tokens.length; i++) {
    const t = tokens[i];
    const tb = tokBBox(t);
    if (t.kind === 'plain') {
      const l = t.g.label;
      if (l === '=' || l === '+' || l === '-' || l === '*' || l === '/' || t.degraded) {
        rest = i;
        break;
      }
    } else if (t.nodeKind === 'frac' || tb.x0 > sb.x1 + attachTol) {
      rest = i;
      break;
    }
    if (tb.x0 <= sb.x0 || tb.y0 > topLimit) {
      rest = i;
      break;
    }
    scope.push(t);
  }
  const node: ExprNode = { kind: 'sqrt', arg: parseTokens(scope) };
  const nodeTok: Tok = {
    kind: 'node',
    nodeKind: 'sqrt',
    node,
    bbox: hullAll([sb, ...scope.map(tokBBox)]),
  };
  return [...tokens.slice(0, idx), nodeTok, ...tokens.slice(rest)];
}

// ---------------------------------------------------------------- ③④ 基线 + 上标

/**
 * ③④：上标归并 + 基线 seq 组装。返回该层基线 item 列表。
 * 上标判定（plain 与 node 均可入指数组）：高度 < 0.6×基线主高 且 bbox 顶高于
 * 前一基线 token 顶 且 x 在其后；连续成员合成同一指数组，整组递归解析后挂到
 * 前一个基线 token（数字串先合并成 num 再挂，保证 10²³ 的 base 是 num "10"）。
 * exp 为裸 op、或前一元素是 op（行首/运算符后的小 glyph）时不组 pow，
 * 按普通内容展开。
 */
function baselineItems(tokens: Tok[]): ExprNode[] {
  const limit = 0.6 * mainHeight(tokens);
  const items: ExprNode[] = [];
  let run = '';
  let sup: Tok[] | null = null;
  let baseTop: number | null = null; // 前一基线 token 的 bbox 顶
  let baseX0 = Number.NEGATIVE_INFINITY;

  const flushNum = (): void => {
    if (run !== '') {
      items.push({ kind: 'num', text: run });
      run = '';
    }
  };
  const flushSup = (): void => {
    if (!sup) return;
    flushNum();
    const group = sup;
    sup = null;
    const exp = parseTokens(group);
    const prev = items[items.length - 1];
    if (prev && prev.kind !== 'op' && exp.kind !== 'op') {
      items.pop();
      items.push({ kind: 'pow', base: prev, exp });
    } else {
      // 无法组乘方（前一元素是 op / 行首 / 指数为裸 op）：按普通内容展开
      items.push(exp);
    }
  };

  for (const t of tokens) {
    const tb = tokBBox(t);
    if (t.kind === 'plain' && t.g.label === '=') {
      // parseEquation 已按第一个 '=' 切分；多余的 '=' 在此丢弃并断开数字串
      flushSup();
      flushNum();
      continue;
    }
    const heightOk =
      t.kind === 'plain' ? !t.degraded && hOf(tb) < limit : hOf(tb) < limit;
    if (heightOk && baseTop !== null && tb.y0 < baseTop && tb.x0 > baseX0) {
      // ③ 上标：连续成员归入同一指数组（不更新基线参照）
      if (sup) sup.push(t);
      else sup = [t];
      continue;
    }
    flushSup();
    if (t.kind === 'node') {
      // P1-1：node 落盘前结算悬空数字串（2(3+4)5 的 2 不得跨 node 并串/倒置）
      flushNum();
      items.push(t.node);
      baseTop = tb.y0;
      baseX0 = tb.x0;
      continue;
    }
    const g = t.g;
    const gb = g.bbox;
    baseTop = gb.y0;
    baseX0 = gb.x0;
    const l = g.label;
    if (isDigit(l) || l === '.') {
      // 连续数字/'.' 拼进同一 num（'.' 出现多次属语法错误，不在此报错，
      // T6 grammar/求值层按非法数字串报 error —— 防御路径由测试钉死）
      run += l;
      continue;
    }
    flushNum();
    if (t.degraded) {
      items.push({ kind: 'op', op: '-' });
    } else if (l === '+' || l === '-' || l === '*' || l === '/') {
      items.push({ kind: 'op', op: l });
    } else {
      // 孤立不配对括号等无法归类的符号：按原样保留为叶子（T6 grammar 清理）
      items.push({ kind: 'num', text: l });
    }
  }
  flushSup();
  flushNum();
  return items;
}

// ---------------------------------------------------------------- 一层裁决

/** 一层的完整裁决：① fracbar → 降级余下横线 → ② sqrt → ③④ 基线+上标。 */
function tokenItems(input: Tok[]): ExprNode[] {
  let tokens = [...input].sort((a, b) => byX(tokBBox(a), tokBBox(b)));

  // ① fracbar 裁决：逐个归约（每次至少消耗横线+上下内容，必然终止）
  for (;;) {
    const split = splitByBar(tokens);
    if (!split) break;
    tokens = [...split.left, split.barNode, ...split.right];
  }
  // 上/下缺内容的 fracbar 一律降级为 '-' op
  tokens = tokens.map((t) =>
    t.kind === 'plain' && t.g.label === 'fracbar' && !t.degraded
      ? { ...t, degraded: true }
      : t,
  );
  // ② sqrt 作用域：逐个归约（每次至少消耗 √ 自身）
  for (;;) {
    const next = applySqrt(tokens);
    if (!next) break;
    tokens = next;
  }
  // ③④ 上标 + 基线 seq
  return baselineItems(tokens);
}

/** token 列表 → AST：单元素直接解包，多元素/空 → seq。 */
function parseTokens(tokens: Tok[]): ExprNode {
  const items = tokenItems(tokens);
  return items.length === 1 ? items[0] : { kind: 'seq', items };
}

// ---------------------------------------------------------------- 钉死接口

/** 单侧递归入口：一串 glyph（半边算式）→ AST。 */
export function parseExpr(glyphs: Glyph[]): ExprNode {
  const sorted = [...glyphs].sort((a, b) => byX(a.bbox, b.bbox));
  return parseTokens(tokenize(sorted));
}

/** 整行解析：按第一个 '=' 切 lhs/rhs；无 '=' → rhs=null。多余 '=' 随 rhs 丢弃。 */
export function parseEquation(glyphs: Glyph[]): Equation {
  const sorted = [...glyphs].sort((a, b) => byX(a.bbox, b.bbox));
  const eq = sorted.findIndex((g) => g.label === '=');
  if (eq < 0) return { lhs: parseExpr(sorted), rhs: null };
  return {
    lhs: parseExpr(sorted.slice(0, eq)),
    rhs: parseExpr(sorted.slice(eq + 1)),
  };
}
