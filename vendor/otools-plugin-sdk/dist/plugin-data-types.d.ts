export interface PluginDataIdentity {
    source: string;
    uuid: string;
}
export interface PluginDataDeclaration {
    provides?: string[];
    consumes?: string[];
}
export interface PluginDataResource<T = unknown, P = unknown> {
    provider: PluginDataIdentity;
    type: string;
    id: string;
    revision: number;
    updatedAt: number;
    deleted: boolean;
    data: T;
    /** Present only for provider reads. Change notifications always omit private data. */
    privateData?: P;
}
export interface PluginDataProvider {
    provider: PluginDataIdentity;
    types: string[];
}
export type PluginDataScope = {
    kind: 'all';
} | {
    kind: 'ids';
    ids: string[];
};
/** Omitting provider selects the authenticated caller's own resources. */
export interface PluginDataReadRequest {
    provider?: PluginDataIdentity;
    type: string;
}
export interface PluginDataListRequest extends PluginDataReadRequest {
    cursor?: string;
    limit?: number;
}
export interface PluginDataGetRequest extends PluginDataReadRequest {
    id: string;
}
export interface PluginDataPutRequest<T = unknown, P = unknown> {
    type: string;
    id: string;
    data: T;
    privateData?: P;
    /** Required: 0 creates, otherwise compare-and-swap against the current revision. */
    expectedRevision: number;
    /** Explicit recreation additionally requires the exact current tombstone revision. */
    recreate?: boolean;
}
export interface PluginDataRemoveRequest {
    type: string;
    id: string;
    expectedRevision: number;
}
export interface PluginDataChangesRequest extends PluginDataReadRequest {
    after: string;
    limit?: number;
}
export interface PluginDataListPage<T = unknown, P = unknown> {
    /** Includes tombstones; filter deleted records when rendering live content. */
    items: PluginDataResource<T, P>[];
    next: string | null;
    /** Poll after this snapshot; list continuation fails with resyncRequired if it changes. */
    after: string;
}
export interface PluginDataChangesPage<T = unknown> {
    /** Shared projections only. Owners must get() to refresh private fields. */
    items: PluginDataResource<T, never>[];
    after: string;
    hasMore: boolean;
}
export interface PluginDataAccessRequest {
    provider: PluginDataIdentity;
    type: string;
    scope?: PluginDataScope;
    subscribe?: boolean;
}
export interface PluginDataAccessBatch {
    items: PluginDataAccessRequest[];
}
export interface PluginDataAccessStatus {
    id: string;
    status: 'pending' | 'granted' | 'denied' | 'cancelled' | 'expired';
    expiresAt?: number;
}
export interface PluginDataRevokeRequest {
    provider: PluginDataIdentity;
    type: string;
}
export type PluginDataErrorCode = 'permissionDenied' | 'forbidden' | 'conflict' | 'deleted' | 'resyncRequired' | 'invalidCursor' | 'invalidRequest' | 'storageFailed' | 'unavailable' | 'unsupported' | 'busy';
export interface PluginDataFailure {
    code: PluginDataErrorCode;
    message: string;
}
export interface PluginDataTransport {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
}
export interface PluginDataSubscribeOptions {
    intervalMs?: number;
    signal?: AbortSignal;
    /** Errors stop polling. In particular, resyncRequired requires a fresh list snapshot. */
    onError(error: Error & PluginDataFailure): void;
}
export interface PluginDataApi {
    discover(): Promise<PluginDataProvider[]>;
    list<T = unknown, P = unknown>(request: PluginDataListRequest): Promise<PluginDataListPage<T, P>>;
    get<T = unknown, P = unknown>(request: PluginDataGetRequest): Promise<PluginDataResource<T, P> | null>;
    put<T = unknown, P = unknown>(request: PluginDataPutRequest<T, P>): Promise<PluginDataResource<T, P>>;
    remove(request: PluginDataRemoveRequest): Promise<PluginDataResource<null, never>>;
    changes<T = unknown>(request: PluginDataChangesRequest): Promise<PluginDataChangesPage<T>>;
    /** Requests host consent unless this exact grant already exists; pending is never a grant. */
    requestAccess(request: PluginDataAccessRequest): Promise<PluginDataAccessStatus>;
    /** One host consent for the explicitly listed providers/types, never future plugins. */
    requestAccessBatch(request: PluginDataAccessBatch): Promise<PluginDataAccessStatus>;
    /** Read only the requesting consumer's pending/terminal consent state. */
    accessStatus(request: {
        id: string;
    }): Promise<PluginDataAccessStatus>;
    /** Withdraw only the authenticated consumer's grant. Does not grant access. */
    revokeAccess(request: PluginDataRevokeRequest): Promise<void>;
    /** Owner-bound polling; no global events. Returns idempotent cleanup. */
    subscribe<T = unknown>(request: PluginDataChangesRequest, onChanges: (page: PluginDataChangesPage<T>) => void | Promise<void>, options: PluginDataSubscribeOptions): () => void;
}
