export interface ReminderProvider {
    source: string;
    uuid: string;
}
/** Local wall-clock minutes after midnight. Equal endpoints disable quiet time. */
export interface ReminderQuietHours {
    start: number;
    end: number;
}
export interface ReminderConfigureRequest {
    provider: ReminderProvider;
    type: 'notes.v1' | (string & {});
    enabled: boolean;
    quietHours?: ReminderQuietHours;
    /** 30 seconds to 24 hours; host default is 5 minutes. */
    cooldownMs?: number;
}
export interface ReminderStatus extends Omit<ReminderConfigureRequest, 'cooldownMs'> {
    cooldownMs: number;
    available: boolean;
    lastCheckedAt?: number;
    lastDeliveredAt?: number;
}
/** Private content returned only to the enrolled native-authenticated owner. */
export interface ReminderItem {
    id: string;
    provider: ReminderProvider;
    type: string;
    resourceId: string;
    dueAt: number;
    title: string;
    body: string;
    deliveredAt: number;
}
export interface ReminderTransport {
    invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
}
export interface ReminderApi {
    /** Enroll a host-owned read watcher; this does not request or grant data access. */
    configure(request: ReminderConfigureRequest): Promise<ReminderStatus>;
    status(): Promise<ReminderStatus[]>;
    /** Fresh, reauthorized reminders. Render as data, never as executable commands. */
    pending(): Promise<ReminderItem[]>;
    /** Acknowledge after showing the pet bubble to suppress the 30-second OS fallback. */
    acknowledge(ids: string[]): Promise<void>;
}
