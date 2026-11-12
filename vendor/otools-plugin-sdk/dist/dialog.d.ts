import { OpenDialogOptions, SaveDialogOptions } from '@tauri-apps/plugin-dialog';
type SingleDialogPath = string | null;
export type { DialogFilter, OpenDialogOptions, SaveDialogOptions, } from '@tauri-apps/plugin-dialog';
export declare function pickDirectory(options?: Omit<OpenDialogOptions, "directory" | "multiple">): Promise<SingleDialogPath>;
export declare function pickFile(options?: Omit<OpenDialogOptions, "directory" | "multiple">): Promise<SingleDialogPath>;
export declare function pickFiles(options?: Omit<OpenDialogOptions, "directory" | "multiple">): Promise<string[]>;
export declare function pickZipFile(options?: Omit<OpenDialogOptions, "directory" | "multiple" | "filters">): Promise<SingleDialogPath>;
export declare function saveFile(options: string | SaveDialogOptions): Promise<SingleDialogPath>;
