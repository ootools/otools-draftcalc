/** The current plugin page's container, not the user's preferred launch mode. */
export type PageMode = 'panel' | 'tabs' | 'window';
export declare const createPageModeGetter: () => (() => PageMode);
