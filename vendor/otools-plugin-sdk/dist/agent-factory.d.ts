import { AgentApi, AgentTransport } from './agent-types';
export type * from './agent-types';
export declare class AgentError extends Error {
    readonly code: string;
    constructor(code: string, message?: string);
}
/** Dependency-free implementation shared by SDK imports and the injected window API. */
export declare function createAgentApi(transport: AgentTransport): AgentApi;
