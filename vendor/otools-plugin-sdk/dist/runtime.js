import { attachTransformListener as G, detachTransformListener as V, listenNativeTopic as q } from "./native-event-bridge.js";
import { ensurePopupManager as z } from "./popup-manager.js";
const X = "otools:", Q = "otools-tauri:", J = { kind: "Any" }, O = /* @__PURE__ */ new Set(["crop-images-updated", "otools:custom-open", "otools:deep-link-ready"]), K = /* @__PURE__ */ new Set([
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
), F = /^(get|save|patch)_otools_plugin_(localstate|syncstate)(_value)?(_with_scheme)?$/, w = () => typeof window < "u", L = () => {
  try {
    return typeof __OTOOLS_PLUGIN_UUID__ == "string" ? k(__OTOOLS_PLUGIN_UUID__) : "";
  } catch {
    return "";
  }
}, P = (t) => t.startsWith("plugin:"), C = (t) => F.test(t), Z = "otools_host_", tt = /* @__PURE__ */ new Set([
  "otools_copy_text",
  "otools_ai_switch_status",
  "otools_ai_switch_models",
  "otools_ai_embeddings",
  "otools_ai_speech",
  "otools_ai_transcribe",
  "otools_ai_images",
  "otools_ai_video_submit",
  "otools_ai_video_status",
  "otools_ai_video_content",
  "otools_ai_generate_text",
  "otools_ai_load_chat_history",
  "otools_ai_save_chat_history",
  "hide_panel_window",
  "detach_tools_tab_to_window",
  "open_custom_plugin_window",
  "list_custom_plugin_windows",
  "close_custom_plugin_windows",
  "custom_plugin_window_ready",
  "tools_webview_browse_dialog",
  "tools_webview_list_dir",
  "tools_webview_read_file"
]), E = (t) => t.startsWith(Z) || tt.has(t), k = (t) => {
  const e = String(t ?? "").trim();
  if (!e)
    return "";
  const n = e.lastIndexOf(":");
  if (n <= 0 || n >= e.length - 1)
    return e;
  const i = e.slice(0, n).trim().toLowerCase(), r = e.slice(n + 1).trim();
  return r && (i === "builtin" || i === "market" || i === "dev-debug" || i === "dev-workspace") ? r : e;
}, et = (t) => {
  const e = [], n = String(t ?? "");
  if (n && e.push(n), t && typeof t == "object") {
    const i = t, r = String(i.message ?? ""), u = String(i.code ?? ""), o = String(i.detail ?? "");
    r && e.push(r), u && e.push(u), o && e.push(o);
  }
  return e.join(" | ");
}, U = (t) => {
  const e = et(t).toLowerCase();
  return e ? e.includes("not allowed") || e.includes("command not found") || e.includes("unknown method") || e.includes("unknown command") : !1;
}, nt = (t) => U(t), p = () => {
  if (w())
    for (const t of m()) {
      const e = t.otools ?? t.utools;
      if (e)
        return e;
    }
}, M = () => typeof p()?.invokeNative == "function", m = () => {
  if (!w())
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
  if (!w())
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
  if (!w())
    return;
  const e = Date.now() + t;
  for (; Date.now() <= e; ) {
    for (const n of m()) {
      const i = n.otools ?? n.utools;
      if (typeof i?.invokeNative == "function" || typeof i?.invokeNativePlugin == "function")
        return i;
    }
    await new Promise((n) => {
      window.setTimeout(n, 20);
    });
  }
  return p();
}, T = (t) => {
  const e = k(t?.getPluginUuid?.());
  if (e)
    return e;
  if (!w())
    return L();
  try {
    const n = window.__OToolsEnv, i = k(n?.pluginUuid);
    if (i)
      return i;
    const r = new URLSearchParams(window.location.search || ""), u = k(
      r.get("plugin") || r.get("pluginUuid") || r.get("plugin_uuid") || ""
    );
    if (u)
      return u;
  } catch {
  }
  return L();
}, c = () => {
  if (w())
    return window.__TAURI_INTERNALS__;
}, it = (t) => `${X}${t}`, b = (t) => `${Q}${t}`, H = (t, e) => {
  w() && window.dispatchEvent(
    new CustomEvent(it(t), {
      detail: { payload: e }
    })
  );
}, ot = (t, e) => {
  w() && window.dispatchEvent(
    new CustomEvent(b(t), {
      detail: { payload: e }
    })
  );
}, d = (t) => !t || typeof t != "object" || Array.isArray(t) ? null : t, h = (t, e, n, i = !1) => {
  const r = d(e)?.[n];
  if (typeof r != "string" || !i && !r.trim())
    throw new Error(`${t} requires ${n}`);
  return r;
}, rt = (t) => {
  const e = atob(t), n = new Uint8Array(e.length);
  for (let i = 0; i < e.length; i += 1)
    n[i] = e.charCodeAt(i);
  return new TextDecoder().decode(n);
}, st = (t) => {
  const e = new TextEncoder().encode(t), n = [], i = 32768;
  for (let r = 0; r < e.length; r += i)
    n.push(
      String.fromCharCode(...e.subarray(r, r + i))
    );
  return btoa(n.join(""));
}, ut = async (t, e, n) => {
  if (e === "tools_webview_list_dir" && typeof t.listHostDir == "function")
    return t.listHostDir(h(e, n, "path"));
  if (e === "tools_webview_read_file" && typeof t.readHostFile == "function")
    return t.readHostFile(h(e, n, "path"));
  if (e === "tools_webview_browse_dialog" && typeof t.browseHostDir == "function" && !c()?.invoke) {
    const i = d(d(n)?.request);
    return t.browseHostDir(String(i?.path ?? "").trim());
  }
  if (e === "read_directory_recursive" && typeof t.listHostDir == "function") {
    const i = h(e, n, "path");
    return (await t.listHostDir(i)).filter((u) => !u.name.startsWith(".")).map((u) => {
      const o = u.kind === "directory";
      return {
        id: u.path,
        label: u.name,
        path: u.path,
        is_directory: o,
        isLeaf: !o
      };
    });
  }
  if (e === "read_file_content" && typeof t.readHostFile == "function") {
    const i = h(e, n, "filePath"), r = await t.readHostFile(i);
    return rt(r.dataBase64);
  }
  if (e === "write_file_content" && typeof t.writeHostFile == "function") {
    const i = h(e, n, "filePath"), r = h(e, n, "content", !0);
    return t.writeHostFile({
      path: i,
      dataBase64: st(r)
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
  const i = F.exec(e);
  if (!i)
    return N;
  const [, r, u, o, s] = i, a = `${r}Plugin${u === "localstate" ? "Local" : "Sync"}State${o ? "Value" : ""}`, f = t[a];
  if (typeof f != "function")
    return N;
  const l = d(n), j = typeof l?.plugin == "string" ? l.plugin : void 0, B = s && typeof l?.scheme == "string" ? l.scheme : null, v = [j];
  return r === "get" ? o && v.push(l?.key) : r === "patch" ? v.push(l?.patch ?? {}) : o ? v.push(l?.key, l?.value ?? null) : v.push(l?.state ?? null), v.push(B), f.apply(
    t,
    v
  );
}, S = (t, e, n) => {
  const i = d(e);
  t === "switch_provider" && i?.app && i?.id && H("provider-switched", {
    appType: i.app,
    providerId: i.id,
    source: "native-plugin",
    result: n
  }), t === "sync_universal_provider" && i?.id && H("universal-provider-synced", {
    id: i.id,
    result: n
  });
}, _ = async (t, e) => {
  const n = c();
  if (!n?.invoke)
    throw new Error("Tauri runtime is unavailable");
  return n.invoke(
    t,
    e
  );
}, g = async (t, e, n) => {
  try {
    return await t();
  } catch (i) {
    if (!nt(i) || !c()?.invoke)
      throw i;
    return _(e, n);
  }
}, lt = (t) => t && typeof t == "object" && "payload" in t ? t.payload ?? null : t;
async function A(t, e, n = {}) {
  const i = c();
  if (!i?.invoke || !i.transformCallback)
    throw new Error("Tauri event runtime is unavailable");
  let r = !0;
  const u = i.transformCallback((a) => {
    r && e({
      event: t,
      id: a && typeof a == "object" && "id" in a ? Number(a.id) : -1,
      payload: lt(a)
    });
  }, !1);
  let o;
  try {
    o = await i.invoke("plugin:event|listen", {
      event: t,
      target: typeof n.target == "string" ? { kind: "AnyLabel", label: n.target } : n.target ?? J,
      handler: u
    });
  } catch (a) {
    throw i.unregisterCallback?.(u), a;
  }
  return async () => {
    if (r) {
      r = !1;
      try {
        await window.__TAURI_EVENT_PLUGIN_INTERNALS__?.unregisterListener?.(
          t,
          o
        );
      } catch {
      }
      i.unregisterCallback?.(u), await i.invoke("plugin:event|unlisten", {
        event: t,
        eventId: o
      });
    }
  };
}
let y = 0, D = Promise.resolve(), R = Promise.resolve();
const x = (t) => {
  const e = D.then(() => _("custom_plugin_window_ready", { ready: t }));
  return D = e.catch(() => {
  }), e;
};
async function ct(t) {
  const e = await A("otools:custom-open", t, {
    target: { kind: "Webview", label: c()?.metadata?.currentWebview?.label ?? c()?.metadata?.currentWindow?.label ?? "" }
  });
  y += 1;
  try {
    y === 1 && (R = x(!0)), await R;
  } catch (i) {
    throw y -= 1, await e(), i;
  }
  let n = !0;
  return async () => {
    if (n) {
      n = !1, y -= 1;
      try {
        y === 0 && await x(!1);
      } finally {
        await e();
      }
    }
  };
}
async function wt(t, e) {
  let n = p();
  const i = W();
  if (!M() && i && (n = await I()), n) {
    const o = await ut(
      n,
      t,
      e
    );
    if (o !== N)
      return o;
    const s = await at(
      n,
      t,
      e
    );
    if (s !== N)
      return s;
  }
  if (typeof n?.invokeNative != "function") {
    if (P(t))
      return _(t, e);
    const o = T(n);
    if (o && !C(t) && !E(t) && typeof n?.invokeNativePlugin == "function")
      return n.invokeNativePlugin(o, t, e ?? null);
    try {
      return await _(t, e);
    } catch (s) {
      if (P(t) || E(t) || !U(s))
        throw s;
      const a = i || L() ? 1200 : 200, f = await I(a), l = T(f);
      if (l && typeof f?.invokeNativePlugin == "function")
        return f.invokeNativePlugin(l, t, e ?? null);
      if (typeof f?.invokeNative != "function")
        throw s;
      return f.invokeNative(t, e ?? null);
    }
  }
  if (t === "get_init_error")
    return null;
  if (K.has(t))
    return !0;
  if (t === "plugin:event|listen") {
    const o = d(e), s = typeof o?.event == "string" ? o.event : "", a = typeof o?.handler == "number" ? o.handler : NaN;
    if (!s || Number.isNaN(a))
      throw new Error("plugin:event|listen requires event and handler");
    return await G(s, a);
  }
  if (t === "plugin:event|unlisten") {
    const o = d(e), s = typeof o?.eventId == "number" ? o.eventId : NaN;
    Number.isNaN(s) || await V(s);
    return;
  }
  if (P(t) || C(t) || E(t))
    return _(t, e);
  const r = T(n), u = r && typeof n.invokeNativePlugin == "function" ? n.invokeNativePlugin.bind(n) : null;
  if (Y.has(t)) {
    const o = u ? await g(
      () => u(r, t, e ?? null),
      t,
      e
    ) : await g(
      () => n.invokeNative(t, e ?? null),
      t,
      e
    ), s = typeof o?.path == "string" ? o.path : null;
    if (s) {
      z().open(s, t, e);
      return;
    }
    return o;
  }
  if (u) {
    const o = await g(
      () => u(r, t, e ?? null),
      t,
      e
    );
    return S(t, e, o), o;
  }
  try {
    const o = await g(
      () => n.invokeNative(t, e ?? null),
      t,
      e
    );
    return S(t, e, o), o;
  } catch (o) {
    if (!r || typeof n.invokeNativePlugin != "function" || !U(o))
      throw o;
    const s = n.invokeNativePlugin.bind(n), a = await g(
      () => s(r, t, e ?? null),
      t,
      e
    );
    return S(t, e, a), a;
  }
}
async function dt(t, e, n = {}) {
  if (t === "otools:custom-open" && c()?.invoke && window.__OTOOLS_CUSTOM_WINDOW__)
    return ct(e);
  if (c()?.invoke && (O.has(t) || n.target))
    return A(t, e, n);
  if (!c()?.invoke && O.has(t)) {
    const s = (a) => {
      e({ event: t, id: -1, payload: a.detail?.payload });
    };
    return window.addEventListener(b(t), s), () => window.removeEventListener(b(t), s);
  }
  let i = p();
  const r = W();
  if (!M() && r && (i = await I()), typeof i?.invokeNative != "function")
    return A(t, e);
  const u = (s) => {
    const a = s.detail;
    e({
      event: t,
      id: -1,
      payload: a?.payload ?? null
    });
  };
  window.addEventListener(b(t), u);
  const o = await q(t, async (s) => {
    await e({
      event: t,
      id: -1,
      payload: s
    });
  });
  return async () => {
    await o(), window.removeEventListener(
      b(t),
      u
    );
  };
}
async function vt(t, e) {
  if (O.has(t)) {
    await _("plugin:event|emit", { event: t, payload: e ?? null });
    return;
  }
  ot(t, e ?? null);
}
function $(t) {
  return t.shell ?? t.runtime?.shell ?? void 0;
}
function ht(t) {
  const e = p();
  if (!e)
    return !1;
  const n = $(e);
  return typeof n?.openExternal == "function" ? (n.openExternal(t), !0) : (e.shellOpenExternal(t), !0);
}
function pt(t) {
  const e = p();
  if (!e)
    return !1;
  const n = $(e);
  return typeof n?.openPath == "function" ? (n.openPath(t), !0) : (e.shellOpenPath(t), !0);
}
export {
  vt as emit,
  p as getOtoolsApi,
  wt as invoke,
  _ as invokeTauri,
  M as isOtoolsPluginRuntime,
  dt as listen,
  A as listenTauri,
  ht as openExternal,
  pt as openPath
};
//# sourceMappingURL=runtime.js.map
