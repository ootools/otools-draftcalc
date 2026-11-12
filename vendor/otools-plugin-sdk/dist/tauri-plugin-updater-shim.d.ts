export type Update = {
    available: false;
    downloadAndInstall: (onEvent?: (progress: unknown) => void) => Promise<void>;
    close: () => Promise<void>;
};
export declare function check(): Promise<Update | null>;
