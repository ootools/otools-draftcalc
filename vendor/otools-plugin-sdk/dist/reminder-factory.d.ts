import { ReminderApi, ReminderTransport } from './reminder-types';
export * from './reminder-types';
export declare class ReminderError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** Dependency-free host IPC factory. Scheduling belongs to the running host;
 * this API never creates a webview timer, grants access, or interprets note text. */
export declare function createReminderApi(transport: ReminderTransport): ReminderApi;
