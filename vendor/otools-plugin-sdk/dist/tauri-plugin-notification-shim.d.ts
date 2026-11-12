export declare function isPermissionGranted(): Promise<boolean>;
export declare function requestPermission(): Promise<NotificationPermission>;
export declare function sendNotification(options: {
    title: string;
    body?: string;
}): Promise<void>;
