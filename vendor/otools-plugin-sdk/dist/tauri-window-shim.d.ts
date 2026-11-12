import { LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize, Position, Size } from '@tauri-apps/api/dpi';
import { Event, UnlistenFn } from './runtime';
export { LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize, Position, Size };
export type ResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";
type PositionLike = {
    x: number;
    y: number;
    type?: "Logical" | "Physical";
};
type SizeLike = {
    width: number;
    height: number;
    type?: "Logical" | "Physical";
};
export declare const hasTauriWindowApi: () => boolean;
export declare const resolveWindowLabel: () => string;
/** A handle to one window. WebviewWindow supplies its asynchronous native label. */
export declare class Window {
    label: string;
    protected ready: Promise<void>;
    constructor(label: string);
    protected invokeWindow<T = void>(command: string, args?: Record<string, unknown>): Promise<T>;
    protected control(command: string, args?: Record<string, unknown>): Promise<void>;
    close(): Promise<void>;
    destroy(): Promise<void>;
    show(): Promise<void>;
    hide(): Promise<void>;
    setFocus(): Promise<void>;
    setAlwaysOnTop(value: boolean): Promise<void>;
    setVisibleOnAllWorkspaces(value: boolean): Promise<void>;
    setIgnoreCursorEvents(value: boolean): Promise<void>;
    setPosition(position: PositionLike | Position): Promise<void>;
    setSize(size: SizeLike | Size): Promise<void>;
    outerPosition(): Promise<PhysicalPosition>;
    innerSize(): Promise<PhysicalSize>;
    scaleFactor(): Promise<number>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    isMaximized(): Promise<boolean>;
    center(): Promise<void>;
    startDragging(): Promise<void>;
    startResizeDragging(value: ResizeDirection): Promise<void>;
    listen<T>(event: string, handler: (event: Event<T>) => void | Promise<void>): Promise<UnlistenFn>;
    once<T>(event: string, handler: (event: Event<T>) => void | Promise<void>): Promise<UnlistenFn>;
    onMoved(handler: (event: Event<PhysicalPosition>) => void | Promise<void>): Promise<UnlistenFn>;
    onResized(handler: (event: Event<PhysicalSize>) => void | Promise<void>): Promise<UnlistenFn>;
}
export declare function getCurrentWindow(): Window;
export interface Monitor {
    name: string | null;
    size: PhysicalSize;
    position: PhysicalPosition;
    workArea: {
        position: PhysicalPosition;
        size: PhysicalSize;
    };
    scaleFactor: number;
}
export declare function availableMonitors(): Promise<Monitor[]>;
