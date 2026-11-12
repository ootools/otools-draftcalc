export { invoke } from './runtime';
export { registerTransformCallback as transformCallback } from './native-event-bridge';
export declare const isTauri: () => boolean;
/**
 * Convert a local filesystem path to a URL loadable by the webview.
 *
 * Mirrors `convertFileSrc` from `@tauri-apps/api/core` for the native Tauri
 * runtime and falls back to the otools remote-service file route so the same
 * call works in the otools plugin runtime.
 */
export declare const convertFileSrc: (filePath: string, protocol?: string) => string;
