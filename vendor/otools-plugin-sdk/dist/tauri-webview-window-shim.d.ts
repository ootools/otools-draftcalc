import { WindowOptions } from '@tauri-apps/api/window';
import { WebviewOptions } from '@tauri-apps/api/webview';
import { Window } from './tauri-window-shim';
import { Event, UnlistenFn } from './runtime';
export type WebviewWindowOptions = Omit<WebviewOptions, "x" | "y" | "width" | "height"> & Omit<WindowOptions, "parent"> & {
    parent?: string | {
        label: string;
    };
    ignoreCursorEvents?: boolean;
};
declare const existingHandle: unique symbol;
export declare class WebviewWindow extends Window {
    windowId: string;
    private readonly lifecycle;
    constructor(windowId: string, options?: WebviewWindowOptions, existing?: typeof existingHandle);
    private dispatchLifecycle;
    private lifecycleListener;
    listen<T>(event: string, handler: (event: Event<T>) => void | Promise<void>): Promise<UnlistenFn>;
    once<T>(event: string, handler: (event: Event<T>) => void | Promise<void>): Promise<UnlistenFn>;
    close(): Promise<void>;
    destroy(): Promise<void>;
    static getCurrent(): WebviewWindow;
    static getAll(): Promise<WebviewWindow[]>;
    static getByLabel(label: string): Promise<WebviewWindow | null>;
}
export declare function getCurrentWebviewWindow(): WebviewWindow;
export declare function getAllWebviewWindows(): Promise<WebviewWindow[]>;
export {};
