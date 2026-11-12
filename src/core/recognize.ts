/**
 * 识别器：LABELS 维序 + Recognizer 接口 + Mock/ONNX 两个实现 + segmentClassify 组合。
 *
 * LABELS 是 CNN 输出向量第 i 维到符号的映射表（public/model/recog.onnx 按此维序训练，
 * Task 9 训练脚本与导出均以本顺序为准），顺序钉死不得改动。
 *
 * 关于同步 classify 与异步 ORT 推理（重要设计说明）：
 *   Recognizer.classify / ClassifyFn（segment.ts 钉死）都是同步契约，而 onnxruntime-web
 *   的 session.run 只有异步 API，一次推理的结果无法在同一次同步调用内取出。
 *   OrtRecognizer 的取舍：
 *   - classify(img) 按「图内容 → 已完成结果」缓存同步返回；同图重复识别（T7 渐进书写
 *     下每笔重跑整行，未变化符号的归一化图逐位相同）全部缓存命中、纯同步；
 *   - 首次见到某图时同步触发后台推理（结果就绪即入缓存）并抛出 WarmupError
 *     （message 以 '识别预热中：' 开头）—— 绝不返回错位/过期候选（反目标：静默给错答案）；
 *     T7 捕获后可 await whenSettled() 等热身完成、当拍内重跑同图（缓存即命中）；
 *   - 需要一次性拿到结果时用 await classifyAsync(img)（T8 可先预热再跑同步管线）。
 *
 *   错误前缀契约（T8 横幅唯一判别信号，不得混用）：
 *   - '识别引擎未就绪：' —— 仅由故障路径抛出：init 失败 / 未 init / 无会话 /
 *     运行中推理失败（classifyAsync 的 awaiter 收到）→ 渲染「识别引擎未就绪」横幅；
 *   - '识别预热中：' —— 仅由首见图热身抛出（WarmupError，非故障，可 whenSettled 自愈）。
 *   运行期故障留痕：classify() 触发的后台推理 fire-and-forget（awaiter 可能无人
 *   消费），故障摘要同步记入 OrtRecognizer.lastError（成功推理清 null）—— T8 在
 *   whenSettled 调度的 finally 里轮询它补发横幅，杜绝「持续故障但用户无感知」。
 */
import type { InferenceSession } from 'onnxruntime-web';
import type { ClassifyFn } from './segment';
import type { SymbolLabel } from './types';

/** CNN 17 类，模型输出维序（Global Constraints）。'.'/'='/'fracbar' 走几何规则不进 CNN。 */
type CNNLabel = Exclude<SymbolLabel, '.' | '=' | 'fracbar'>;

const CNN_LABELS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '+', '-', '*', '/', '(', ')', 'sqrt',
] as const satisfies readonly CNNLabel[];

/** 模型输出维序表：logits 第 i 维对应 LABELS[i]。 */
export const LABELS: readonly SymbolLabel[] = CNN_LABELS;

/** 单个候选：与 segment.ts 的 ClassifyFn 返回项结构一致。 */
interface Candidate { label: SymbolLabel; prob: number }

/** 识别器契约：输入 normalizeGlyph 产出的 784 维归一化图，返回按 prob 降序候选（≥1 项）。 */
export interface Recognizer {
  classify(img: Float32Array): { label: SymbolLabel; prob: number }[];
}

/** MockRecognizer 查表：函数形式（任意 img → 候选）或 Map 形式（按图引用命中）。 */
export type MockTable =
  | ((img: Float32Array) => { label: SymbolLabel; prob: number }[])
  | Map<Float32Array, { label: SymbolLabel; prob: number }[]>;

/**
 * 测试/调试用识别器：构造注入查表，输出按 prob 降序。
 * 查表返回空候选视为违反 ClassifyFn 契约（≥1 项），抛错而非静默降级。
 */
export class MockRecognizer implements Recognizer {
  private readonly table: MockTable;

  constructor(table: MockTable) {
    this.table = table;
  }

