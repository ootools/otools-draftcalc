export type HostThemeOverride = 'light' | 'dark' | null;
export type HostThemeOptions = {
    background?: string | null;
};
export type SetTempHostTheme = (theme: HostThemeOverride, options?: HostThemeOptions) => Promise<void>;
export declare const isValidHostThemeBackground: (value: unknown) => value is string;
export declare const createTempHostThemeSetter: (transport: {
    invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    isNative?: () => boolean;
}) => SetTempHostTheme;
