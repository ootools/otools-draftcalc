/**
 * 核心类型定义 —— 全部后续任务（分割/识别/解析/求值/UI）依赖此文件，
 * 接口名与字段已钉死，不得改名或改签名。
 */

/** 手写采样点：一按一抬为一笔（Stroke），笔内点按时间递增。 */
export interface Pt { x: number; y: number; t: number }

/** 一笔笔画。id 在行内/画布内唯一，用于撤销与橡皮定位。 */
export interface Stroke { id: number; pts: Pt[] }

/** 轴对齐包围盒（含端点，x0<=x1, y0<=y1）。 */
export interface BBox { x0: number; y0: number; x1: number; y1: number }

/**
 * 符号标签全集：
 * - `'0'-'9'`、`'+'、'-'、'*'、'/'、'('、')'、'sqrt'` 为 CNN 17 类（模型输出维序见 Task 4 LABELS）；
 * - `'.'`（bbox 两维均极小）、`'='`（两笔横条堆叠）、`'fracbar'`（单笔横向长条）
 *   由几何规则直接判定，不进 CNN。
 */
export type SymbolLabel =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '+' | '-' | '*' | '/' | '(' | ')' | 'sqrt'
  | '.' | '=' | 'fracbar';

/** 分割 + 分类后的一个符号：几何上的一簇笔画及其识别结果。 */
export interface Glyph {
  strokes: Stroke[];
  bbox: BBox;
  /** 当前生效标签（可被候选纠正改写）。 */
  label: SymbolLabel;
  /** top-k 备选（含当前 label 本身，供 UI 循环切换）。 */
  alts: SymbolLabel[];
  /** top-1 置信度 0..1；几何规则判定时为 1。 */
  conf: number;
}

/** 算式 AST（seshat 风格简化二维结构）。 */
export type ExprNode =
  | { kind: 'seq'; items: ExprNode[] }
  | { kind: 'num'; text: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'frac'; num: ExprNode; den: ExprNode }
  | { kind: 'pow'; base: ExprNode; exp: ExprNode }
  | { kind: 'sqrt'; arg: ExprNode };

/** 一行一条算式：写完 `=` 后 rhs 非空；rhs 为 null 表示尚未写等号。 */
export interface Equation { lhs: ExprNode; rhs: ExprNode | null }
