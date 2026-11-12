/// <reference types="otools-plugin-sdk" />
/**
 * Task 8：稿纸 UI 状态接线 —— LineManager 的 Vue reactive 包装、识别器装配
 * （OrtRecognizer 默认 / ?mock=1 强制 MockRecognizer）与「最近算式」历史持久化。
 *
 * 装配契约（Task 8 钉死）：
 *   - usePaper 暴露：lines、engineReady、engineError、activeLineId、history 与
 *     addStroke/undo/eraseAt/clearAll/setAlt/copyLastResult；
 *   - 横幅 engineError 只由 OrtRecognizer.init() reject 或 pipeline 抛出的
 *     '识别引擎未就绪' 前缀错误驱动；WarmupError（'识别预热中：' 前缀）绝不进横幅 ——
 *     由 pipeline 包装层按前缀过滤（recognize.ts 错误前缀契约）；
 *   - rerunScheduler：Ort 模式注入 whenSettled 感知调度器
 *     `(fn) => ort.whenSettled().then(fn)`（附带 syncLines 刷新 UI）；
 *     Mock 模式 classify 全同步、永不抛 WarmupError，用默认 queueMicrotask；
 *   - labelOverride 按晚期绑定模式装配：`(img) => manager?.labelOverride(img) ?? null`
 *     箭头闭包引用 manager 变量（直接传 manager.labelOverride 会丢 this，见 lines.ts 注释）；
 *   - LineManager 惰性创建于第一笔：行高 hint = 首行笔画高度估计（第一笔 bbox 高，
 *     夹取到 [16,120]，退化/过小回退 48px 默认）；此后各行行高由 createPipeline 内的
 *     行内笔画高度中位数自行决定，构造 hint 仅作退化行回退。
 *
 * 历史契约：
 *   - 最近 20 条 {expr, value, at}；来源 = EvalResult value/compare 型且 lhs 非空
 *     （error 不入史）；compare 条目 value 记 '✓'/'✗'，expr 记 `lhs = rhs`；
 *   - 持久化 window.otools.getPluginLocalStateValue(undefined,'history') /
 *     savePluginLocalStateValue(undefined,'history',items)，window.otools 不存在时
 *     回退 localStorage('draftcalc-history')；HistoryStore 构造注入 storage；
 *   - 同一行结果变化（rhs 续写 / 候选纠正重算）按行 id + 内容签名记录一次；
 *     连续重复 expr 由 HistoryStore 去重（刷新时间戳置顶）。
 *
 * reactive 策略：LineManager.lines 是纯数据（Task 7），本模块用 shallowRef 包一层，
 * 每次用户动作 / 调度重跑后以新数组引用同步（lines.value = [...manager.lines]），
 * 组件随引用变化整体重渲染。调度的延迟重跑发生在 LineManager 内部，故
 * rerunScheduler 包装 .finally(syncLines) 保证 UI 同步。
 */
import { ref, shallowRef, type Ref } from 'vue';
import { createPipeline, LineManager, type LinePipeline, type LineState } from './core/lines';
import { LABELS, MockRecognizer, OrtRecognizer, segmentClassify, setRecognizer } from './core/recognize';
import { bboxOf } from './core/strokes';
import type { Stroke, SymbolLabel } from './core/types';

// ---------------------------------------------------------------- 常量

/** init 失败 / pipeline 故障时横幅唯一文案（Task 8 钉死）。 */
export const ENGINE_DOWN_MESSAGE = '识别引擎未就绪，可继续书写';
/** 横幅判别前缀：仅故障路径（recognize.ts 前缀契约；WarmupError 的 '识别预热中：' 不匹配）。 */
const ENGINE_DOWN_PREFIX = '识别引擎未就绪';
/** otools 宿主不可用时的 localStorage 回退键。 */
const HISTORY_STORAGE_KEY = 'draftcalc-history';
/** 历史上限（Task 8 钉死：最近 20 条）。 */
const HISTORY_CAP = 20;
/** 行高 hint 默认（首行高度估计不可得时的回退）。 */
const DEFAULT_LINE_HEIGHT_HINT = 48;
/** 行高 hint 夹取范围：过小（点/横条起笔）回退默认，过大夹上限。 */
const MIN_LINE_HEIGHT_HINT = 16;
const MAX_LINE_HEIGHT_HINT = 120;

