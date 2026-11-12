<template>
  <div class="toolbar">
    <button class="btn" type="button" title="撤销最后一笔" @click="props.undo()">撤销</button>
    <button
      class="btn"
      type="button"
      :class="{ active: props.eraseMode }"
      :title="props.eraseMode ? '关闭橡皮（拖动擦除笔迹）' : '橡皮（拖动擦除笔迹）'"
      @click="emit('update:eraseMode', !props.eraseMode)"
    >
      橡皮
    </button>
    <button class="btn" type="button" title="清空整张稿纸" @click="onClear">清空</button>
    <button
      class="btn"
      type="button"
      :class="{ copied: copied }"
      :title="copied ? '已复制' : '复制最近一次计算结果'"
      @click="onCopy"
    >
      {{ copied ? '已复制' : copyFailed ? '复制失败' : '复制最近结果' }}
    </button>
    <button
      class="btn"
      type="button"
      :class="{ active: props.historyOpen }"
      title="最近算式历史"
      @click="emit('update:historyOpen', !props.historyOpen)"
    >
      历史
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * Task 8：悬浮工具条 —— 撤销 / 橡皮（切换 eraseMode）/ 清空（confirm 后）/ 复制最近结果
 * （成功后按钮短暂变「已复制」）/ 历史（开合 HistoryPanel）。
 * 清空确认：优先 window.otools.dialog.confirm（宿主异步对话框），回退 window.confirm。
 */
import { onBeforeUnmount, ref } from 'vue';

const props = defineProps<{
  eraseMode: boolean;
  historyOpen: boolean;
  undo: () => void;
  clear: () => void;
  copy: () => Promise<boolean>;
}>();

const emit = defineEmits<{
  (e: 'update:eraseMode', v: boolean): void;
  (e: 'update:historyOpen', v: boolean): void;
}>();

const copied = ref(false);
const copyFailed = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

function flashCopy(ok: boolean): void {
  copied.value = ok;
  copyFailed.value = !ok;
  if (copyTimer !== null) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copied.value = false;
    copyFailed.value = false;
  }, 1200);
}

async function onCopy(): Promise<void> {
  flashCopy(await props.copy());
}
onBeforeUnmount(() => {
  if (copyTimer !== null) clearTimeout(copyTimer);
});

async function confirmClear(): Promise<boolean> {
  const otools = typeof window !== 'undefined' ? window.otools : undefined;
  if (otools?.dialog && typeof otools.dialog.confirm === 'function') {
    try {
      return await otools.dialog.confirm('清空整张稿纸？此操作不可撤销。');
    } catch {
      /* 宿主对话框失败 → 回退 window.confirm */
    }
  }
  try {
    return window.confirm('清空整张稿纸？此操作不可撤销。');
  } catch {
    return false;
  }
}

async function onClear(): Promise<void> {
  if (!(await confirmClear())) return;
  props.clear();
}
</script>

<style scoped>
.toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(4px);
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(31, 41, 55, 0.16);
}
.btn {
  border: none;
  background: transparent;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 14px;
  color: #1f2937;
  cursor: pointer;
  white-space: nowrap;
}
.btn:hover {
  background: rgba(29, 78, 216, 0.08);
}
.btn.active {
  background: #1d4ed8;
  color: #ffffff;
}
.btn.copied {
  color: #16a34a;
  font-weight: 600;
}
</style>
