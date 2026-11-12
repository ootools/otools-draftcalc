import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { otoolsTauriShimPlugin } from 'otools-plugin-sdk/vite';

export default defineConfig({
  base: './',
  plugins: [vue(), otoolsTauriShimPlugin()],
  server: { host: '127.0.0.1', port: 6547, strictPort: true },
  test: { environment: 'node' },
});
