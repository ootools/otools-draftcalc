import { OToolsHostDirEntry, OToolsHostReadFilePayload, OToolsHostBrowsePayload } from './otools-globals';
export type HostDirEntry = OToolsHostDirEntry;
export type HostReadFilePayload = OToolsHostReadFilePayload;
export type HostBrowsePayload = OToolsHostBrowsePayload;
export interface PickFromHostTreeOptions {
    title?: string;
    /** true=选目录，false=选文件。 */
    directory?: boolean;
    /** 预留多选，首版仅单选。 */
    multiple?: boolean;
    /** 初始目录；缺省由宿主返回 home。 */
    startPath?: string;
    filters?: {
        name: string;
        extensions: string[];
    }[];
}
export type HostPickSource = 'host-tree';
export interface HostPickResult {
    kind: 'picked' | 'cancelled';
    source: HostPickSource;
    paths: string[];
    names: string[];
}
/** 列宿主某目录（含根列表与父路径），对应 `tools_webview_browse_dialog`。 */
export declare function browseHostDir(path?: string): Promise<HostBrowsePayload>;
/** 列宿主目录下的一层条目（对应 `tools_webview_list_dir`）。 */
export declare function listHostDir(path: string): Promise<HostDirEntry[]>;
/** 读宿主文件内容（对应 `tools_webview_read_file`）。 */
export declare function readHostFile(path: string): Promise<HostReadFilePayload>;
/**
 * 弹出一棵宿主文件系统 DOM 树，用户导航后选中目录 / 文件并返回宿主侧路径。
 *
 * 不依赖任何 UI 框架（原生 DOM），所以 Vue / React / 纯 web 都能用。返回结果
 * 带 `source: 'host-tree'`，调用方据此区分「宿主侧路径」与「用户本机路径」。
 */
export declare function pickFromHostTree(options: PickFromHostTreeOptions): Promise<HostPickResult>;
