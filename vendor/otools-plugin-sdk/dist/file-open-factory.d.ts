/**
 * 「打开文件」接口工厂：宿主把 OS 双击 / 拖进来的文件投递给插件。
 *
 * 宿主侧链路（见宿主 platform/file_open.rs）：文件路径先排进按 pluginUuid 分桶的
 * 投递队列，再对插件 webview `emit_to("otools-open-file")` 敲门。事件只做敲门，
 * 真正载荷一律通过 `otools_consume_open_files` 取走——这样无论插件 listener 与
 * 宿主投递谁先谁后，文件都不会丢：
 *
 *   - 宿主先投递、插件后启动：启动时 listen 注册完成后立即 consume 一次即可取走；
 *   - 插件先启动、宿主后投递：敲门命中已注册的 listener，再 consume 取走。
 *
 * 另有 URL 参数兜底（新开标签时宿主会把 `?otoolsOpenFile=[...]` 拼进插件 URL），
 * 与队列内容按「3 秒窗口内同路径去重」合并，避免同一路径双份回调。
 *
 * 本文件是**可被注入运行时转译的工厂**（见 scripts/sync-service-injection.mjs），
 * 因此只允许 `import type`，不得引用任何运行时值。
 */
/** 宿主投递敲门事件名（与宿主 platform/file_open.rs 的 FILE_DELIVER_EVENT 对齐）。 */
export declare const OTOOLS_FILE_DELIVER_EVENT = "otools-open-file";
export interface OtoolsOpenFileEntry {
    path: string;
    name: string;
    ext: string;
}
export type FileOpenUnlisten = () => void | Promise<void>;
/** 绑定好 transport 的订阅器签名（`window.otools.onOtoolsOpenFile` 就是它）。 */
export type FileOpenListener = (handler: (files: OtoolsOpenFileEntry[]) => void) => Promise<FileOpenUnlisten>;
/** 注入运行时 / SDK 共用的最小调用面。 */
export interface FileOpenTransport {
    invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
    listen<T = unknown>(event: string, handler: (event: {
        payload: T;
    }) => void): Promise<FileOpenUnlisten>;
    /** 解析当前插件 uuid；缺省按 `__OToolsEnv` → URL 参数兜底。 */
    resolvePluginUuid?: () => string;
}
/** 解析宿主拼进插件 URL 的 `otoolsOpenFile` 参数（JSON 数组）。 */
export declare function parseLaunchOpenFiles(search: string): string[];
export declare function toOpenFileEntries(paths: readonly string[]): OtoolsOpenFileEntry[];
/**
 * 造一个绑定到指定 transport 的「打开文件」订阅器。
 *
 * @returns `onOtoolsOpenFile(handler)`：返回 unlisten。收到文件（按 path 去重窗口
 *          合并后）触发；批量投递一次回调给全量。
 */
export declare function createFileOpenListener(transport: FileOpenTransport): FileOpenListener;
