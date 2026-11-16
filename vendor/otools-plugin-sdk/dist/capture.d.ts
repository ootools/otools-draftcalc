import { CaptureApi } from './capture-factory';
/** 只再导出类型；`createCaptureApi` 不再是对外 API。 */
export type * from './capture-factory';
/**
 * 错误类要能构造、能 `instanceof`，所以是值导出——但只带这一个 class，
 * `createCaptureApi` / `normalizeError` 会被摇树丢掉。
 */
export { CaptureError } from './capture-factory';
/**
 * 截屏 API。优先转发到 `window.otools.capture`，老宿主回落本地实现。
 *
 * 用代理而不是直接取引用：插件模块可能在宿主注入 `window.otools` 之前就被求值
 * （比如开发模式的 ESM 预加载），取引用会拿到 undefined 并永久失效。
 */
export declare const capture: CaptureApi;
