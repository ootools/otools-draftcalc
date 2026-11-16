/**
 * `otools-plugin-sdk` 的公开面。
 *
 * 从 0.2.x 起这里只保留三类东西：
 *
 * 1. **类型**——插件的长期依赖，只有类型没有运行时。
 * 2. **构建期能力**——`otoolsTauriShimPlugin` / `createOtoolsAliasMap`，把
 *    `@tauri-apps/*` 重定向到 shim，只能在打包期生效。
 * 3. **薄包装**——运行时实现已搬进宿主 `window.otools`（apiVersion 2 起），这里
 *    只做「优先用宿主注入的实现，老宿主才回落本地实现」。
 *
 * 各服务的工厂（`createAiApi` / `createCaptureApi` / `createHostTreePicker` …）
 * **不再从这里导出**。它们现在是宿主注入运行时的构建源，由
 * `scripts/sync-service-injection.mjs` 转译内联进 `embedded-runtime.js`；插件要
 * 这些能力直接用 `window.otools.*`，不要自己造实例。
 */
export type { OToolsAPI, OToolsEnv, OToolsPlatform } from './otools-globals';
export type * from './ai-types';
export type * from './agent-types';
export type * from './plugin-data-types';
export type * from './reminder-types';
export type { DeepLinksApi, DeepLinkTransport, PluginDeepLink, PluginCallback, CallbackOptions, } from './deep-links';
export type { HostThemeOverride, HostThemeOptions, SetTempHostTheme, } from './host-theme';
export type { PageMode } from './page-mode';
export type { HostDirEntry, HostReadFilePayload, HostBrowsePayload, PickFromHostTreeOptions, HostPickResult, HostPickSource, } from './host-file-tree';
export type { OtoolsKeywordDispatch } from './otools-keyword';
export type { OtoolsOpenFileEntry } from './otools-file-open';
export type { DialogFilter, OpenDialogOptions, SaveDialogOptions, } from './dialog';
export { createOtoolsAliasMap } from './aliases';
export { otoolsTauriShimPlugin } from './vite';
/**
 * 截屏错误类。
 *
 * 这是包根唯一导出的「实现类」：插件要构造 / `instanceof` 判断错误码就必须有它，
 * 光有类型不够（`otools-crop` 就是 `new CaptureError('cancelled', ...)`）。
 * 它不依赖 `createCaptureApi` / `normalizeError`，打包时那两坨会被摇掉，只剩一个
 * 几十字节的 class。
 */
export { CaptureError } from './capture-factory';
export type { CaptureErrorCode, CaptureFailure } from './capture-factory';
export { invoke, listen, emit, getOtoolsApi, isOtoolsPluginRuntime, openExternal, openPath, type Event, type UnlistenFn, } from './runtime';
export { open as shellOpen, openExternal as shellOpenExternal, openPath as shellOpenPath, } from './tauri-plugin-shell-shim';
export { pickDirectory, pickFile, pickFiles, pickZipFile, saveFile, } from './dialog';
export { browseHostDir, listHostDir, readHostFile, pickFromHostTree, } from './host-file-tree';
export { onOtoolsKeyword, OTOOLS_KEYWORD_DISPATCH_EVENT, } from './otools-keyword';
export { onOtoolsOpenFile, parseLaunchOpenFiles, toOpenFileEntries, OTOOLS_FILE_DELIVER_EVENT, } from './otools-file-open';
export { isValidHostThemeBackground } from './host-theme';
/**
 * 已绑定好的截屏实例。
 *
 * 宿主从 apiVersion 1 起就在 `window.otools.capture` 上提供了同一份实现，新插件
 * 建议直接用 `window.otools.capture`；这里保留是为了不打断既有插件。
 */
export * from './capture';
