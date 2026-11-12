import { attachTransformListener as G, detachTransformListener as V, listenNativeTopic as z } from "./native-event-bridge.js";
import { ensurePopupManager as X } from "./popup-manager.js";
const q = "otools:", Q = "otools-tauri:", J = { kind: "Any" }, S = /* @__PURE__ */ new Set(["crop-images-updated", "otools:custom-open"]), K = /* @__PURE__ */ new Set([
  "set_window_theme",
  "update_tray_menu"
]), Y = /* @__PURE__ */ new Set([
  "open_commit_window",
  "open_merge_window",
  "open_settings_window",
  "open_stash_window",
  "open_push_window",
  "open_project_boot_window"
]), N = /* @__PURE__ */ Symbol(
  "shared-host-command-not-handled"
), x = /^(get|save|patch)_otools_plugin_(localstate|syncstate)(_value)?(_with_scheme)?$/, d = () => typeof window < "u", L = () => {
  try {
    return typeof __OTOOLS_PLUGIN_UUID__ == "string" ? P(__OTOOLS_PLUGIN_UUID__) : "";
  } catch {
    return "";
  }
}, E = (t) => t.startsWith("plugin:"), C = (t) => x.test(t), Z = "otools_host_", tt = /* @__PURE__ */ new Set([
  "otools_copy_text",
  "hide_panel_window",
  "detach_tools_tab_to_window",
  "open_custom_plugin_window",
  "list_custom_plugin_windows",
  "close_custom_plugin_windows",
  "custom_plugin_window_ready"
]), T = (t) => t.startsWith(Z) || tt.has(t), P = (t) => {
  const e = String(t ?? "").trim();
  if (!e)
    return "";
  const n = e.lastIndexOf(":");
  if (n <= 0 || n >= e.length - 1)
    return e;
  const i = e.slice(0, n).trim().toLowerCase(), o = e.slice(n + 1).trim();
  return o && (i === "builtin" || i === "market" || i === "dev-debug" || i === "dev-workspace") ? o : e;
}, et = (t) => {
  const e = [], n = String(t ?? "");
  if (n && e.push(n), t && typeof t == "object") {
    const i = t, o = String(i.message ?? ""), u = String(i.code ?? ""), r = String(i.detail ?? "");
    o && e.push(o), u && e.push(u), r && e.push(r);
  }
  return e.join(" | ");
}, U = (t) => {
  const e = et(t).toLowerCase();
  return e ? e.includes("not allowed") || e.includes("command not found") || e.includes("unknown method") || e.includes("unknown command") : !1;
}, nt = (t) => U(t), v = () => {
  if (d())
    for (const t of F()) {
      const e = t.otools ?? t.utools;
      if (e)
        return e;
    }
}, M = () => typeof v()?.invokeNative == "function", F = () => {
  if (!d())
    return [];
  const t = [
    window
  ];
  for (const e of [() => window.parent, () => window.top])
    try {
      const n = e();
      if (!n || n === window || t.includes(n))
        continue;
      t.push(n);
    } catch {
    }
  return t;
}, W = () => {
  if (!d())
    return !1;
  try {
    const t = window.__OToolsEnv;
    if (typeof t?.pluginUuid == "string" && t.pluginUuid.trim())
      return !0;
    const e = new URLSearchParams(window.location.search || "");
    return !!(e.get("plugin") || e.get("pluginUuid") || e.get("plugin_uuid"));
  } catch {
    return !1;
  }
}, I = async (t = 1200) => {
  if (!d())
    return;
  const e = Date.now() + t;
  for (; Date.now() <= e; ) {
    for (const n of F()) {
      const i = n.otools ?? n.utools;
      if (typeof i?.invokeNative == "function" || typeof i?.invokeNativePlugin == "function")
        return i;
    }
    await new Promise((n) => {
      window.setTimeout(n, 20);
    });
  }
  return v();
}, b = (t) => {
  const e = P(t?.getPluginUuid?.());
  if (e)
    return e;
  if (!d())
    return L();
  try {
    const n = window.__OToolsEnv, i = P(n?.pluginUuid);
    if (i)
      return i;
    const o = new URLSearchParams(window.location.search || ""), u = P(
      o.get("plugin") || o.get("pluginUuid") || o.get("plugin_uuid") || ""
    );
    if (u)
      return u;
  } catch {
  }
  return L();
}, w = () => {
  if (d())
    return window.__TAURI_INTERNALS__;
}, it = (t) => `${q}${t}`, g = (t) => `${Q}${t}`, R = (t, e) => {
  d() && window.dispatchEvent(
    new CustomEvent(it(t), {
      detail: { payload: e }
    })
  );
}, rt = (t, e) => {
  d() && window.dispatchEvent(
    new CustomEvent(g(t), {
      detail: { payload: e }
    })
  );
}, y = (t) => !t || typeof t != "object" || Array.isArray(t) ? null : t, k = (t, e, n, i = !1) => {
  const o = y(e)?.[n];
  if (typeof o != "string" || !i && !o.trim())
    throw new Error(`${t} requires ${n}`);
  return o;
}, ot = (t) => {
  const e = atob(t), n = new Uint8Array(e.length);
  for (let i = 0; i < e.length; i += 1)
    n[i] = e.charCodeAt(i);
  return new TextDecoder().decode(n);
}, st = (t) => {
  const e = new TextEncoder().encode(t), n = [], i = 32768;
  for (let o = 0; o < e.length; o += i)
    n.push(
      String.fromCharCode(...e.subarray(o, o + i))
    );
  return btoa(n.join(""));
}, ut = async (t, e, n) => {
  if (e === "read_directory_recursive" && typeof t.listHostDir == "function") {
    const i = k(e, n, "path");
    return (await t.listHostDir(i)).filter((u) => !u.name.startsWith(".")).map((u) => {
      const r = u.kind === "directory";
      return {
        id: u.path,
        label: u.name,
        path: u.path,
        is_directory: r,
        isLeaf: !r
      };
    });
  }
  if (e === "read_file_content" && typeof t.readHostFile == "function") {
    const i = k(e, n, "filePath"), o = await t.readHostFile(i);
    return ot(o.dataBase64);
  }
  if (e === "write_file_content" && typeof t.writeHostFile == "function") {
    const i = k(e, n, "filePath"), o = k(e, n, "content", !0);
    return t.writeHostFile({
      path: i,
      dataBase64: st(o)
    });
  }
  if (e === "browse_dialog" && typeof t.browseHostDir == "function") {
    const i = String(
      n?.path ?? ""
    ).trim();
    return t.browseHostDir(i);
  }
  return N;
}, at = async (t, e, n) => {
  const i = x.exec(e);
  if (!i)
    return N;
  const [, o, u, r, s] = i, a = `${o}Plugin${u === "localstate" ? "Local" : "Sync"}State${r ? "Value" : ""}`, c = t[a];
  if (typeof c != "function")
    return N;
  const l = y(n), j = typeof l?.plugin == "string" ? l.plugin : void 0, B = s && typeof l?.scheme == "string" ? l.scheme : null, _ = [j];
  return o === "get" ? r && _.push(l?.key) : o === "patch" ? _.push(l?.patch ?? {}) : r ? _.push(l?.key, l?.value ?? null) : _.push(l?.state ?? null), _.push(B), c.apply(
    t,
    _
  );
}, O = (t, e, n) => {
  const i = y(e);
  t === "switch_provider" && i?.app && i?.id && R("provider-switched", {
    appType: i.app,
    providerId: i.id,
    source: "native-plugin",
    result: n
  }), t === "sync_universal_provider" && i?.id && R("universal-provider-synced", {
    id: i.id,
    result: n
  });
}, f = async (t, e) => {
  const n = w();
  if (!n?.invoke)
    throw new Error("Tauri runtime is unavailable");
  return n.invoke(
    t,
    e
  );
}, h = async (t, e, n) => {
  try {
    return await t();
  } catch (i) {
    if (!nt(i) || !w()?.invoke)
      throw i;
    return f(e, n);
  }
}, lt = (t) => t && typeof t == "object" && "payload" in t ? t.payload ?? null : t;
async function A(t, e, n = {}) {
  const i = w();
  if (!i?.invoke || !i.transformCallback)
    throw new Error("Tauri event runtime is unavailable");
  let o = !0;
  const u = i.transformCallback((a) => {
    o && e({
      event: t,
      id: a && typeof a == "object" && "id" in a ? Number(a.id) : -1,
      payload: lt(a)
    });
  }, !1);
  let r;
  try {
    r = await i.invoke("plugin:event|listen", {
      event: t,
      target: typeof n.target == "string" ? { kind: "AnyLabel", label: n.target } : n.target ?? J,
      handler: u
    });
  } catch (a) {
    throw i.unregisterCallback?.(u), a;
  }
  return async () => {
    if (o) {
      o = !1;
      try {
        await window.__TAURI_EVENT_PLUGIN_INTERNALS__?.unregisterListener?.(
          t,
          r
        );
      } catch {
      }
      i.unregisterCallback?.(u), await i.invoke("plugin:event|unlisten", {
        event: t,
        eventId: r
      });
    }
  };
}
let p = 0, H = Promise.resolve(), D = Promise.resolve();
const m = (t) => {
  const e = H.then(() => f("custom_plugin_window_ready", { ready: t }));
  return H = e.catch(() => {
  }), e;
};
async function ct(t) {
  const e = await A("otools:custom-open", t, {
    target: { kind: "Webview", label: w()?.metadata?.currentWebview?.label ?? w()?.metadata?.currentWindow?.label ?? "" }
  });
  p += 1;
  try {
    p === 1 && (D = m(!0)), await D;
  } catch (i) {
    throw p -= 1, await e(), i;
  }
  let n = !0;
  return async () => {
    if (n) {
      n = !1, p -= 1;
      try {
        p === 0 && await m(!1);
      } finally {
        await e();
      }
    }
  };
}
async function dt(t, e) {
  let n = v();
  const i = W();
  if (!M() && i && (n = await I()), n) {
    const r = await ut(
      n,
      t,
      e
    );
    if (r !== N)
      return r;
    const s = await at(
      n,
      t,
      e
    );
    if (s !== N)
      return s;
  }
  if (typeof n?.invokeNative != "function") {
    if (E(t))
      return f(t, e);
    const r = b(n);
    if (r && !C(t) && !T(t) && typeof n?.invokeNativePlugin == "function")
      return n.invokeNativePlugin(r, t, e ?? null);
    try {
      return await f(t, e);
    } catch (s) {
      if (E(t) || T(t) || !U(s))
        throw s;
      const a = i || L() ? 1200 : 200, c = await I(a), l = b(c);
      if (l && typeof c?.invokeNativePlugin == "function")
        return c.invokeNativePlugin(l, t, e ?? null);
      if (typeof c?.invokeNative != "function")
        throw s;
      return c.invokeNative(t, e ?? null);
    }
  }
  if (t === "get_init_error")
    return null;
  if (K.has(t))
    return !0;
  if (t === "plugin:event|listen") {
    const r = y(e), s = typeof r?.event == "string" ? r.event : "", a = typeof r?.handler == "number" ? r.handler : NaN;
    if (!s || Number.isNaN(a))
      throw new Error("plugin:event|listen requires event and handler");
    return await G(s, a);
  }
  if (t === "plugin:event|unlisten") {
    const r = y(e), s = typeof r?.eventId == "number" ? r.eventId : NaN;
    Number.isNaN(s) || await V(s);
    return;
  }
  if (E(t) || C(t) || T(t))
    return f(t, e);
  const o = b(n), u = o && typeof n.invokeNativePlugin == "function" ? n.invokeNativePlugin.bind(n) : null;
  if (Y.has(t)) {
    const r = u ? await h(
      () => u(o, t, e ?? null),
      t,
      e
    ) : await h(
      () => n.invokeNative(t, e ?? null),
      t,
      e
    ), s = typeof r?.path == "string" ? r.path : null;
    if (s) {
      X().open(s, t, e);
      return;
    }
    return r;
  }
  if (u) {
    const r = await h(
      () => u(o, t, e ?? null),
      t,
      e
    );
    return O(t, e, r), r;
  }
  try {
    const r = await h(
      () => n.invokeNative(t, e ?? null),
      t,
      e
    );
    return O(t, e, r), r;
  } catch (r) {
    if (!o || typeof n.invokeNativePlugin != "function" || !U(r))
      throw r;
    const s = n.invokeNativePlugin.bind(n), a = await h(
      () => s(o, t, e ?? null),
      t,
      e
    );
    return O(t, e, a), a;
  }
}
async function _t(t, e, n = {}) {
  if (t === "otools:custom-open" && w()?.invoke && window.__OTOOLS_CUSTOM_WINDOW__)
    return ct(e);
  if (w()?.invoke && (S.has(t) || n.target))
    return A(t, e, n);
  if (!w()?.invoke && S.has(t)) {
    const s = (a) => {
      e({ event: t, id: -1, payload: a.detail?.payload });
    };
    return window.addEventListener(g(t), s), () => window.removeEventListener(g(t), s);
  }
  let i = v();
  const o = W();
  if (!M() && o && (i = await I()), typeof i?.invokeNative != "function")
    return A(t, e);
  const u = (s) => {
    const a = s.detail;
    e({
      event: t,
      id: -1,
      payload: a?.payload ?? null
    });
  };
  window.addEventListener(g(t), u);
  const r = await z(t, async (s) => {
    await e({
      event: t,
      id: -1,
      payload: s
    });
  });
  return async () => {
    await r(), window.removeEventListener(
      g(t),
      u
    );
  };
}
async function vt(t, e) {
  if (S.has(t)) {
    await f("plugin:event|emit", { event: t, payload: e ?? null });
    return;
  }
  rt(t, e ?? null);
}
function $(t) {
  return t.shell ?? t.runtime?.shell ?? void 0;
}
function ht(t) {
  const e = v();
  if (!e)
    return !1;
  const n = $(e);
  return typeof n?.openExternal == "function" ? (n.openExternal(t), !0) : (e.shellOpenExternal(t), !0);
}
function pt(t) {
  const e = v();
  if (!e)
    return !1;
  const n = $(e);
  return typeof n?.openPath == "function" ? (n.openPath(t), !0) : (e.shellOpenPath(t), !0);
}
export {
  vt as emit,
  v as getOtoolsApi,
  dt as invoke,
  f as invokeTauri,
  M as isOtoolsPluginRuntime,
  _t as listen,
  A as listenTauri,
  ht as openExternal,
  pt as openPath
};
//# sourceMappingURL=runtime.js.map
