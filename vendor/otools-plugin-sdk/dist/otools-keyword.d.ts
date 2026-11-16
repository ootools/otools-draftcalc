import { KeywordListener } from './keyword-factory';
export { OTOOLS_KEYWORD_DISPATCH_EVENT, type OtoolsKeywordDispatch, type KeywordUnlisten, } from './keyword-factory';
/**
 * 订阅宿主派发的关键词。
 *
 * 优先用宿主注入的 `window.otools.onOtoolsKeyword`（apiVersion >= 2），老宿主才回落
 * 到本地实现。
 */
export declare const onOtoolsKeyword: KeywordListener;
