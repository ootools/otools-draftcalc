import { UnlistenFn } from './runtime';
/** 宿主投递敲门事件名（与宿主 platform/file_open.rs 的 FILE_DELIVER_EVENT 对齐）。 */
export declare const OTOOLS_FILE_DELIVER_EVENT = "otools-open-file";
export interface OtoolsOpenFileEntry {
    path: string;
    name: string;
    ext: string;
}
/** 解析宿主拼进插件 URL 的 `otoolsOpenFile` 参数（JSON 数组）。 */
export declare function parseLaunchOpenFiles(search: string): string[];
export declare function toOpenFileEntries(paths: readonly string[]): OtoolsOpenFileEntry[];
/**
 * 订阅宿主投递的文件。返回 unlisten。
 *
 * @param handler 收到文件（按 path 去重窗口合并后）触发；批量投递一次回调给全量。
 */
export declare function onOtoolsOpenFile(handler: (files: OtoolsOpenFileEntry[]) => void): Promise<UnlistenFn>;
