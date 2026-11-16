# otools-plugin-sdk

用于把基于 Tauri 的前端代码迁移到 OTools 插件环境的兼容 SDK。

## 提供的能力

- 一个 Vite 插件，用来重写 `@tauri-apps/api/core` 和 `@tauri-apps/api/event`
- 适配 OTools 插件环境的 `invoke`、`listen` 等运行时 shim
- `window.otools`、`window.utools` 的共享 TypeScript 全局类型
- `isOtoolsPluginRuntime`、`openExternal`、`openPath` 等轻量辅助方法
- `pickFile`、`pickDirectory`、`saveFile` 等跨 runtime 的对话框辅助封装

## 安装

```bash
pnpm add otools-plugin-sdk
```

配套依赖：

```bash
pnpm add @tauri-apps/api
pnpm add @tauri-apps/plugin-dialog
```

## 用法

先配置 Vite：

```ts
import { defineConfig } from "vite";
import { otoolsTauriShimPlugin } from "otools-plugin-sdk/vite";

export default defineConfig({
  plugins: [otoolsTauriShimPlugin()],
});
```

业务代码继续使用官方 Tauri 入口：

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
```

只有在确实需要运行时分支时，再使用 SDK 暴露的辅助方法：

```ts
import {
  isOtoolsPluginRuntime,
  openExternal,
  openPath,
} from "otools-plugin-sdk";
```

文件对话框优先走 SDK 辅助层：

```ts
import { pickDirectory, pickFile, pickZipFile, saveFile } from "otools-plugin-sdk";
```

如果业务代码直接访问 `window.otools`，补上类型引用：

```ts
/// <reference types="otools-plugin-sdk" />
```

### 宿主桥透明性

当 OTools 宿主注入了符合约定的 `window.otools` 后，SDK 不需要知道当前底层到底是原生 Tauri IPC，还是 remote service WebSocket transport。

这层差异由宿主桥统一吸收，插件代码仍然可以继续围绕 `@tauri-apps/api/*` 和 `window.otools` 编写，不需要为 remote service 额外分叉。

### 插件数据共享

使用宿主注入的 `window.otools.data` 发布、读取及订阅资源。提供方在清单的 `pluginData.provides` 声明数据类型，消费者在 `pluginData.consumes` 声明所需类型；声明与发现本身不授予跨插件读取权限。

```ts
const data = window.otools.data;
const consent = await data.requestAccessBatch({
  items: [{
    provider: { source: "market", uuid: "otools-notes" },
    type: "notes.v1",
    scope: { kind: "all" },
    subscribe: true,
  }],
});

// pending 不是授权；仅本次请求的消费者可查询该状态。
const state = consent.status === "pending"
  ? await data.accessStatus({ id: consent.id })
  : consent;
if (state.status === "granted") {
  const page = await data.list({
    provider: { source: "market", uuid: "otools-notes" },
    type: "notes.v1",
  });
  // 展示内容前以成功读取为准；撤权或插件禁用会使读取失败。
}
```

- 批量请求包含 1–32 个明确的提供方和类型，只弹出一次宿主确认；重复项和无效范围会被拒绝。
- `scope: { kind: "all" }` 包含所选提供方／类型的当前和未来记录，不包括将来新安装的提供方。可用 `{ kind: "ids", ids: [...] }` 限定记录。
- 已有完全匹配的授权可直接返回 `granted`；其余状态是 `pending`、`denied`、`cancelled` 或 `expired`。等待应在终态停止，不重复自动申请。
- 消费者身份由宿主调用上下文确定，不能通过请求参数自报，也不能自行批准授权。`revokeAccess()` 仅撤销自己的授权。
- 数据授权与 MCP 工具档位分开；推荐工具不会自动开放个人数据、资源、提示词或截图。

## 发布

```bash
pnpm build
npm publish
```

## 示例

参考 [examples/minimal-vite](./examples/minimal-vite)，这是一个最小化的 Vite 示例，保留官方 Tauri import，同时通过 SDK 插件运行在 OTools 插件环境里。


### Temporary host chrome theme

Dark-only/light-only plugin pages can request matching TABS/Panel chrome without changing user settings:

```ts
await window.otools?.setTempHostTheme?.('dark'); // or 'light'
await window.otools?.setTempHostTheme?.(null);   // clear this page's request
```

`setTempHostTheme(theme: 'light' | 'dark' | null): Promise<void>` is scoped to the authenticated plugin page. Background calls are remembered but affect chrome only when that page is selected. Leaving the page, returning Home, or closing it restores the latest user theme. TABS and Panel instances are independent; no preference/accent is persisted or broadcast to other plugins. New pages declare again. Browser/CLI iframe requests are source-checked by the host. Older hosts can be supported using the optional chaining above.

### Current page mode

`window.otools.pageMode(): 'panel' | 'tabs' | 'window'` is synchronous and read-only. A plugin can hide its duplicate logo in Panel:

```ts
const showLogo = window.otools?.pageMode?.() !== 'panel';
```

`panel` means a plugin embedded in Panel; `tabs` means an embedded TABS page; `window` means an independent/custom window or an unrecognized container. The native host injects context before plugin preload, and recreating a page in a different container supplies the new mode. The getter reads the current page only and performs no IPC or preference writes. Older same-origin browser pages can use the host iframe marker; an inaccessible/unidentified cross-origin container conservatively returns `window`. Exported SDK helpers: `PageMode`, `createPageModeGetter`.
