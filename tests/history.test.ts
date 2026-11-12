/**
 * Task 8：HistoryStore（最近算式历史）单元测试。
 *
 * 三条钉死断言：
 *   1. 连续重复 expr 去重（刷新时间戳置顶，不新增条目）；
 *   2. 历史上限 20 条，新条目置顶、超限淘汰最旧；
 *   3. 构造注入 storage：load 读回种子数据（损坏条目过滤），record 写回 storage。
 *
 * 组件不做快照测试（视觉验收在 Task 10 手测）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryStore, type HistoryItem, type HistoryStorage } from '../src/usePaper';

/** 内存 fake storage：记录每次 write 的副本，便于断言写回内容。 */
function memoryStorage(seed: HistoryItem[] | null = null): HistoryStorage & { writes: HistoryItem[][] } {
  let data = seed;
  const writes: HistoryItem[][] = [];
  return {
    writes,
    read: async () => (data === null ? null : data.map((it) => ({ ...it }))),
    write: async (items) => {
      writes.push(items.map((it) => ({ ...it })));
    },
  };
}

describe('HistoryStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('连续重复 expr 去重：刷新时间戳置顶，不新增条目；非连续重复不去重', () => {
    const store = new HistoryStore(memoryStorage());
    store.record('12+34', '46');
    vi.setSystemTime(new Date('2026-11-13T10:05:00Z'));
    store.record('12+34', '46');
    expect(store.items).toHaveLength(1);
    expect(store.items[0]).toEqual({ expr: '12+34', value: '46', at: Date.parse('2026-11-13T10:05:00Z') });
    // 中间隔了别的算式后再次出现：不去重
    store.record('5*6', '30');
    store.record('12+34', '46');
    expect(store.items.map((it) => it.expr)).toEqual(['12+34', '5*6', '12+34']);
  });

  it('历史最多保留 20 条：新条目置顶，超限淘汰最旧', () => {
    const store = new HistoryStore(memoryStorage());
    for (let i = 0; i < 25; i++) store.record(`expr-${i}`, String(i * 2));
    expect(store.items).toHaveLength(20);
    expect(store.items[0]).toEqual({ expr: 'expr-24', value: '48', at: Date.parse('2026-11-13T10:00:00Z') });
    expect(store.items[19].expr).toBe('expr-5');
  });

  it('注入 storage：load 读回种子数据（损坏条目过滤），record 写回 storage', async () => {
    const seed = [
      { expr: '1+1', value: '2', at: Date.parse('2026-11-13T09:00:00Z') },
      { expr: '损坏条目', value: 123, at: 'not-a-number' }, // 形状非法 → 读回时过滤
      { expr: '2+2', value: '4', at: Date.parse('2026-11-13T08:00:00Z') },
    ] as unknown as HistoryItem[];
    const storage = memoryStorage(seed);
    const store = new HistoryStore(storage);
    const loaded = await store.load();
    expect(loaded.map((it) => it.expr)).toEqual(['1+1', '2+2']);
    expect(storage.writes).toHaveLength(0); // load 只读不写
    store.record('3+3', '6');
    expect(storage.writes).toHaveLength(1);
    expect(storage.writes[0][0]).toEqual({ expr: '3+3', value: '6', at: Date.parse('2026-11-13T10:00:00Z') });
    expect(storage.writes[0].map((it) => it.expr)).toEqual(['3+3', '1+1', '2+2']);
  });
});
