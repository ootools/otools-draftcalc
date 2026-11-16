import { FileOpenListener } from './file-open-factory';
export { OTOOLS_FILE_DELIVER_EVENT, parseLaunchOpenFiles, toOpenFileEntries, type OtoolsOpenFileEntry, type FileOpenListener, type FileOpenUnlisten, } from './file-open-factory';
/**
 * 订阅宿主投递的文件。
 *
 * 优先用宿主注入的 `window.otools.onOtoolsOpenFile`（apiVersion >= 2），老宿主才
 * 回落到本地实现。
 */
export declare const onOtoolsOpenFile: FileOpenListener;
