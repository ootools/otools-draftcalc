/**
 * Task 4：识别器 recognize.ts 测试。
 *
 * 计划 Step 1 的三组断言 + segmentClassify 组合行为：
 *   ① LABELS 恰 17 项且顺序固定（= 模型输出维序，public/model/recog.onnx 按此训练）
 *   ② MockRecognizer：注入查表（函数 / Map）返回按 prob 降序候选；空表违反契约抛错
 *   ③ OrtRecognizer.init：node 环境下（wasm session 无法创建 / 模型不可达）
 *      reject 且 message 以 '识别引擎未就绪：' 开头并带原始错误摘要（Review Focus 5）
 *   ④ segmentClassify：未设置识别器 → 抛 '识别引擎未就绪'；
 *      已设置 → normalizeGlyph 图直通当前识别器并返回候选
 */
import { afterEach, describe, it, expect } from 'vitest';
import {
  LABELS,
  MockRecognizer,
  OrtRecognizer,
  WarmupError,
  segmentClassify,
  setRecognizer,
} from '../src/core/recognize';
import { normalizeGlyph } from '../src/core/strokes';
import type { SymbolLabel } from '../src/core/types';
import { hLine } from './helpers/synth';

/** 模型输出维序（Global Constraints：17 类，顺序钉死）。 */
const EXPECTED_LABELS: readonly SymbolLabel[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '+', '-', '*', '/', '(', ')', 'sqrt',
];

afterEach(() => {
  // 模块级当前识别器不得跨用例泄漏
  setRecognizer(null);
});

describe('LABELS', () => {
  it('恰 17 项且顺序与模型输出维序完全一致', () => {
    expect(LABELS).toHaveLength(17);
    expect([...LABELS]).toEqual([...EXPECTED_LABELS]);
    // 不含几何规则标签（'.'/'='/'fracbar' 不进 CNN）
    expect(LABELS).not.toContain('.');
    expect(LABELS).not.toContain('=');
    expect(LABELS).not.toContain('fracbar');
  });
});

describe('MockRecognizer', () => {
  it('函数查表：返回按 prob 降序排列的候选（注入乱序表也被排序）', () => {
    const mock = new MockRecognizer(() => [
      { label: '7', prob: 0.12 },
      { label: '1', prob: 0.8 },
      { label: '9', prob: 0.05 },
    ]);
    const out = mock.classify(new Float32Array(784));
    expect(out.map((c) => c.label)).toEqual(['1', '7', '9']);
    expect(out.map((c) => c.prob)).toEqual([0.8, 0.12, 0.05]);
  });

  it('函数查表收到的 img 与传入引用一致（直通不拷贝）', () => {
    const img = new Float32Array(784);
    img[100] = 1;
    let received: Float32Array | null = null;
    const mock = new MockRecognizer((x) => {
      received = x;
      return [{ label: '5', prob: 0.9 }];
    });
    mock.classify(img);
    expect(received).toBe(img);
  });

  it('Map 查表：按图引用命中候选；未命中抛错', () => {
    const img = new Float32Array(784);
    img[0] = 1;
    const table = new Map<Float32Array, { label: SymbolLabel; prob: number }[]>([
      [img, [{ label: '3', prob: 0.2 }, { label: '8', prob: 0.7 }]],
    ]);
    const mock = new MockRecognizer(table);
    expect(mock.classify(img).map((c) => c.label)).toEqual(['8', '3']);
    expect(() => mock.classify(new Float32Array(784))).toThrow();
  });

  it('查表返回空数组 → 抛错（ClassifyFn 契约：必返回 ≥1 项）', () => {
    const mock = new MockRecognizer(() => []);
    expect(() => mock.classify(new Float32Array(784))).toThrow(/至少 1 项/);
  });
});

describe('OrtRecognizer', () => {
  it('node 环境下坏模型路径 init() 必 reject，message 以 "识别引擎未就绪：" 开头且带原始错误摘要', async () => {
    const rec = new OrtRecognizer('/bad/recog.onnx');
    const err: Error = await rec.init().then(
      () => {
        throw new Error('init 应当 reject');
      },
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.message.startsWith('识别引擎未就绪：')).toBe(true);
    // 必须带原始错误摘要（不允许吞掉根因）
    expect(err.message.length).toBeGreaterThan('识别引擎未就绪：'.length);
  });

  it('init 未完成/失败时 classify 同步抛 "识别引擎未就绪"', () => {
    const rec = new OrtRecognizer('/bad/recog.onnx');
    expect(() => rec.classify(new Float32Array(784))).toThrow(/识别引擎未就绪/);
  });
});

