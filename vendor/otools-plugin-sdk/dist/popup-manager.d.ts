export declare function resolvePopupWindowIdentity(): {
    label: string;
    windowId: string;
} | undefined;
declare class PopupManager {
    private readonly owner;
    private sequence;
    private readonly popups;
    constructor(owner: Window);
    open(path: string, command?: string, _payload?: unknown, label?: string, windowId?: string): string | undefined;
    getAll(): {
        id: string;
        label: string | undefined;
        windowId: string | undefined;
    }[];
    closeLabel(label: string): void;
    close(popupId: string): void;
    closeCurrent(target?: Window): void;
}
export declare function ensurePopupManager(): PopupManager;
export {};