// ---------------------------------------------------------------- 历史持久化

/** 一条历史：expr 为算式串（compare 型为 `lhs = rhs`），value 为结果串（compare 为 ✓/✗）。 */
export interface HistoryItem {
  expr: string;
  value: string;
  at: number;
}

/** 历史存储抽象：构造注入（vitest 用内存 fake；浏览器用 otools 宿主 / localStorage）。 */
export interface HistoryStorage {
  read(): Promise<HistoryItem[] | null>;
  write(items: HistoryItem[]): Promise<void> | void;
}

/** 最近算式历史：构造注入 storage；连续重复 expr 去重（刷新时间戳置顶）；上限 cap 条。 */
export class HistoryStore {
  readonly items: HistoryItem[] = [];

  constructor(
    private readonly storage: HistoryStorage,
    private readonly cap = HISTORY_CAP,
  ) {}

  /** 启动时读回：过滤形状非法的损坏条目并截断到 cap；只读不写。 */
  async load(): Promise<HistoryItem[]> {
    const raw = await this.storage.read();
    this.items.length = 0;
    if (Array.isArray(raw)) {
      for (const u of raw) {
        if (!isHistoryItem(u)) continue;
        this.items.push({ expr: u.expr, value: u.value, at: u.at });
        if (this.items.length >= this.cap) break;
      }
    }
    return [...this.items];
  }

  /**
   * 记录一条：与最新条目 expr 相同 → 原位刷新（时间戳置顶，不新增）；
   * 否则插入队首并淘汰超限最旧。每次变更写回 storage（fire-and-forget，失败静默）。
   */
  record(expr: string, value: string): void {
    if (!expr) return;
    const at = Date.now();
    if (this.items.length > 0 && this.items[0].expr === expr) {
      this.items[0] = { expr, value, at };
    } else {
      this.items.unshift({ expr, value, at });
      if (this.items.length > this.cap) this.items.length = this.cap;
    }
    void Promise.resolve(this.storage.write([...this.items])).catch(() => {
      /* 持久化失败不影响会话内历史 */
    });
  }
}

function isHistoryItem(u: unknown): u is HistoryItem {
  if (typeof u !== 'object' || u === null) return false;
  const it = u as Partial<HistoryItem>;
  return (
    typeof it.expr === 'string' && typeof it.value === 'string' && typeof it.at === 'number' && Number.isFinite(it.at)
  );
}

/**
 * 浏览器历史存储：window.otools 存在且具备 local state API → 宿主插件本地状态
 * （键 'history'，plugin 传 undefined）；否则回退 localStorage('draftcalc-history')。
 * 读写失败均静默（不阻塞 UI）。
 */
export function createBrowserHistoryStorage(): HistoryStorage {
  const otools = typeof window !== 'undefined' ? window.otools : undefined;
  if (
    otools &&
    typeof otools.getPluginLocalStateValue === 'function' &&
    typeof otools.savePluginLocalStateValue === 'function'
  ) {
    return {
      read: () =>
        Promise.resolve()
          .then(() => otools.getPluginLocalStateValue<HistoryItem[] | null>(undefined, 'history'))
          .catch(() => null),
      write: (items) => {
        void Promise.resolve()
          .then(() => otools.savePluginLocalStateValue(undefined, 'history', items))
          .catch(() => {
            /* 持久化失败静默 */
          });
      },
    };
  }
  return {
    read: async () => {
      try {
        const s = window.localStorage.getItem(HISTORY_STORAGE_KEY);
        return s === null ? null : (JSON.parse(s) as HistoryItem[]);
      } catch {
        return null;
      }
    },
    write: async (items) => {
      try {
        window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items));
      } catch {
        /* 存储满/禁用 → 静默 */
      }
    },
  };
}

// ---------------------------------------------------------------- Mock 识别器

/** dev 调试：URL 参数 ?mock=1 强制 MockRecognizer。 */
function forceMockRecognizer(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('mock') === '1'
    );
  } catch {
    return false;
  }
}

/**
 * Mock 查表：按归一化图前景像素做 FNV 哈希，确定性伪随机取 3 个 CNN 标签
 * （概率降序、标签互异）。仅用于无模型时的 UI 链路调试 —— '='/'.'/fracbar 走
 * 几何规则不受影响，数字/运算符标签本身不保证正确。
 */
