const L = "otools-keyword-dispatch", b = () => {
  if (typeof window > "u")
    return "";
  try {
    const i = window.__OToolsEnv, c = typeof i?.pluginUuid == "string" ? i.pluginUuid.trim() : "";
    if (c)
      return c;
    const a = new URLSearchParams(window.location?.search || ""), u = (a.get("plugin") || a.get("pluginUuid") || a.get("plugin_uuid") || "").trim();
    if (u)
      return u;
  } catch {
  }
  return "";
}, U = () => {
  if (typeof window > "u")
    return "";
  try {
    return window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label ?? "";
  } catch {
    return "";
  }
};
function T(i) {
  const c = i.resolvePluginUuid ?? b, a = i.getTargetLabel ?? U, u = /* @__PURE__ */ new Map();
  return async function(h) {
    const f = c(), w = a(), m = JSON.stringify([f.toLowerCase(), w || ""]), e = u.get(m) || { entries: [], consuming: null };
    u.set(m, e);
    const p = e.consuming, r = /* @__PURE__ */ new Set();
    let s = !1, g = !1, l = null;
    const v = (o) => {
      const n = [];
      for (const d of o) {
        if (!d || typeof d != "object")
          continue;
        const t = d;
        typeof t.id != "string" || !t.id.trim() || typeof t.keyword != "string" || !t.keyword.trim() || r.has(t.id) || (r.add(t.id), n.push(t));
      }
      if (r.size > 512) {
        const d = Array.from(r).slice(-256);
        r.clear();
        for (const t of d)
          r.add(t);
      }
      n.length && !s && h(n);
    }, y = () => (g = !0, l || (l = (async () => {
      for (; g && !s; ) {
        if (g = !1, !f)
          return;
        if (!e.consuming) {
          const o = w ? { pluginUuid: f, targetLabel: w } : { pluginUuid: f };
          e.consuming = i.invoke("otools_consume_keyword_dispatch", o).then((n) => {
            Array.isArray(n) && e.entries.push(...n);
          }).finally(() => {
            e.consuming = null;
          });
        }
        try {
          await e.consuming;
        } catch {
          continue;
        }
        if (!s) {
          const o = e.entries;
          e.entries = [], v(o);
        }
      }
    })().finally(() => {
      l = null;
    }), l)), _ = await i.listen(L, (o) => {
      const n = o?.payload;
      !s && (typeof n != "string" || n.toLowerCase() === c().toLowerCase()) && y();
    });
    return p ? p.catch(() => {
    }).then(() => {
      s || y();
    }) : y(), async () => {
      s = !0, g = !1, await _();
    };
  };
}
export {
  L as OTOOLS_KEYWORD_DISPATCH_EVENT,
  T as createKeywordListener
};
//# sourceMappingURL=keyword-factory.js.map
