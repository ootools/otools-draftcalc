export type CaptureErrorCode = 'unsupported' | 'permissionDenied' | 'busy' | 'cancelled' | 'timeout' | 'notFound' | 'invalidRequest' | 'forbidden' | 'captureFailed' | 'outputFailed';
export interface CaptureFailure {
    code: CaptureErrorCode;
    message: string;
}
export interface CaptureRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface CaptureImage {
    imageId: string;
    mimeType: 'image/png';
    width: number;
    height: number;
    expiresAt: number;
}
export interface CaptureFrame extends CaptureImage {
    displayId: string;
    name: string;
    logicalBounds: CaptureRect;
    windows: Array<{
        id: string;
        title: string;
        appName: string;
        rect: CaptureRect;
    }>;
}
export interface CaptureCapabilities {
    available: boolean;
    platform: string;
    interactive: boolean;
    screen: boolean;
    region: boolean;
    window: boolean;
    edit: boolean;
    pin: boolean;
    reason?: string;
}
export interface CapturePermission {
    granted: boolean;
    canRequest: boolean;
}
export type CaptureRepairResult = {
    status: 'reset';
    restartRequired: boolean;
} | {
    status: 'cancelled';
    restartRequired: boolean;
};
export type CaptureCompletedResult = {
    status: 'completed';
    captureId: string;
    image: CaptureImage;
    displayId: string;
    rect: CaptureRect;
    action: 'complete' | 'copy' | 'pin';
};
export type CaptureResult = CaptureCompletedResult | {
    status: 'cancelled';
    captureId: string;
} | {
    status: 'error';
    captureId: string;
    error: CaptureFailure;
};
export interface CaptureSelectOptions {
    edit?: boolean;
    hideHost?: boolean;
    /** Select an area (default) or confirm one physical screen pixel. */
    mode?: 'region' | 'color';
    /** Restore windows hidden by capture on completion/cancellation; defaults to true. */
    restoreHost?: boolean;
    /** Color selection: false (default) samples the live screen; true freezes it. Region selection always freezes. */
    freezeScreen?: boolean;
}
export interface CaptureScreenOptions {
    displayId?: string;
    hideHost?: boolean;
}
export interface CaptureRegionOptions {
    displayId: string;
    rect: CaptureRect;
    hideHost?: boolean;
}
export interface CaptureWindowOptions {
    windowId?: string;
    hideHost?: boolean;
}
export interface CaptureTransport {
    invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    listen?: (event: string, handler: (event: {
        payload: {
            captureId: string;
        };
    }) => void) => Promise<() => void | Promise<void>>;
}
export interface CaptureApi {
    capabilities(): Promise<CaptureCapabilities>;
    permissionStatus(): Promise<CapturePermission>;
    requestPermission(): Promise<CapturePermission>;
    repairPermission(): Promise<CaptureRepairResult>;
    select(options?: CaptureSelectOptions, signal?: AbortSignal): Promise<CaptureResult>;
    screen(options?: CaptureScreenOptions): Promise<CaptureCompletedResult>;
    region(options: CaptureRegionOptions): Promise<CaptureCompletedResult>;
    window(options?: CaptureWindowOptions): Promise<CaptureCompletedResult>;
    pin(options: {
        dataUrl: string;
        logicalBounds?: CaptureRect;
    }): Promise<{
        pinId: string;
    }>;
    readImage(imageId: string): Promise<Uint8Array>;
    retain(imageId: string): Promise<CaptureImage>;
    release(imageId: string): Promise<void>;
}
export declare class CaptureError extends Error implements CaptureFailure {
    readonly code: CaptureErrorCode;
    constructor(code: CaptureErrorCode, message: string);
}
export declare function createCaptureApi(transport: CaptureTransport): CaptureApi;
