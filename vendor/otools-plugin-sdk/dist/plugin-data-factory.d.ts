import { PluginDataApi, PluginDataErrorCode, PluginDataFailure, PluginDataTransport } from './plugin-data-types';
export type * from './plugin-data-types';
export declare class PluginDataError extends Error implements PluginDataFailure {
    readonly code: PluginDataErrorCode;
    constructor(code: PluginDataErrorCode, message: string);
}
/** Dependency-free client suitable for native SDK imports and host runtime injection. */
export declare function createPluginDataApi(transport: PluginDataTransport): PluginDataApi;
