<template>
  <div class="history-panel">
    <div class="history-head">
      <span class="title">最近算式</span>
      <span v-if="copiedExpr !== null" class="copied-hint">已复制 {{ copiedExpr }}</span>
      <button class="close" type="button" @click="emit('close')">关闭</button>
    </div>
    <div v-if="props.items.length === 0" class="history-empty">还没有算式结果</div>
    <ul v-else class="history-list">
      <li
        v-for="(it, idx) in props.items"
        :key="`${it.at}-${idx}`"
        class="history-item"
        :title="`点击复制 ${it.value}`"
        @click="onCopy(it)"
      >
        <span class="expr">{{ it.expr }}</span>
        <span class="eq">=</span>
        <span class="value" :class="valueCls(it.value)">{{ it.value }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * Task 8：历史面板 —— 最近 20 条「expr = value」列表（compare 条目 value 为 ✓/✗），
 * 点击条目复制 value 串。
 */
import { onBeforeUnmount, ref } from 'vue';
import type { HistoryItem } from '../usePaper';

const props = defineProps<{
  items: HistoryItem[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const copiedExpr = ref<string | null>(null);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

function valueCls(v: string): string {
  if (v === '✓') return 'ok';
  if (v === '✗') return 'bad';
  return '';
}

async function onCopy(it: HistoryItem): Promise<void> {
  try {
    await navigator.clipboard.writeText(it.value);
    copiedExpr.value = it.value;
    if (copyTimer !== null) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copiedExpr.value = null;
    }, 1200);
  } catch {
    /* 剪贴板不可用 → 静默 */
  }
}

onBeforeUnmount(() => {
  if (copyTimer !== null) clearTimeout(copyTimer);
});
</script>

<style scoped>
.history-panel {
  position: absolute;
  top: 56px;
  right: 12px;
  z-index: 35;
  width: 320px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(4px);
  border-radius: 12px;
  box-shadow: 0 4px 18px rgba(31, 41, 55, 0.2);
}
.history-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.history-head .title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.history-head .copied-hint {
  font-size: 12px;
  color: #16a34a;
}
.history-head .close {
  margin-left: auto;
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 13px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.history-head .close:hover {
  background: rgba(31, 41, 55, 0.06);
}
.history-empty {
  font-size: 13px;
  color: #9ca3af;
  padding: 10px 2px;
}
.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.history-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 4px;
  border-bottom: 1px dashed #e5e7eb;
  cursor: pointer;
  font-family: 'Times New Roman', 'STIX Two Math', Georgia, serif;
  font-size: 15px;
}
.history-item:last-child {
  border-bottom: none;
}
.history-item:hover {
  background: rgba(29, 78, 216, 0.06);
}
.history-item .expr {
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-item .eq {
  color: #9ca3af;
}
.history-item .value {
  font-weight: 600;
  color: #1f2937;
}
.history-item .value.ok {
  color: #16a34a;
}
.history-item .value.bad {
  color: #dc2626;
}
</style>
