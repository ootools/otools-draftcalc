<template>
  <div class="paper-wrap">
    <!-- 滚动层：方格稿纸背景（20px 格，CSS repeating-linear-gradient）+ 结果 overlay（随行滚动） -->
    <div
      ref="scrollEl"
      class="paper-scroll"
      :class="{ erasing: eraseMode }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
    >
      <div class="paper-content" :style="{ height: contentHeight + 'px' }">
        <div class="result-overlay">
          <div
            v-for="m in resultMarks"
            :key="m.key"
            class="result-mark"
            :style="{ left: m.x + 'px', top: m.y + 'px', fontSize: m.fontSize + 'px' }"
          >
            <span class="mark" :class="m.cls">{{ m.mark }}</span>
            <span v-if="m.gray !== null" class="rhs-gray">{{ m.gray }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 笔迹层：视口大小 canvas（不随内容增高，滚动时按偏移重绘，纵向无限高不爆内存） -->
    <canvas ref="canvasEl" class="paper-canvas"></canvas>

    <!-- 不滚动 overlay：空态提示 / 橡皮光标 -->
    <div class="canvas-overlay">
      <div v-if="lines.length === 0" class="empty-hint">在稿纸上写算式，写 = 自动计算</div>
      <div
        v-if="eraseMode && eraserVisible"
        class="eraser"
        :style="{ left: eraserX + 'px', top: eraserY + 'px' }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Task 8：稿纸画布 —— 笔迹采集（pointer events + coalesced）、二次贝塞尔平滑渲染、
 * 结果 DOM overlay（value 红字在 '=' 右侧；compare 在 rhs 尾部 ✓/✗ + rhs 淡灰小字）。
 *
 * 坐标系：笔画/结果以「内容坐标」存取（随滚动移动）；canvas 固定为视口大小，
 * 绘制时按 scrollTop 平移（ctx.translate(0, -scrollTop)），滚动容器纵向无限高
 * 而背板内存恒定。橡皮模式下指针为圆形橡皮（跟随圆 + cursor:none），
 * pointerdown/move 持续调 eraseAt(pt, 20)。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { LineState } from '../core/lines';
import type { Glyph, Pt, Stroke } from '../core/types';

const props = defineProps<{
  /** 各行状态（内容坐标）。 */
  lines: LineState[];
  /** 橡皮模式：指针变圆形橡皮，拖动擦除。 */
  eraseMode: boolean;
  addStroke: (s: Stroke) => void;
  eraseAt: (pt: { x: number; y: number }, r: number) => void;
}>();

// ---- 视觉常量（Task 8 钉死）----
const PEN_COLOR = '#1d4ed8';
const PEN_WIDTH = 2.5;
const ERASE_RADIUS = 20;
const BOTTOM_MARGIN = 320; // 最后一行下方预留的可书写空白

const scrollEl = ref<HTMLDivElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const viewportH = ref(600);
const eraserVisible = ref(false);
const eraserX = ref(0);
const eraserY = ref(0);

// ---- 笔画采集状态（非响应式：只在 redraw 手动触发）----
let activePts: Pt[] = [];
let activePointerId: number | null = null;
let drawing = false;
let erasing = false;
let nextStrokeId = 1;
let dpr = 1;
let ro: ResizeObserver | null = null;

// ---- 内容高度：覆盖所有笔迹 + 底部余量，最低一屏 ----
const maxY = computed(() => {
  let m = 0;
  for (const line of props.lines) {
    for (const st of line.strokes) {
      for (const p of st.pts) if (p.y > m) m = p.y;
    }
  }
  return m;
});
const contentHeight = computed(() => Math.max(viewportH.value, maxY.value + BOTTOM_MARGIN));

// ---- 结果 overlay 标记（done 行；随行滚动）----
interface ResultMark {
  key: string;
  x: number;
  y: number;
  mark: string;
  cls: string;
  gray: string | null;
  fontSize: number;
}

/** 行内第一个 '=' glyph（bbox.x0 最小，与 parseEquation/lines.ts 语义一致）。 */
function firstEqGlyph(glyphs: Glyph[]): Glyph | null {
  let best: Glyph | null = null;
  for (const g of glyphs) {
    if (g.label !== '=') continue;
    if (best === null || g.bbox.x0 < best.bbox.x0) best = g;
  }
  return best;
}

const resultMarks = computed<ResultMark[]>(() => {
  const marks: ResultMark[] = [];
  for (const line of props.lines) {
    if (line.status !== 'done' || line.result === null) continue;
    const r = line.result;
    if (r.type === 'error') continue;
    const eq = firstEqGlyph(line.glyphs);
    if (eq === null) continue;
    const eqH = Math.max(14, eq.bbox.y1 - eq.bbox.y0);
    const fontSize = Math.max(18, Math.round(eqH * 1.1));
    const yMid = (eq.bbox.y0 + eq.bbox.y1) / 2;
    if (r.type === 'value') {
      marks.push({ key: `v-${line.id}`, x: eq.bbox.x1 + 10, y: yMid, mark: r.value, cls: 'val', gray: null, fontSize });
    } else {
      // compare：rhs 尾部（'=' 右侧 glyph 的最大 x1）
      let tail = eq.bbox.x1;
      for (const g of line.glyphs) {
        if (g.bbox.x0 > eq.bbox.x1 && g.bbox.x1 > tail) tail = g.bbox.x1;
      }
      marks.push({
        key: `c-${line.id}`,
        x: tail + 10,
        y: yMid,
        mark: r.match ? '✓' : '✗',
        cls: r.match ? 'ok' : 'bad',
        gray: r.rhs,
        fontSize,
      });
    }
  }
  return marks;
});

// ---- 画布尺寸 / 重绘 ----

function resizeCanvas(): void {
  const cv = canvasEl.value;
  const se = scrollEl.value;
  if (cv === null || se === null) return;
  dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(se.clientWidth * dpr));
  cv.height = Math.max(1, Math.round(se.clientHeight * dpr));
  viewportH.value = se.clientHeight;
  redraw();
}

