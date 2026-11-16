import { AiApi, AiTransport } from './ai-types';
export type * from './ai-types';
export declare class AiError extends Error {
    readonly code: string;
    constructor(code: string, message?: string);
}
/** Dependency-free factory for both the SDK runtime and the injected window API. */
export declare function createAiApi(transport: AiTransport): AiApi;
