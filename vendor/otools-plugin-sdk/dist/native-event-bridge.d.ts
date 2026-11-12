type UnlistenFn = () => Promise<void> | void;
type TransformCallback = (payload: {
    payload: unknown;
}) => unknown;
type RuntimeHandler<T = unknown> = (payload: T) => void | Promise<void>;
export declare function registerTransformCallback(callback: TransformCallback, once?: boolean): number;
export declare function attachTransformListener(topic: string, handlerId: number): Promise<number>;
export declare function detachTransformListener(listenerId: number): Promise<void>;
export declare function listenNativeTopic<T>(topic: string, handler: RuntimeHandler<T>): Promise<UnlistenFn>;
export {};
