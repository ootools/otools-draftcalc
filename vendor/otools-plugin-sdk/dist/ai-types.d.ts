export type AiRole = 'system' | 'user' | 'assistant';
export type AiContent = {
    type: 'text';
    text: string;
} | {
    type: 'image';
    captureImageId: string;
};
export interface AiMessage {
    role: AiRole;
    content: AiContent[];
}
export interface AiSelection {
    model: string | null;
    reasoningEffort: string | null;
}
export interface AiModelInfo {
    id: string;
    ownedBy: string;
    capabilities: string[];
    reasoningLevels: Array<{
        effort: string;
        description: string;
    }>;
    defaultReasoningLevel: string | null;
    contextWindow: number | null;
}
export interface AiModelCatalog {
    models: AiModelInfo[];
    defaultModel: string | null;
    selection: AiSelection;
}
export type AiMediaChannel = 'images' | 'video' | 'tts' | 'stt' | 'embeddings';
export interface AiMediaApi {
    models(options: {
        channel: AiMediaChannel;
    }): Promise<AiModelCatalog>;
    getSettings(options: {
        channel: AiMediaChannel;
    }): Promise<{
        model: string | null;
    }>;
    saveSettings(options: {
        channel: AiMediaChannel;
        model: string | null;
    }): Promise<{
        model: string | null;
    }>;
    images(request: {
        prompt: string;
        model?: string;
        size?: string;
        n?: number;
    }): Promise<{
        model: string;
        images: Array<{
            b64_json: string;
            mime_type: string;
        }>;
    }>;
    speech(request: {
        input: string;
        model?: string;
        voice?: string;
        responseFormat?: string;
        speed?: number;
    }): Promise<{
        model: string;
        audioBase64: string;
    }>;
    transcribe(request: {
        audioBase64: string;
        filename: string;
        model?: string;
        language?: string;
    }): Promise<{
        model: string;
        text: string;
    }>;
    embeddings(request: {
        input: string[];
        model?: string;
    }): Promise<{
        model: string;
        vectors: number[][];
    }>;
    videoSubmit(request: {
        prompt: string;
        model?: string;
        image?: string;
        duration?: number;
        fps?: number;
        width?: number;
        height?: number;
        seed?: number;
        metadata?: Record<string, unknown>;
    }): Promise<{
        model: string;
        task: unknown;
    }>;
    videoStatus(request: {
        taskId: string;
        refresh?: boolean;
    }): Promise<{
        task: unknown;
    }>;
    videoContent(request: {
        taskId: string;
    }): Promise<{
        videoBase64: string;
    }>;
}
/** Provider, base URLs, and credentials remain exclusively host-configured. */
export interface AiRequest {
    messages: AiMessage[];
    temperature?: number;
    maxTokens?: number;
    /** Overrides host preferences for this request; the host validates model metadata. */
    model?: string;
    reasoningEffort?: string;
}
export interface AiCapabilities {
    /** Connection settings exist; the plugin selects a model separately. */
    configured: boolean;
    provider?: string;
    model?: string;
    streaming: boolean;
    cancellation: boolean;
    /** Unknown means no reliable model metadata; image requests may still succeed. */
    vision: 'unknown' | 'supported' | 'unsupported';
    reason?: string;
}
export type AiEvent = {
    sequence: number;
    type: 'delta';
    text: string;
} | {
    sequence: number;
    type: 'done' | 'cancelled';
} | {
    sequence: number;
    type: 'error';
    error: string;
};
export interface AiReadResult {
    id: string;
    events: AiEvent[];
    done: boolean;
}
export interface AiTransport {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
}
export interface AiConsumeOptions {
    signal?: AbortSignal;
    onEvent?: (event: AiEvent) => void;
    pollIntervalMs?: number;
}
export interface AiApi {
    media: AiMediaApi;
    capabilities(): Promise<AiCapabilities>;
    models(): Promise<AiModelCatalog>;
    getSettings(): Promise<AiSelection>;
    saveSettings(settings: AiSelection): Promise<AiSelection>;
    start(request: AiRequest): Promise<{
        id: string;
    }>;
    /** The cursor acknowledges earlier events; older cursors subsequently fail. */
    read(options: {
        id: string;
        after: number;
    }): Promise<AiReadResult>;
    cancel(options: {
        id: string;
    }): Promise<void>;
    /** Owns polling, terminal acknowledgement and cancellation on abort/failure. */
    consume(request: AiRequest, options?: AiConsumeOptions): Promise<{
        id: string;
        text: string;
    }>;
}
