import { defineConfig, type PluginOption } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { otoolsTauriShimPlugin } from 'otools-plugin-sdk/vite';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * onnxruntime-web 的 wasm 运行时资产（Task 10）。
 *
 * recognize.ts 固定 `ort.env.wasm.wasmPaths = { wasm: './ort/ort-wasm-simd-threaded.jsep.wasm' }`：
 * 二进制按【页面相对】路径 fetch（Emscripten locateFile 返回值经 fetch 解析），
 * 即 `<站点根>/ort/<文件名>`；glue（Emscripten 工厂）走 ort bundle 内联快路径，
 * 不发任何请求（实测字符串形式 wasmPaths 会禁用该快路径并让 ORT 在其模块 URL 旁
 * 动态 import 外部 glue —— 产物布局一变即 404，故钉死对象形式）。
 *
 * 两条路径的落点：
 *  - dev（devUrl 6547）：configureServer 中间件把 /ort/* 映射到
 *    node_modules/onnxruntime-web/dist 的运行时文件，真实引擎在 `pnpm dev` 下即可用；
 *  - build：closeBundle 把二进制拷到 dist/ort/（pack-plugin.mjs 打包 dist/ 全量），
 *    并把 glue 拷到 dist/assets/ —— 这是同源快路径万一失效时 ORT 的回落位置
 *    （glue 相对 ort 模块 URL 解析，生产即 assets/）；纯保险，正常零请求。
 *  另外 Vite 对 ort 内部 `new URL('ort-wasm-simd-threaded.jsep.wasm', import.meta.url)`
 *  的隐式资产处理会以【哈希名】往 dist/assets/ 发一份 wasm —— 与 wasmPaths 无关、
 *  运行时永不命中，删除该死重副本，避免 .oplg 白占 ~21MB。
 *
 * 拷贝清单 = 本构建（ort.bundle.min.mjs 入口）引用的 jsep 变体：
 *   ort-wasm-simd-threaded.jsep.wasm（二进制；numThreads=1 只是运行期不开 worker，
 *   用的仍是这个文件）+ ort-wasm-simd-threaded.jsep.mjs（glue，64KB 级保险）。
 * 非 jsep 的 ort-wasm-simd-threaded.wasm（~11MB）不被本构建引用，不拷。
 */
const ORT_WASM_BINARY = 'ort-wasm-simd-threaded.jsep.wasm';
const ORT_GLUE_FILES = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.mjs'] as const;

function ortWasmAssets(): PluginOption {
  const ortDist = fileURLToPath(new URL('./node_modules/onnxruntime-web/dist', import.meta.url));
  return {
    name: 'otools-ort-wasm-assets',
    configureServer(server) {
      // dev：/ort/* → node_modules/onnxruntime-web/dist/<运行时文件>
      server.middlewares.use('/ort', (req, res, next) => {
        // connect 已剥掉 '/ort' 前缀，req.url 形如 '/ort-wasm-simd-threaded.jsep.wasm'
        const name = decodeURIComponent(String(req.url ?? '').split('?')[0].replace(/^\//, ''));
        const full = join(ortDist, name);
        if (
          name !== ORT_WASM_BINARY &&
          !(ORT_GLUE_FILES as readonly string[]).includes(name) &&
          name !== 'ort-wasm-simd-threaded.wasm'
        ) {
          return next();
        }
        if (!existsSync(full)) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        createReadStream(full).pipe(res);
      });
    },
    closeBundle() {
      // build：二进制 → dist/ort/（与 wasmPaths {wasm:'./ort/…'} 严格对齐）
      const ortOut = fileURLToPath(new URL('./dist/ort', import.meta.url));
      mkdirSync(ortOut, { recursive: true });
      copyFileSync(join(ortDist, ORT_WASM_BINARY), join(ortOut, ORT_WASM_BINARY));
      // glue → dist/assets/（快路径失效时的模块相对回落位置，64KB 级保险）
      const assetsDir = fileURLToPath(new URL('./dist/assets', import.meta.url));
      if (existsSync(assetsDir)) {
        for (const name of ORT_GLUE_FILES) copyFileSync(join(ortDist, name), join(assetsDir, name));
        // 删除 Vite 隐式发出的哈希 wasm（dist/assets/ort-wasm-simd-threaded…-<hash>.wasm）：
        // locateFile 恒定指向 ./ort/，该副本运行时不可达，留着只会进 .oplg 白占 ~21MB。
        for (const f of readdirSync(assetsDir)) {
          if (f.startsWith('ort-wasm-simd-threaded') && f.endsWith('.wasm')) {
            rmSync(join(assetsDir, f));
          }
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [vue(), otoolsTauriShimPlugin(), ortWasmAssets()],
  server: { host: '127.0.0.1', port: 6547, strictPort: true },
  test: { environment: 'node' },
});
