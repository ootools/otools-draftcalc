import { Position as u, Size as h, PhysicalPosition as o, PhysicalSize as s } from "@tauri-apps/api/dpi";
import { LogicalPosition as S, LogicalSize as A, PhysicalPosition as x, PhysicalSize as T, Position as O, Size as R } from "@tauri-apps/api/dpi";
import { ensurePopupManager as l, resolvePopupWindowIdentity as f } from "./popup-manager.js";
import { invokeTauri as d, listen as y, listenTauri as p } from "./runtime.js";
const t = () => typeof window < "u" && typeof window.__TAURI_INTERNALS__?.invoke == "function", _ = () => typeof window > "u" ? "" : f()?.label ?? window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? "";
class g {
  constructor(i) {
    this.ready = Promise.resolve(), this.label = i;
  }
  async invokeWindow(i, e = {}) {
    return await this.ready, d(`plugin:window|${i}`, { label: this.label, ...e });
  }
  async control(i, e = {}) {
    await this.ready, t() && await this.invokeWindow(i, e);
  }
  async close() {
    await this.ready, t() ? await this.invokeWindow("close") : typeof window < "u" && (this.label ? l().closeLabel(this.label) : l().closeCurrent(window));
  }
  async destroy() {
    t() ? await this.invokeWindow("destroy") : await this.close();
  }
  show() {
    return this.control("show");
  }
  hide() {
    return this.control("hide");
  }
  setFocus() {
    return this.control("set_focus");
  }
  setAlwaysOnTop(i) {
    return this.control("set_always_on_top", { value: i });
  }
  setVisibleOnAllWorkspaces(i) {
    return this.control("set_visible_on_all_workspaces", { value: i });
  }
  setIgnoreCursorEvents(i) {
    return this.control("set_ignore_cursor_events", { value: i });
  }
  setPosition(i) {
    const e = i instanceof u ? i.toJSON() : {
      [i.type ?? "Physical"]: { x: i.x, y: i.y }
    };
    return this.control("set_position", { value: e });
  }
  setSize(i) {
    const e = i instanceof h ? i.toJSON() : {
      [i.type ?? "Physical"]: { width: i.width, height: i.height }
    };
    return this.control("set_size", { value: e });
  }
  async outerPosition() {
    if (t()) return new o(await this.invokeWindow("outer_position"));
    const i = await this.scaleFactor();
    return new o(typeof window > "u" ? 0 : window.screenX * i, typeof window > "u" ? 0 : window.screenY * i);
  }
  async innerSize() {
    if (t()) return new s(await this.invokeWindow("inner_size"));
    const i = await this.scaleFactor();
    return new s(typeof window > "u" ? 0 : window.innerWidth * i, typeof window > "u" ? 0 : window.innerHeight * i);
  }
  async scaleFactor() {
    return t() ? this.invokeWindow("scale_factor") : typeof window > "u" ? 1 : window.devicePixelRatio || 1;
  }
  minimize() {
    return this.control("minimize");
  }
  toggleMaximize() {
    return this.control("toggle_maximize");
  }
  async isMaximized() {
    return t() ? this.invokeWindow("is_maximized") : !1;
  }
  center() {
    return this.control("center");
  }
  startDragging() {
    return this.control("start_dragging");
  }
  startResizeDragging(i) {
    return this.control("start_resize_dragging", { value: i });
  }
  async listen(i, e) {
    return await this.ready, t() ? i === "otools:custom-open" && window.__OTOOLS_CUSTOM_WINDOW__ ? y(i, e) : p(i, e, { target: { kind: "Window", label: this.label } }) : () => {
    };
  }
  async once(i, e) {
    let r = !0, n;
    const w = await this.listen(i, (c) => {
      r && (r = !1, n?.(), e(c));
    });
    return n = w, r || await n(), async () => {
      r = !1, await w();
    };
  }
  onMoved(i) {
    return this.listen("tauri://move", (e) => i({ ...e, payload: new o(e.payload) }));
  }
  onResized(i) {
    return this.listen("tauri://resize", (e) => i({ ...e, payload: new s(e.payload) }));
  }
}
function W() {
  return new g(_());
}
async function P() {
  if (t())
    return (await d("plugin:window|available_monitors")).map((n) => ({
      ...n,
      size: new s(n.size),
      position: new o(n.position),
      workArea: {
        position: new o(n.workArea?.position ?? n.position),
        size: new s(n.workArea?.size ?? n.size)
      }
    }));
  if (typeof window > "u") return [];
  const a = window.devicePixelRatio || 1, i = new s((window.screen.width || window.innerWidth) * a, (window.screen.height || window.innerHeight) * a), e = new o(0, 0);
  return [{ name: null, size: i, position: e, workArea: { size: i, position: e }, scaleFactor: a }];
}
export {
  S as LogicalPosition,
  A as LogicalSize,
  x as PhysicalPosition,
  T as PhysicalSize,
  O as Position,
  R as Size,
  g as Window,
  P as availableMonitors,
  W as getCurrentWindow,
  t as hasTauriWindowApi,
  _ as resolveWindowLabel
};
//# sourceMappingURL=tauri-window-shim.js.map
