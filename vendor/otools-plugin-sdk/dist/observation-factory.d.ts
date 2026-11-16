import { CaptureImage } from './capture-factory';
export type ObservationTarget = {
    kind: 'screen';
    displayId: string;
} | {
    kind: 'window';
    windowId: string;
};
export interface ObservationTargets {
    screens: Array<{
        id: string;
        name: string;
    }>;
    windows: Array<{
        id: string;
        title: string;
        appName: string;
    }>;
}
export interface ObservationStatus {
    id: string;
    state: 'pending' | 'active' | 'stopped';
    target: ObservationTarget;
    intervalMs: number;
    reason?: string;
}
export interface ObservationRequest {
    target: ObservationTarget;
    intervalMs?: number;
}
export interface ObservationTransport {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
}
export interface ObservationApi {
    /** Enumerates native metadata only. Does not capture or request consent. */
    targets(): Promise<ObservationTargets>;
    /** Opens trusted host consent; returns pending. Plugins cannot approve it. */
    request(options: ObservationRequest): Promise<ObservationStatus>;
    status(options: {
        id: string;
    }): Promise<ObservationStatus>;
    /** Returns a lease; release it using capture.release after use. No timer is started. */
    capture(options: {
        id: string;
    }): Promise<CaptureImage>;
    stop(options: {
        id: string;
    }): Promise<void>;
}
export declare class ObservationError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** Dependency-free factory also suitable for the host's plain-webview injection. */
export declare function createObservationApi(transport: ObservationTransport): ObservationApi;
