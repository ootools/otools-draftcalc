import { emit as e, listen as i } from "./runtime.js";
const r = {
  DRAG_ENTER: "tauri://drag-enter",
  DRAG_OVER: "tauri://drag-over",
  DRAG_DROP: "tauri://drag-drop",
  DRAG_LEAVE: "tauri://drag-leave"
};
export {
  r as TauriEvent,
  e as emit,
  i as listen
};
//# sourceMappingURL=tauri-event-shim.js.map
