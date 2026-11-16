import { OToolsHostDirEntry, OToolsHostReadFilePayload, OToolsHostBrowsePayload } from './otools-globals';
/** 注入运行时 / SDK 共用的最小调用面。 */
export interface HostTreeTransport {
    invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
}
export type HostDirEntry = OToolsHostDirEntry;
export type HostReadFilePayload = OToolsHostReadFilePayload;
export type HostBrowsePayload = OToolsHostBrowsePayload;
export interface PickFromHostTreeOptions {
    title?: string;
    /** true=选目录，false=选文件。 */
    directory?: boolean;
    /** 多文件选择；目录选择返回当前目录。 */
    multiple?: boolean;
    /** 初始目录；缺省由宿主返回 home。 */
    startPath?: string;
    filters?: {
        name: string;
        extensions: string[];
    }[];
    /**
     * 初始是否显示以 `.` 开头的隐藏项（`.git`、`.env`…），默认 false。
     * 对话框里有一个开关可以随时切换，这里只决定打开时的初始状态。
     */
    showHidden?: boolean;
}
export type HostPickSource = 'host-tree';
export interface HostPickResult {
    kind: 'picked' | 'cancelled';
    source: HostPickSource;
    paths: string[];
    names: string[];
}
/** 绑定好 transport 的选择器函数签名（`window.otools.pickFromHostTree` 就是它）。 */
export type HostTreePicker = (options: PickFromHostTreeOptions) => Promise<HostPickResult>;
/**
 * 造一个绑定到指定 transport 的宿主文件树选择器。
 *
 * 不依赖任何 UI 框架（原生 DOM），Vue / React / 纯 web 都能用。返回结果带
 * `source: "host-tree"`，调用方据此区分「宿主侧路径」与「用户本机路径」。
 */
export declare function createHostTreePicker(transport: HostTreeTransport): HostTreePicker;