  classify(img: Float32Array): Candidate[] {
    let raw: Candidate[] | undefined;
    if (typeof this.table === 'function') {
      raw = this.table(img);
    } else {
      // Map 形式按图引用命中（Float32Array 引用相等），未命中抛错
      raw = this.table.get(img);
      if (!raw) throw new Error('MockRecognizer 查表未命中（Map 按图引用匹配）');
    }
    if (!raw || raw.length === 0) {
      throw new Error('MockRecognizer 查表返回空候选（契约要求至少 1 项）');
    }
    return [...raw].sort((a, b) => b.prob - a.prob);
  }
}

/**
 * 首见图热身错误：classify 触发的后台推理尚未完成、缓存未命中，非故障。
 * 与故障前缀 '识别引擎未就绪：' 严格区分（T8 横幅判别依赖）；
 * T7 可 instanceof 判断或匹配 message 前缀 '识别预热中：'，然后 await whenSettled() 重跑。
 */
export class WarmupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WarmupError';
  }
}

/**
 * ONNX 识别器：onnxruntime-web wasm CPU 后端，模型 [1,1,28,28]→[1,17] logits。
 * init() 完成（resolve）后才可识别；init 失败统一抛 '识别引擎未就绪：…'（Review Focus 5）。
 */
export class OrtRecognizer implements Recognizer {
  private readonly modelUrl: string;
  private session: InferenceSession | null = null;
  /** 图内容 key（img.join(',')，二值图 784 字符）→ 已完成的 top-3 候选。 */
  private readonly cache = new Map<string, Candidate[]>();
  /** 去重同图的并发推理。 */
  private readonly pending = new Map<string, Promise<Candidate[]>>();
  /** 最近一次推理故障摘要（'识别引擎未就绪：…'）；成功推理即清 null（lastError 的底层存储）。 */
  private lastErrorReason: string | null = null;

  /**
   * 只读视图：最近一次推理故障摘要。后台推理经 classify() 触发后 fire-and-forget
   * （T7 捕获 WarmupError 调度重跑；重试触顶后行停在 writing，失败详情无人消费）——
   * T8 靠轮询本字段补发「识别引擎未就绪」横幅（反目标：识别错误不得静默）。
   * 语义与 init 故障一致：非 null 即引擎持续故障；成功推理后归 null（自愈）。
   */
  get lastError(): string | null {
    return this.lastErrorReason;
  }

  constructor(modelUrl: string = './model/recog.onnx') {
    this.modelUrl = modelUrl;
  }