function mockTop3(img: Float32Array): { label: SymbolLabel; prob: number }[] {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < img.length; i++) {
    if (img[i] !== 0) h = ((h ^ (i + 1)) * 16777619) >>> 0;
  }
  const n = LABELS.length;
  const i1 = h % n;
  let i2 = (Math.floor(h / 7) + 3) % n;
  if (i2 === i1) i2 = (i2 + 1) % n;
  let i3 = (Math.floor(h / 65537) + 9) % n;
  if (i3 === i1 || i3 === i2) i3 = (i3 + 5) % n;
  if (i3 === i1 || i3 === i2) i3 = (i3 + 1) % n;
  return [
    { label: LABELS[i1], prob: 0.62 },
    { label: LABELS[i2], prob: 0.23 },
    { label: LABELS[i3], prob: 0.11 },
  ];
}

// ---------------------------------------------------------------- usePaper

/** usePaper 暴露面（Task 8 UI 契约 + CandidateBar/HistoryPanel 所需状态）。 */
export interface PaperApi {
  /** 各行状态（shallowRef，每次 Manager 变更后换新数组引用）。 */
  lines: Ref<LineState[]>;
  /** 识别引擎是否就绪（Mock 模式立即 true；Ort 模式 init resolve 后 true）。 */
  engineReady: Ref<boolean>;
  /** 横幅文案；null = 无横幅。仅由 init reject / '识别引擎未就绪' 前缀驱动。 */
  engineError: Ref<string | null>;
  /** 当前（最后操作的）行 id，CandidateBar 渲染该行 glyphs。 */
  activeLineId: Ref<number | null>;
  /** 历史条目（新→旧），HistoryPanel 渲染。 */
  history: Ref<HistoryItem[]>;
  addStroke(s: Stroke): void;
  undo(): void;
  eraseAt(pt: { x: number; y: number }, r: number): void;
  clearAll(): void;
  setAlt(lineId: number, glyphIndex: number, label: SymbolLabel): void;
  /** 复制最近一次 value 型结果串；成功返回 true。 */
  copyLastResult(): Promise<boolean>;
}

