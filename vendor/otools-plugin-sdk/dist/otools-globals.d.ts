export type OToolsPlatform = "macos" | "windows" | "linux" | "unknown";
export interface OToolsDialogFilter {
    name: string;
    extensions: string[];
}
export interface OToolsDialogButtons {
    ok?: string;
}
export interface OToolsDialogOpenOptions {
    directory?: boolean;
    multiple?: boolean;
    title?: string;
    defaultPath?: string;
    filters?: OToolsDialogFilter[];
}
export interface OToolsDialogSaveOptions {
    title?: string;
    defaultPath?: string;
    filters?: OToolsDialogFilter[];
}
export interface OToolsDialogMessageOptions {
    title?: string;
    kind?: "info" | "warning" | "error";
    okLabel?: string;
    buttons?: OToolsDialogButtons;
}
export interface OToolsDialogConfirmOptions extends OToolsDialogMessageOptions {
    cancelLabel?: string;
}
export interface OToolsDialogAPI {
    open(options?: OToolsDialogOpenOptions): Promise<string | string[] | null>;
    save(options?: OToolsDialogSaveOptions): Promise<string | null>;
    message(messageText: string, options?: string | OToolsDialogMessageOptions): Promise<void>;
    confirm(messageText: string, options?: string | OToolsDialogConfirmOptions): Promise<boolean>;
    ask(messageText: string, options?: string | OToolsDialogConfirmOptions): Promise<boolean>;
}
export interface OToolsShellAPI {
    open?(path: string, openWith?: string): Promise<void>;
    openPath?(fullPath: string): Promise<void>;
    showItemInFolder?(fullPath: string): Promise<void>;
    trashItem?(fullPath: string): Promise<void>;
    openExternal?(url: string): Promise<void>;
    beep?(): Promise<void>;
}
export interface OToolsRuntimeAPI {
    dialog?: OToolsDialogAPI | null;
    shell?: OToolsShellAPI | null;
}
export interface OToolsHostDirEntry {
    name: string;
    path: string;
    kind: string;
    size: number;
    mime: string;
    lastModified?: number | null;
}
export interface OToolsHostReadFilePayload {
    path: string;
    name: string;
    size: number;
    mime: string;
    lastModified?: number | null;
    dataBase64: string;
}
export interface OToolsHostWriteFileRequest {
    path: string;
    dataBase64: string;
}
export interface OToolsHostBrowsePayload {
    currentPath: string;
    parentPath?: string | null;
    fileName?: string | null;
    roots: {
        path: string;
        name: string;
    }[];
    entries: OToolsHostDirEntry[];
}
export interface OToolsEnv {
    pageMode?: import('./page-mode').PageMode;
    appName?: string;
    appVersion?: string;
    nativeId?: string;
    pluginUuid?: string;
    platform?: OToolsPlatform | string;
    isDev?: boolean;
    currentFolderPath?: string;
    currentBrowserUrl?: string;
    paths?: Record<string, string>;
}
export interface OToolsAPI {
    /**
     * Capability-set version of the injected API. Hosts older than the one that
     * introduced the field leave it undefined; read it as
     * `window.otools?.apiVersion ?? 0` and gate newer capabilities on it.
     */
    apiVersion?: number;
    /**
     * Generic command bridge (apiVersion >= 2) with built-in routing:
     * `plugin:*` / `otools_host_*` / plugin-state commands go straight to the host;
     * anything else is treated as one of the plugin's own methods and tried against
     * the plugin's native cdylib first, falling back to the host when the library
     * answers "unknown method" or is not enabled at all.
     */
    invoke?<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
    /**
     * Host-filesystem DOM picker (apiVersion >= 2). Same semantics as the SDK's
     * `pickFromHostTree`; the only picker that works in remote / pure-web mode,
     * where native dialogs open on the server and the remote user cannot see them.
     */
    pickFromHostTree?: import('./host-tree-factory').HostTreePicker;
    /**
     * Subscribe to host keyword dispatch (apiVersion >= 2). Same semantics as the
     * SDK's `onOtoolsKeyword`; resolves to an unlisten function.
     */
    onOtoolsKeyword?: import('./keyword-factory').KeywordListener;
    /**
     * Subscribe to host file delivery (apiVersion >= 2) — the OS hands the plugin a
     * file via double-click / drag. Same semantics as the SDK's `onOtoolsOpenFile`;
     * resolves to an unlisten function.
     */
    onOtoolsOpenFile?: import('./file-open-factory').FileOpenListener;
    copyText?(text: string): void;
    showNotification?(body: string, clickFeatureCode?: string): void;
    deepLinks?: import('./deep-links').DeepLinksApi;
    /** Synchronous current-page container query. */
    pageMode?(): import('./page-mode').PageMode;
    /** Temporarily tint the active plugin's host shell; optional background recolors the TABS bar / Panel header; null restores the user theme. */
    setTempHostTheme?: import('./host-theme').SetTempHostTheme;
    shortcuts?: {
        register(shortcut: string, handler: () => void): Promise<() => Promise<void>>;
    };
    capture?: import('./capture-factory').CaptureApi;
    ai?: import('./ai-types').AiApi;
    agent?: import('./agent-types').AgentApi;
    data?: ReturnType<typeof import('./plugin-data-factory').createPluginDataApi>;
    observation?: import('./observation-factory').ObservationApi;
    reminders?: ReturnType<typeof import('./reminder-factory').createReminderApi>;
    isDev(): boolean;
    isMacOS(): boolean;
    isWindows(): boolean;
    isLinux(): boolean;
    getAppName?(): string;
    getAppVersion?(): string;
    getPluginUuid?(): string;
    shellOpen?(path: string, openWith?: string): Promise<void>;
    listHostDir?(path: string): Promise<OToolsHostDirEntry[]>;
    readHostFile?(path: string): Promise<OToolsHostReadFilePayload>;
    browseHostDir?(path: string): Promise<OToolsHostBrowsePayload>;
    writeHostFile?(request: OToolsHostWriteFileRequest): Promise<void>;
    getHostEventStatus?(): Promise<{
        schemaVersion: number;
        clipboard: {
            state: string;
            code: string | null;
            skippedItems: number;
        };
        subscriptions: {
            pluginId: string;
            topics: string[];
            state: string;
            deliveredEvents: number;
            droppedEvents: number;
            queuedEvents: number;
            queuedBytes: number;
            lastError: string | null;
        }[];
    }>;
    invokeNative<T = unknown>(method: string, payload?: unknown): Promise<T>;
    invokeNativePlugin?<T = unknown>(uuid: string, method: string, payload?: unknown): Promise<T>;
    invokeNativeRaw<T = unknown>(method: string, payload?: unknown): Promise<T>;
    reloadNative(): Promise<unknown>;
    probeNative(): Promise<unknown>;
    shellOpenExternal(url: string): void;
    shellOpenPath(fullPath: string): void;
    shellShowItemInFolder?(fullPath: string): void;
    listenNative?(handler: (event: {
        event?: string;
        id?: number;
        payload?: {
            topic?: string;
            payload?: unknown;
        };
    } | unknown) => void, options?: unknown): Promise<() => Promise<void> | void>;
    getPluginLocalState<T = unknown>(plugin?: string, scheme?: string | null): Promise<T | null>;
    savePluginLocalState(plugin?: string, state?: unknown, scheme?: string | null): Promise<void>;
    getPluginLocalStateValue<T = unknown>(plugin?: string, key?: string, scheme?: string | null): Promise<T | null>;
    savePluginLocalStateValue(plugin?: string, key?: string, value?: unknown, scheme?: string | null): Promise<void>;
    patchPluginLocalState(plugin?: string, patch?: Record<string, unknown>, scheme?: string | null): Promise<void>;
    runtime?: OToolsRuntimeAPI;
    dialog?: OToolsDialogAPI;
    shell?: OToolsShellAPI;
}
export interface TauriInternals {
    metadata?: {
        currentWindow?: {
            label?: string;
        };
        currentWebview?: {
            label?: string;
        };
    };
    invoke<T = unknown>(command: string, payload?: Record<string, unknown>, options?: unknown): Promise<T>;
    transformCallback?(callback: (response: {
        payload?: unknown;
    } | unknown) => void, once?: boolean): number;
    unregisterCallback?(id: number): void;
}
export interface TauriEventPluginInternals {
    unregisterListener(event: string, eventId: number): void;
}
declare global {
    interface Window {
        otools?: OToolsAPI;
        utools?: OToolsAPI;
        __OToolsEnv?: OToolsEnv;
        __OTOOLS_CUSTOM_WINDOW__?: {
            pluginUuid: string;
            pluginSource: string;
            windowId: string;
        };
        __TAURI_INTERNALS__?: TauriInternals;
        __TAURI_EVENT_PLUGIN_INTERNALS__: TauriEventPluginInternals;
    }
}
