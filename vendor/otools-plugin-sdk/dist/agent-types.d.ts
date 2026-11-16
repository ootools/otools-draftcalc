export type AgentJson = null | boolean | number | string | AgentJson[] | {
    [key: string]: AgentJson;
};
export interface AgentCapabilities {
    models: boolean;
    reasoning: boolean;
    resume: boolean;
    permissions: boolean;
    questions: boolean;
    tools: boolean;
    filesystem: boolean;
    terminal: boolean;
    sandbox: boolean;
}
export interface AgentProviderInfo {
    id: string;
    name: string;
    adapter: 'codex' | 'acp';
    source: 'managed' | 'external' | 'configured';
    /** Older hosts may omit which authentication/configuration profile is in use. */
    configuration?: 'host' | 'native';
    available: boolean;
    capabilities: AgentCapabilities;
}
export interface AgentHealth {
    providerId: string;
    status: 'ready' | 'missing' | 'degraded' | 'unavailable';
    checks: Array<{
        id: string;
        status: 'ok' | 'error' | 'unknown';
        message: string;
    }>;
    version: string | null;
    path: string | null;
}
/** Provider launch commands, credentials and owner identity are host-only. */
export interface AgentOpenSessionRequest {
    providerId: string;
    clientSessionId?: string;
    workspaceId?: string;
    instructions?: string;
    sandbox?: 'read-only' | 'workspace-write';
    network?: boolean;
    background?: boolean;
    tools?: string[];
}
export interface AgentSessionInfo {
    id: string;
    providerId: string;
    workspaceId: string;
    capabilities: AgentCapabilities;
    status: 'idle' | 'running' | 'closed' | 'interrupted';
}
export interface AgentStartRequest {
    sessionId: string;
    prompt: string;
    model?: string;
    reasoningEffort?: string | null;
    timeoutSecs?: number;
    requestId?: string;
    mediaModels?: Partial<Record<'images' | 'video' | 'tts' | 'stt' | 'embeddings', string>>;
}
export interface AgentStarted {
    id: string;
    sessionId: string;
}
export interface AgentEvent {
    sequence: number;
    type: 'text' | 'reasoning' | 'tool' | 'permission' | 'question' | 'status' | 'done' | 'cancelled' | 'error';
    text?: string;
    itemId?: string;
    data?: AgentJson;
    error?: string;
}
export interface AgentReadOptions {
    id: string;
    after?: number;
}
export interface AgentReadResult {
    id: string;
    events: AgentEvent[];
    /** True once this page reaches the terminal event; older pages remain running. */
    done: boolean;
    /** Last returned sequence, or the requested cursor for an empty page. */
    after: number;
    status: 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
    /** Optional cumulative text through `after`, useful for restoring a resumed prefix. */
    text?: string;
}
export interface AgentQuestion {
    id: string;
    runId: string;
    questions: Array<{
        id: string;
        header?: string;
        question: string;
        options?: Array<{
            id: string;
            label: string;
            description?: string;
        }>;
        allowCustom?: boolean;
    }>;
}
export interface AgentPermission {
    id: string;
    runId: string;
    title: string;
    description?: string;
    options: Array<{
        id: string;
        label: string;
        kind?: string;
    }>;
}
export interface AgentWorkspace {
    id: string;
    name: string;
}
export interface AgentWorkspaceFile {
    path: string;
    size: number;
    directory: boolean;
}
export interface AgentAsset {
    path: string;
    contentBase64: string;
}
export interface AgentConfigOption {
    id: string;
    name: string;
    category?: string;
    currentValue: string;
    options: Array<{
        value: string;
        name: string;
    }>;
}
export interface AgentConfigOptions {
    options: AgentConfigOption[];
}
export interface AgentTransport {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
}
export interface AgentConsumeOptions {
    signal?: AbortSignal;
    onEvent?: (event: AgentEvent) => void;
    /** Defaults to 100ms; finite values are clamped to 0–10,000ms. */
    pollIntervalMs?: number;
    /** Defaults to 10 minutes; valid range is 1ms–24 hours. */
    timeoutMs?: number;
}
export interface AgentResumeOptions extends AgentConsumeOptions {
    /** Resume detaches on abort/timeout by default. Opt in to cancelling execution. */
    cancelOnAbort?: boolean;
}
export interface AgentConsumeResult extends AgentStarted {
    text: string;
}
export interface AgentResumeResult {
    id: string;
    sessionId?: string;
    text: string;
}
export interface AgentApi {
    providers(): Promise<AgentProviderInfo[]>;
    tools(): Promise<Array<{
        name: string;
        title?: string;
        description?: string;
    }>>;
    capabilities(options: {
        providerId: string;
    }): Promise<AgentCapabilities>;
    health(options: {
        providerId: string;
        refresh?: boolean;
    }): Promise<AgentHealth>;
    openManager(options?: {
        providerId?: string;
    }): Promise<void>;
    openSession(request: AgentOpenSessionRequest): Promise<AgentSessionInfo>;
    configOptions(options: {
        sessionId: string;
    }): Promise<AgentConfigOptions>;
    setConfigOption(options: {
        sessionId: string;
        configId: string;
        value: string;
    }): Promise<AgentConfigOptions>;
    start(request: AgentStartRequest): Promise<AgentStarted>;
    /** Non-destructive replay. Cursors never acknowledge or delete retained events. */
    read(options: AgentReadOptions): Promise<AgentReadResult>;
    cancel(options: {
        id: string;
    }): Promise<void>;
    closeSession(options: {
        sessionId: string;
    }): Promise<void>;
    respondQuestion(options: {
        id: string;
        answers: Record<string, string[]>;
    }): Promise<void>;
    /** Opens host approval UI; plugins cannot grant permissions themselves. */
    openPermission(options: {
        id: string;
    }): Promise<void>;
    workspace(options?: {
        workspaceId?: string;
    }): Promise<AgentWorkspace>;
    syncAssets(options: {
        workspaceId: string;
        files: AgentAsset[];
    }): Promise<void>;
    workspaceFiles(options: {
        workspaceId: string;
        path?: string;
    }): Promise<AgentWorkspaceFile[]>;
    /** Cancels owned execution on abort, timeout or local consumer failure, including late starts. */
    consume(request: AgentStartRequest, options?: AgentConsumeOptions): Promise<AgentConsumeResult>;
    /** Replays from a cursor; text is the new suffix unless the host provides a cumulative snapshot. */
    resume(request: AgentReadOptions, options?: AgentResumeOptions): Promise<AgentResumeResult>;
}
