import { OToolsAPI } from './otools-globals';
type InvokePayload = unknown;
export declare const getOtoolsApi: () => OToolsAPI | undefined;
export declare const isOtoolsPluginRuntime: () => boolean;
export declare const invokeTauri: <T>(command: string, payload?: InvokePayload) => Promise<T>;
export type EventTarget = {
    kind: "Any" | "AnyLabel";
    label?: string;
} | {
    kind: "Window" | "Webview" | "WebviewWindow";
    label: string;
};
export interface ListenOptions {
    target?: string | EventTarget;
}
export declare function listenTauri<T>(event: string, handler: (event: Event<T>) => void | Promise<void>, options?: ListenOptions): Promise<UnlistenFn>;
export declare function invoke<T = unknown>(command: string, payload?: InvokePayload): Promise<T>;
export interface Event<T> {
    event: string;
    id: number;
    payload: T;
}
export type UnlistenFn = () => Promise<void> | void;
export declare function listen<T>(event: string, handler: (event: Event<T>) => void | Promise<void>, options?: ListenOptions): Promise<UnlistenFn>;
export declare function emit<T = unknown>(event: string, payload?: T): Promise<void>;
export declare function openExternal(url: string): boolean;
export declare function openPath(fullPath: string): boolean;
export {};
