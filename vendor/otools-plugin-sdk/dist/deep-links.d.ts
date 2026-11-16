/** Callback parameters never travel in a navigation URL or broadcast event. */
export interface PluginDeepLink {
    requestId: string;
    action: 'open' | 'panel' | 'detach' | 'callback';
    route: string | null;
    params: Record<string, string[]>;
}
export interface CallbackOptions {
    route: string;
    openMode?: 'panel' | 'tabs' | 'detach';
    ttlSeconds?: number;
}
export interface PluginCallback {
    url: string;
    state: string;
    expiresAt: number;
}
export interface DeepLinksApi {
    createCallback(options: CallbackOptions): Promise<PluginCallback>;
    cancelCallback(state: string): Promise<void>;
    onOpen(handler: (value: PluginDeepLink) => void | Promise<void>): Promise<() => void>;
}
export interface DeepLinkTransport {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
    listen(event: string, handler: () => void): Promise<() => void>;
}
export declare function createDeepLinksApi(transport: DeepLinkTransport): DeepLinksApi;