export function usePaper(): PaperApi {
  const lines = shallowRef<LineState[]>([]);
  const engineReady = ref(false);
  const engineError = ref<string | null>(null);
  const activeLineId = ref<number | null>(null);
  const history = ref<HistoryItem[]>([]);

  // ---- 历史存储：启动异步读回；读回完成前不入史（避免被 load 覆盖）----
  const store = new HistoryStore(createBrowserHistoryStorage());
  let historyLoaded = false;
  void store.load().then((items) => {
    historyLoaded = true;
    history.value = items;
  });

  // ---- 识别器装配（?mock=1 强制 Mock，dev 调试）----
  /** Ort 实例引用：Mock 模式为 null（rerunScheduler 用默认 queueMicrotask）。 */
  let ortRef: OrtRecognizer | null = null;
  if (forceMockRecognizer()) {
    setRecognizer(new MockRecognizer(mockTop3));
    engineReady.value = true;
  } else {
    const ort = new OrtRecognizer('./model/recog.onnx');
    ortRef = ort;
    void ort
      .init()
      .then(() => {
        setRecognizer(ort);
        engineReady.value = true;
        engineError.value = null; // 清掉 init 期间「未就绪」的暂态横幅
      })
      .catch(() => {
        // Review Focus 5：init 失败 → 横幅 + 保留手写（笔画照常记录渲染，识别静默失败）
        engineError.value = ENGINE_DOWN_MESSAGE;
      });
  }

  function syncLines(): void {
    if (manager === null) {
      lines.value = [];
      return;
    }
    lines.value = [...manager.lines];
    recordResults();
  }

  // ---- LineManager 惰性装配（晚期绑定 labelOverride，防 this 丢失）----
  let manager: LineManager | null = null;
  /** 已入史的行结果签名（行 id → `expr=value`），避免每次 sync 重复入史。 */
  const recordedSigs = new Map<number, string>();

  function ensureManager(firstStrokeHeightHint: number): LineManager {
    if (manager !== null) return manager;
    const hint = clampLineHeightHint(firstStrokeHeightHint);
    const pipeline = wrapPipeline(
      createPipeline(segmentClassify(), hint, (img) => manager?.labelOverride(img) ?? null),
    );
    manager =
      ortRef !== null
        ? new LineManager(pipeline, hint, (fn) => {
            // whenSettled 感知调度：热身推理全部结束后同拍重跑；重跑可能再次预热，
            // scheduler 会被 LineManager 再次调用形成链；finally 刷新 UI。
            void ortRef!.whenSettled().then(fn).finally(() => syncLines());
          })
        : new LineManager(pipeline, hint); // Mock：classify 全同步，默认 queueMicrotask 即可
    return manager;
  }

  /** pipeline 包装：故障错误按前缀驱动横幅（WarmupError 不匹配前缀，绝不进横幅），原样上抛。 */
  function wrapPipeline(inner: LinePipeline): LinePipeline {
    return {
      run(strokes: Stroke[]) {
        try {
          return inner.run(strokes);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.startsWith(ENGINE_DOWN_PREFIX)) engineError.value = ENGINE_DOWN_MESSAGE;
          throw e; // LineManager 依自身契约处理（Warmup → 调度重跑；故障 → 暂态）
        }
      },
    };
  }

  function clampLineHeightHint(h: number): number {
    if (!Number.isFinite(h) || h < MIN_LINE_HEIGHT_HINT) return DEFAULT_LINE_HEIGHT_HINT;
    return Math.min(MAX_LINE_HEIGHT_HINT, Math.round(h));
  }

  // ---- 动作 ----

  function addStroke(s: Stroke): void {
    const bb = bboxOf([s]);
    const mgr = ensureManager(bb.y1 - bb.y0);
    mgr.addStroke(s);
    touchActiveLine();
    syncLines();
  }

  function undo(): void {
    if (manager === null) return;
    manager.undo();
    touchActiveLine();
    syncLines();
  }

  function eraseAt(pt: { x: number; y: number }, r: number): void {
    if (manager === null) return;
    manager.eraseAt(pt, r);
    touchActiveLine();
    syncLines();
  }

  function clearAll(): void {
    recordedSigs.clear();
    if (manager === null) {
      lines.value = [];
      activeLineId.value = null;
      return;
    }
    manager.clear();
    activeLineId.value = null;
    syncLines();
  }

  function setAlt(lineId: number, glyphIndex: number, label: SymbolLabel): void {
    if (manager === null) return;
    manager.setAlt(lineId, glyphIndex, label);
    activeLineId.value = lineId;
    syncLines();
  }

  /** 最后操作的行 = 当前最后一行（add/undo/erase 都作用在尾部行）。 */
  function touchActiveLine(): void {
    const arr = manager?.lines ?? [];
    const last = arr[arr.length - 1];
    activeLineId.value = last !== undefined ? last.id : null;
  }

  // ---- 历史 ----

  /** done 行的 value/compare 结果入史（error 不入史；lhs 非空）；同一结果只记一次。 */
  function recordResults(): void {
    if (!historyLoaded || manager === null) return;
    let changed = false;
    for (const line of manager.lines) {
      if (line.status !== 'done') continue;
      const r = line.result;
      if (r === null || r.type === 'error') continue;
      const lhs = r.lhs.trim();
      if (lhs === '') continue;
      const expr = r.type === 'compare' ? `${lhs} = ${r.rhs}` : lhs;
      const value = r.type === 'compare' ? (r.match ? '✓' : '✗') : r.value;
      const sig = `${line.id}:${expr}=${value}`;
      if (recordedSigs.get(line.id) === sig) continue;
      recordedSigs.set(line.id, sig);
      store.record(expr, value);
      changed = true;
    }
    if (changed) history.value = [...store.items];
  }

  function lastResultValue(): string | null {
    for (const it of store.items) {
      if (it.value !== '✓' && it.value !== '✗') return it.value;
    }
    if (manager !== null) {
      for (let i = manager.lines.length - 1; i >= 0; i--) {
        const r = manager.lines[i].result;
        if (r !== null && r.type === 'value') return r.value;
      }
    }
    return null;
  }

  async function copyLastResult(): Promise<boolean> {
    const v = lastResultValue();
    if (v === null) return false;
    try {
      await navigator.clipboard.writeText(v);
      return true;
    } catch {
      return false;
    }
  }

  return {
    lines,
    engineReady,
    engineError,
    activeLineId,
    history,
    addStroke,
    undo,
    eraseAt,
    clearAll,
    setAlt,
    copyLastResult,
  };
}
