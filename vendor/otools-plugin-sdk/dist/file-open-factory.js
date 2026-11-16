const m = "otools-open-file";
function h(n) {
  if (!n)
    return [];
  try {
    const t = new URLSearchParams(n).get("otoolsOpenFile");
    if (!t)
      return [];
    const o = JSON.parse(t);
    return Array.isArray(o) ? o.map((e) => String(e || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}
function w(n) {
  return n.map((i) => {
    const t = String(i || "").trim(), o = t.split(/[\\/]/), e = o[o.length - 1] || t, a = e.lastIndexOf("."), u = a > 0 ? e.slice(a + 1).toLowerCase() : "";
    return { path: t, name: e, ext: u };
  });
}
const E = () => {
  if (typeof window > "u")
    return "";
  try {
    const n = window.__OToolsEnv, i = typeof n?.pluginUuid == "string" ? n.pluginUuid.trim() : "";
    if (i)
      return i;
    const t = new URLSearchParams(window.location?.search || ""), o = (t.get("plugin") || t.get("pluginUuid") || t.get("plugin_uuid") || "").trim();
    if (o)
      return o;
  } catch {
  }
  return "";
};
function O(n) {
  const i = n.resolvePluginUuid ?? E;
  return async function(o) {
    const e = /* @__PURE__ */ new Map(), a = (l) => {
      const r = Date.now(), s = [];
      for (const f of l) {
        const c = String(f || "").trim();
        if (!c)
          continue;
        const d = e.get(c);
        typeof d == "number" && r - d < 3e3 || (e.set(c, r), s.push(c));
      }
      if (e.size > 256)
        for (const [f, c] of e)
          r - c >= 3e3 && e.delete(f);
      s.length && o(w(s));
    }, u = async () => {
      const l = i();
      if (!l)
        return;
      let r = [];
      try {
        const s = await n.invoke("otools_consume_open_files", { pluginUuid: l });
        r = Array.isArray(s) ? s.map(String) : [];
      } catch {
        return;
      }
      a(r);
    }, g = await n.listen(m, () => {
      u();
    }), p = h(
      typeof window < "u" && window.location?.search || ""
    );
    return p.length && a(p), u(), g;
  };
}
export {
  m as OTOOLS_FILE_DELIVER_EVENT,
  O as createFileOpenListener,
  h as parseLaunchOpenFiles,
  w as toOpenFileEntries
};
//# sourceMappingURL=file-open-factory.js.map
