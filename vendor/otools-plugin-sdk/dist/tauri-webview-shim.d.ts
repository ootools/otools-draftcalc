type UnlistenFn = () => void;
type WebviewShim = {
    listen<T>(event: string, handler: (event: {
        payload: T;
    }) => void | Promise<void>): Promise<UnlistenFn>;
};
export declare function getCurrentWebview(): WebviewShim;
export {};
