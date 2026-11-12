import { Window as y, hasTauriWindowApi as s, resolveWindowLabel as h } from "./tauri-window-shim.js";
import { invokeTauri as a } from "./runtime.js";
import { ensurePopupManager as w, resolvePopupWindowIdentity as b } from "./popup-manager.js";
const d = () => typeof window > "u" ? void 0 : window.__OTOOLS_CUSTOM_WINDOW__, f = /* @__PURE__ */ Symbol("existing window");
class g extends y {
  constructor(e, i = {}, r) {
    super(e), this.lifecycle = /* @__PURE__ */ new Map(), this.windowId = e, r !== f && (this.ready = Promise.resolve().then(async () => {
      if (s())
        if (d()) {
          const { title: t, url: o, ...p } = i, c = await a("open_custom_plugin_window", {
            windowId: e,
            ...t === void 0 ? {} : { title: t },
            ...o === void 0 ? {} : { url: o },
            options: p
          });
          this.label = c.label, this.windowId = c.windowId;
        } else
          await a("plugin:webview|create_webview_window", {
            options: { ...i, parent: typeof i.parent == "string" ? i.parent : i.parent?.label, label: e }
          });
      else {
        if (typeof window > "u") throw new Error("Window creation is unavailable outside a browser or Tauri runtime");
        const t = w();
        t.getAll().some((o) => o.label === e) || t.open(i.url ?? window.location.href, "webview-window", void 0, e);
      }
    }), this.ready.then(
      () => this.dispatchLifecycle("tauri://created", null),
      (t) => this.dispatchLifecycle("tauri://error", t)
    ));
  }
  dispatchLifecycle(e, i) {
    const r = this.lifecycle.get(e);
    for (const t of [...r ?? []])
      t.once && r?.delete(t), t.handler({ event: e, id: -1, payload: i });
  }
  lifecycleListener(e, i, r) {
    const t = this.lifecycle.get(e) ?? /* @__PURE__ */ new Set();
    this.lifecycle.set(e, t);
    const o = { handler: i, once: r };
    return t.add(o), Promise.resolve(() => {
      t.delete(o);
    });
  }
  listen(e, i) {
    return e === "tauri://created" || e === "tauri://error" ? this.lifecycleListener(e, i, !1) : super.listen(e, i);
  }
  once(e, i) {
    return e === "tauri://created" || e === "tauri://error" ? this.lifecycleListener(e, i, !0) : super.once(e, i);
  }
  async close() {
    await this.ready, s() || !this.label ? await super.close() : w().closeLabel(this.label);
  }
  async destroy() {
    s() ? await super.destroy() : await this.close();
  }
  static getCurrent() {
    return m();
  }
  static getAll() {
    return u();
  }
  static async getByLabel(e) {
    const i = await u();
    return i.find((r) => r.label === e) ?? i.find((r) => r.windowId === e) ?? null;
  }
}
function l(n) {
  const e = new g(n.label, {}, f);
  return e.windowId = n.windowId, e;
}
function m() {
  const n = b(), e = n?.label ?? h();
  return l({ label: e, windowId: n?.windowId ?? d()?.windowId ?? e });
}
async function u() {
  return s() ? d() ? (await a("list_custom_plugin_windows", {})).map(l) : (await a("plugin:window|get_all_windows")).map((n) => l({ label: n, windowId: n })) : typeof window > "u" ? [] : w().getAll().map((n) => l({ label: n.label, windowId: n.label }));
}
export {
  g as WebviewWindow,
  u as getAllWebviewWindows,
  m as getCurrentWebviewWindow
};
//# sourceMappingURL=tauri-webview-window-shim.js.map
