import { UnlistenFn } from './runtime';
/** 宿主投递敲门事件名（与宿主 platform/keyword_dispatch.rs 的 KEYWORD_DISPATCH_EVENT 对齐）。 */
export declare const OTOOLS_KEYWORD_DISPATCH_EVENT = "otools-keyword-dispatch";
export interface OtoolsKeywordDispatch {
    /** 单条派发标识（宿主生成），可用于响应回传时的关联。 */
    id: string;
    /** 小写归一化后的关键词。 */
    keyword: string;
    /** 宿主附带的任意 JSON 载荷，可为 null。 */
    payload: unknown;
    /** 派发来源：shortcut / host / mcp / plugin… */
    source: string;
    createdAtMs: number;
}
/**
 * 订阅宿主派发的关键词。返回 unlisten。
 *
 * @param handler 收到关键词（按 id 去重合并后）触发；批量派发一次回调给全量。
 */
export declare function onOtoolsKeyword(handler: (items: OtoolsKeywordDispatch[]) => void): Promise<UnlistenFn>;
