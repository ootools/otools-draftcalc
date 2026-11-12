<template>
  <div v-if="chips().length > 0" class="candidate-bar">
    <span class="bar-label">识别</span>
    <button
      v-for="(c, i) in chips()"
      :key="`${c.lineId}-${c.index}-${c.label}`"
      class="chip"
      type="button"
      :title="`第 ${c.index + 1} 个符号：${c.text}（点击切换候选，纠正后即时重算）`"
      @click="onChip(c)"
    >
      {{ c.text }}
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * Task 8：候选纠正条 —— 当前（最后操作的）行 glyphs 渲染为文本 chip 序列。
 * label 直显（'fracbar' → '—'、'sqrt' → '√'）；点击 chip 循环该 glyph 的 alts
 * （含当前 label），调 setAlt(lineId, glyphIndex, newLabel)。行 done 后 chip 仍可点
 * （LineManager.setAlt 纠正后即时重算）。
 *
 * 响应式注意：LineManager 原地变更 LineState（同一对象引用），若把行对象作为 prop
 * 传入，props 浅相等会让子组件跳过重渲染（chip 永远停在旧状态）。因此本组件接收
 * lines 数组（usePaper 每次 sync 换新数组引用）+ activeLineId，chips() 为渲染期
 * 普通函数 —— render effect 直接追踪 props.lines 的身份变化，每次 sync 必然重渲染。
 */
import type { LineState } from '../core/lines';
import type { SymbolLabel } from '../core/types';

const props = defineProps<{
  /** 各行状态（每次 sync 为新数组引用）。 */
  lines: LineState[];
  /** 当前（最后操作的）行 id；null 时不渲染。 */
  activeLineId: number | null;
  setAlt: (lineId: number, glyphIndex: number, label: SymbolLabel) => void;
}>();

interface Chip {
  lineId: number;
  /** glyph 在行内的下标（setAlt 的 glyphIndex；key 用它 + label，见模板注释）。 */
  index: number;
  label: SymbolLabel;
  text: string;
}

function chipText(label: SymbolLabel): string {
  if (label === 'fracbar') return '—';
  if (label === 'sqrt') return '√';
  return label;
}

/** 渲染期推导（非 computed：computed 对同一行对象引用不会触发下游）。 */
function chips(): Chip[] {
  const line = props.lines.find((l) => l.id === props.activeLineId);
  if (!line) return [];
  return line.glyphs.map((g, i) => ({ lineId: line.id, index: i, label: g.label, text: chipText(g.label) }));
}

/** 点击 chip：现取该 glyph 的最新 alts 循环到下一个，调 setAlt 纠正。 */
function onChip(c: Chip): void {
  const line = props.lines.find((l) => l.id === c.lineId);
  const g = line?.glyphs[c.index];
  if (!g) return;
  const alts = g.alts.length > 0 ? g.alts : [g.label];
  const idx = alts.indexOf(g.label);
  const next = alts[(idx + 1) % alts.length];
  if (next !== g.label) props.setAlt(c.lineId, c.index, next);
}
</script>

<style scoped>
.candidate-bar {
  position: fixed;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  max-width: min(94vw, 880px);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(4px);
  border-radius: 14px;
  box-shadow: 0 2px 12px rgba(31, 41, 55, 0.18);
}
.bar-label {
  font-size: 12px;
  color: #6b7280;
  margin-right: 2px;
}
.chip {
  min-width: 36px;
  padding: 4px 9px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #ffffff;
  font-family: 'Times New Roman', 'STIX Two Math', Georgia, serif;
  font-size: 17px;
  line-height: 1.2;
  color: #111827;
  cursor: pointer;
}
.chip:hover {
  border-color: #1d4ed8;
  color: #1d4ed8;
}
</style>
