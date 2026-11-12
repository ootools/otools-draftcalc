<template>
  <main class="app">
    <PaperCanvas :lines="lines" :erase-mode="eraseMode" :add-stroke="addStroke" :erase-at="eraseAt" />
    <Toolbar
      v-model:erase-mode="eraseMode"
      v-model:history-open="historyOpen"
      :undo="undo"
      :clear="clearAll"
      :copy="copyLastResult"
    />
    <!-- 识别引擎未就绪横幅：只由 Ort init reject / '识别引擎未就绪' 前缀驱动（WarmupError 不进横幅） -->
    <div v-if="engineError !== null" class="engine-banner" role="alert">{{ engineError }}</div>
    <CandidateBar :lines="lines" :active-line-id="activeLineId" :set-alt="setAlt" />
    <HistoryPanel v-if="historyOpen" :items="history" @close="historyOpen = false" />
  </main>
</template>

<script setup lang="ts">
/**
 * Task 8：稿纸计算器组装 —— 画布铺满、工具条悬浮顶部、候选条固定底部、
 * 历史面板右上开合、引擎故障横幅顶部居中。
 */
import { ref } from 'vue';
import PaperCanvas from './components/PaperCanvas.vue';
import Toolbar from './components/Toolbar.vue';
import CandidateBar from './components/CandidateBar.vue';
import HistoryPanel from './components/HistoryPanel.vue';
import { usePaper } from './usePaper';

const { lines, engineError, activeLineId, history, addStroke, undo, eraseAt, clearAll, setAlt, copyLastResult } =
  usePaper();

const eraseMode = ref(false);
const historyOpen = ref(false);
</script>

<style>
/* 全局：满高 + 米白纸底 */
html,
body,
#app {
  height: 100%;
  margin: 0;
}
body {
  background: #faf9f6;
  font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
</style>

<style scoped>
.app {
  position: relative;
  height: 100%;
  overflow: hidden;
}
.engine-banner {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  max-width: min(92vw, 560px);
  padding: 8px 16px;
  background: rgba(254, 226, 226, 0.95);
  color: #b91c1c;
  border: 1px solid #fca5a5;
  border-radius: 10px;
  font-size: 14px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(185, 28, 28, 0.15);
}
</style>