  /** 动态加载 onnxruntime-web 并创建 wasm 会话；任何失败都收敛为 '识别引擎未就绪：…'。 */
  async init(): Promise<void> {
    try {
      const ort = await import('onnxruntime-web');
      // wasm 资产目录：Task 10 把 onnxruntime-web/dist/*.wasm 拷到 dist/ort/
      ort.env.wasm.wasmPaths = './ort/';
      // 已定决策「精简单线程版」：单线程无需 SharedArrayBuffer/crossOriginIsolated
      ort.env.wasm.numThreads = 1;
      this.session = await ort.InferenceSession.create(this.modelUrl, {
        executionProviders: ['wasm'],
      });
    } catch (e) {
      this.session = null;
      throw new Error(`识别引擎未就绪：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * 同步识别：缓存命中（同图已推理过）直接返回 top-3 副本；
   * 未命中则触发后台预热并抛 WarmupError（'识别预热中：…'，非故障 —— 契约见文件头）。
   */
  classify(img: Float32Array): Candidate[] {
    if (!this.session) {
      throw new Error('识别引擎未就绪：请先 await ort.init() 且成功后再识别');
    }
    const key = imgKey(img);
    const cached = this.cache.get(key);
    if (cached) return [...cached]; // 副本：防上游原地排序污染缓存（与 MockRecognizer 一致）
    void this.classifyAsync(img).catch(() => {/* 失败经 classifyAsync 的 awaiter 抛出 */});
    throw new WarmupError(
      '识别预热中：该图首次识别，后台推理进行中（await whenSettled() 后重跑同图即命中缓存）',
    );
  }

  /**
   * 等待全部后台预热推理结束：resolve 时无 pending 后台推理（T7 捕获 WarmupError 后
   * 当拍 await 本方法再重跑，缓存即命中）。等待期间新触发的预热会继续等待；
   * 单个推理失败不使本方法 reject（失败详情由 classifyAsync 的 awaiter 获得）。
   */
  async whenSettled(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending.values()]);
    }
  }

  /** 异步识别：softmax 后按 prob 降序取 top-3（返回副本，缓存数组不外泄）；同图并发去重。 */
  async classifyAsync(img: Float32Array): Promise<Candidate[]> {
    if (!this.session) {
      throw new Error('识别引擎未就绪：请先 await ort.init() 且成功后再识别');
    }
    const key = imgKey(img);
    const cached = this.cache.get(key);
    if (cached) return [...cached];
    const inflight = this.pending.get(key);
    if (inflight) return inflight;

    const task = (async () => {
      const session = this.session;
      if (!session) {
        this.lastErrorReason = '识别引擎未就绪：会话已释放';
        throw new Error(this.lastErrorReason);
      }
      if (img.length !== 784) {
        this.lastErrorReason = `识别引擎未就绪：输入图必须为 28×28=784，收到 ${img.length}`;
        throw new Error(this.lastErrorReason);
      }
      try {
        const ort = await import('onnxruntime-web');
        const input = new ort.Tensor('float32', img, [1, 1, 28, 28]);
        const feeds: InferenceSession.FeedsType = { [session.inputNames[0]]: input };
        const results: InferenceSession.ReturnType = await session.run(feeds);
        const out = results[session.outputNames[0]];
        const data = out.data;
        if (!(data instanceof Float32Array) || data.length < LABELS.length) {
          throw new Error(
            `识别引擎未就绪：模型输出类型/维度不符（期望 float32[1,${LABELS.length}]）`,
          );
        }
        const top = softmaxTop3(data);
        this.cache.set(key, top);
        this.lastErrorReason = null; // 成功推理：清除故障（自愈语义）
        return [...top]; // 返回副本：缓存数组不外泄（与 classify/classifyAsync 命中路径一致）
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.lastErrorReason = `识别引擎未就绪：${msg}`; // fire-and-forget 失败详情在此留痕（T8 轮询）
        throw new Error(`识别引擎未就绪：${msg}`);
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, task);
    return task;
  }
}

/** 图内容 key：normalizeGlyph 产出为 0/1 二值图，join(',') 结果唯一且不可歧义。 */
function imgKey(img: Float32Array): string {
  return img.join(',');
}

/** 17 维 logits → max 减除 softmax → 按 prob 降序 top-3，label 映射 LABELS[i]。 */
function softmaxTop3(logits: Float32Array): Candidate[] {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] > max) max = logits[i];
  }
  const probs = new Array<number>(LABELS.length);
  let sum = 0;
  for (let i = 0; i < LABELS.length; i++) {
    const p = Math.exp(logits[i] - max);
    probs[i] = p;
    sum += p;
  }
  return probs
    .map((p, i) => ({ label: LABELS[i], prob: p / sum }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 3);
}

// ---------------------------------------------------------------------------
// segmentClassify：normalizeGlyph（由 segmentGlyphs 调用方施加）→ 当前识别器 的组合。
// 当前识别器为模块级单例（最简方案）：OrtRecognizer 与 MockRecognizer 是互斥的
// 全局引擎（T8 engineReady 后切换），无需多实例并存，故不做 per-闭包绑定。
// segmentClassify() 返回的闭包每次调用都读取最新 currentRecognizer，
// 因此 Mock→Ort 切换后无需重建流水线闭包。
// ---------------------------------------------------------------------------

let currentRecognizer: Recognizer | null = null;

/** 设置当前识别器（传 null 撤销，恢复「未就绪」语义）。 */
export function setRecognizer(r: Recognizer | null): void {
  currentRecognizer = r;
}

/** 便捷组合：供 segmentGlyphs(strokes, segmentClassify(), lineHeight)（Task 7/8）。 */
export function segmentClassify(): ClassifyFn {
  return (img) => {
    const r = currentRecognizer;
    if (!r) {
      throw new Error(
        '识别引擎未就绪：尚未设置识别器（await OrtRecognizer.init() 或 setRecognizer(MockRecognizer)）',
      );
    }
    return r.classify(img);
  };
}