/** 二次贝塞尔平滑：相邻点中点为曲线端点、原点为控制点；单点画圆点。 */
function pathStroke(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length === 0) return;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.fillStyle = PEN_COLOR;
    ctx.arc(pts[0].x, pts[0].y, PEN_WIDTH / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  }
  ctx.stroke();
}

function redraw(): void {
  const cv = canvasEl.value;
  const se = scrollEl.value;
  if (cv === null || se === null) return;
  const ctx = cv.getContext('2d');
  if (ctx === null) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, se.clientWidth, se.clientHeight);
  ctx.translate(0, -se.scrollTop); // 内容坐标 → 视口坐标
  ctx.strokeStyle = PEN_COLOR;
  ctx.lineWidth = PEN_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of props.lines) {
    for (const st of line.strokes) pathStroke(ctx, st.pts);
  }
  if (activePts.length > 0) pathStroke(ctx, activePts); // 进行中的一笔
}

watch(
  () => props.lines,
  () => redraw(),
);

onMounted(() => {
  ro = new ResizeObserver(() => resizeCanvas());
  if (scrollEl.value !== null) ro.observe(scrollEl.value);
  resizeCanvas();
});
onBeforeUnmount(() => ro?.disconnect());

// ---- 指针事件 ----

function toContent(se: HTMLDivElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = se.getBoundingClientRect();
  return { x: clientX - rect.left + se.scrollLeft, y: clientY - rect.top + se.scrollTop };
}

function onPointerDown(e: PointerEvent): void {
  if (activePointerId !== null) return; // 忽略第二指针
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const se = scrollEl.value;
  if (se === null) return;
  const c = toContent(se, e.clientX, e.clientY);
  activePointerId = e.pointerId;
  try {
    se.setPointerCapture(e.pointerId);
  } catch {
    /* 捕获失败不阻塞书写 */
  }
  e.preventDefault();
  if (props.eraseMode) {
    erasing = true;
    props.eraseAt(c, ERASE_RADIUS);
    return;
  }
  drawing = true;
  activePts = [{ x: c.x, y: c.y, t: e.timeStamp }];
  // 新行接近视口底部 → 轻微下滚留出书写空间
  if (c.y > se.scrollTop + se.clientHeight - 60) {
    se.scrollTop = c.y - se.clientHeight + 140;
  }
  redraw();
}

function onPointerMove(e: PointerEvent): void {
  const se = scrollEl.value;
  if (se === null) return;
  const rect = se.getBoundingClientRect();
  eraserX.value = e.clientX - rect.left;
  eraserY.value = e.clientY - rect.top;
  eraserVisible.value = true;
  if (activePointerId !== e.pointerId) return;
  e.preventDefault();
  if (erasing) {
    props.eraseAt(toContent(se, e.clientX, e.clientY), ERASE_RADIUS);
    return;
  }
  if (!drawing) return;
  // coalesced events：高刷设备合并点全部入笔（不可用则退化为单事件）
  const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  const source = evs.length > 0 ? evs : [e];
  for (const pe of source) {
    const c = toContent(se, pe.clientX, pe.clientY);
    activePts.push({ x: c.x, y: c.y, t: pe.timeStamp });
  }
  redraw();
}

function onPointerUp(e: PointerEvent): void {
  if (activePointerId !== e.pointerId) return;
  activePointerId = null;
  try {
    scrollEl.value?.releasePointerCapture(e.pointerId);
  } catch {
    /* 已释放则忽略 */
  }
  if (erasing) {
    erasing = false;
    return;
  }
  if (drawing) {
    drawing = false;
    const pts = activePts;
    activePts = [];
    if (pts.length > 0) props.addStroke({ id: nextStrokeId++, pts });
    redraw();
  }
}

function onPointerLeave(): void {
  eraserVisible.value = false;
}
</script>

<style scoped>
.paper-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.paper-scroll {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.paper-scroll.erasing {
  cursor: none;
}
.paper-content {
  position: relative;
  width: 100%;
  min-height: 100%;
  /* 20px 方格稿纸底（Task 8 钉死：repeating-linear-gradient） */
  background-color: #faf9f6;
  background-image: repeating-linear-gradient(
      to bottom,
      #d8e2ea 0,
      #d8e2ea 1px,
      transparent 1px,
      transparent 20px
    ),
    repeating-linear-gradient(to right, #d8e2ea 0, #d8e2ea 1px, transparent 1px, transparent 20px);
}
.paper-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* 笔迹层透明，事件全部落在滚动层 */
}
.canvas-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b3bfca;
  font-size: 18px;
  letter-spacing: 3px;
}
.eraser {
  position: absolute;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border: 1.5px solid #64748b;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
}
.result-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none; /* 结果永不挡笔 */
}
.result-mark {
  position: absolute;
  transform: translateY(-50%);
  white-space: nowrap;
  font-family: 'Times New Roman', 'STIX Two Math', Georgia, serif;
  line-height: 1;
}
.result-mark .mark.val {
  color: #dc2626;
  font-style: italic;
  font-weight: 600;
}
.result-mark .mark.ok {
  color: #16a34a;
  font-weight: 700;
}
.result-mark .mark.bad {
  color: #dc2626;
  font-weight: 700;
}
.result-mark .rhs-gray {
  color: #9ca3af;
  font-size: 0.55em;
  margin-left: 8px;
  font-style: italic;
}
</style>