describe('OrtRecognizer 预热与缓存（注入假 session；node 下无法创建真实 wasm 会话）', () => {
  /** 17 维 logits：'5' 最强、'3' 次之、'8' 第三 → softmax top-3 确定性。 */
  function logits538(): Float32Array {
    const d = new Float32Array(17);
    d[5] = 3;
    d[3] = 2;
    d[8] = 1;
    return d;
  }

  type FakeSession = {
    inputNames: string[];
    outputNames: string[];
    run: () => Promise<Record<string, { data: Float32Array }>>;
  };

  /** 测试缝：向私有 session 字段注入假会话（绕过 node 不可用的 wasm 初始化）。 */
  function injectSession(rec: OrtRecognizer, run: FakeSession['run']): void {
    (rec as unknown as { session: FakeSession }).session = {
      inputNames: ['input'],
      outputNames: ['logits'],
      run,
    };
  }

  function warmImg(): Float32Array {
    const img = new Float32Array(784);
    img[10] = 1;
    return img;
  }

  it('首见图 classify 抛 WarmupError，前缀 "识别预热中："，区别于 "识别引擎未就绪"；热身后同图命中', async () => {
    const rec = new OrtRecognizer();
    injectSession(rec, async () => ({ logits: { data: logits538() } }));
    const img = warmImg();

    let err: unknown;
    try {
      rec.classify(img);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(WarmupError);
    expect((err as Error).message.startsWith('识别预热中：')).toBe(true);
    // 预热错不得携带故障前缀（T8 横幅的唯一判别信号）
    expect((err as Error).message.includes('识别引擎未就绪')).toBe(false);

    await rec.whenSettled(); // 等热身完成
    expect(rec.classify(img).map((c) => c.label)).toEqual(['5', '3', '8']);
  });

  it('whenSettled：pending 推理未结束前不 resolve，结束后才 resolve；无 pending 时立即 resolve', async () => {
    const rec = new OrtRecognizer();
    await rec.whenSettled(); // 无 pending → 立即返回

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    injectSession(rec, async () => {
      await gate;
      return { logits: { data: logits538() } };
    });
    const img = warmImg();
    expect(() => rec.classify(img)).toThrow(WarmupError); // 首见图 → 触发热身

    let settled = false;
    const waiting = rec.whenSettled().then(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 0)); // 冲刷微任务：推理仍被门控
    expect(settled).toBe(false);

    release();
    await waiting; // resolve 时机 = 无 pending 后台推理
    expect(settled).toBe(true);
    expect(rec.classify(img).map((c) => c.label)).toEqual(['5', '3', '8']);
  });

  it('缓存命中返回副本：调用方原地修改返回值不影响后续同图调用', async () => {
    const rec = new OrtRecognizer();
    injectSession(rec, async () => ({ logits: { data: logits538() } }));
    const img = warmImg();
    await rec.classifyAsync(img);

    const first = rec.classify(img);
    expect(first.map((c) => c.label)).toEqual(['5', '3', '8']);
    first.reverse();
    first.push({ label: '0', prob: 1 });

    const second = rec.classify(img);
    expect(second).not.toBe(first);
    expect(second.map((c) => c.label)).toEqual(['5', '3', '8']);
    expect(second).toHaveLength(3);

    // classifyAsync 命中/出栈路径同样返回副本
    const third = await rec.classifyAsync(img);
    third.reverse();
    expect(rec.classify(img).map((c) => c.label)).toEqual(['5', '3', '8']);
  });
});

describe('segmentClassify', () => {
  it('未设置识别器时抛 "识别引擎未就绪"（不静默降级）', () => {
    const classify = segmentClassify();
    expect(() => classify(new Float32Array(784))).toThrow(/识别引擎未就绪/);
  });

  it('设置 MockRecognizer 后：归一化图直通当前识别器，返回其候选', () => {
    // 用真实 normalizeGlyph 产图，保证与 segment 管线输入形态一致
    const strokes = [hLine(2, 14, 20)];
    const img = normalizeGlyph({
      strokes,
      bbox: { x0: 2, y0: 20, x1: 14, y1: 20 },
    });
    const seen: Float32Array[] = [];
    setRecognizer(
      new MockRecognizer((x) => {
        seen.push(x);
        return [
          { label: '1', prob: 0.75 },
          { label: '7', prob: 0.2 },
          { label: '/', prob: 0.05 },
        ];
      }),
    );
    const out = segmentClassify()(img);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(img);
    expect(out.map((c) => c.label)).toEqual(['1', '7', '/']);
  });

  it('setRecognizer(null) 后再次抛 "识别引擎未就绪"（Mock→Ort 切换语义可逆）', () => {
    setRecognizer(new MockRecognizer(() => [{ label: '5', prob: 0.9 }]));
    expect(segmentClassify()(new Float32Array(784))[0].label).toBe('5');
    setRecognizer(null);
    expect(() => segmentClassify()(new Float32Array(784))).toThrow(/识别引擎未就绪/);
  });
});
