import { capture as Q } from "./capture.js";
import { createOtoolsAliasMap as tt } from "./aliases.js";
import { otoolsTauriShimPlugin as ot } from "./vite.js";
import { listen as S, invoke as x, listenTauri as L, invokeTauri as N } from "./runtime.js";
import { emit as rt, getOtoolsApi as st, isOtoolsPluginRuntime as it, openExternal as at, openPath as lt } from "./runtime.js";
import { pickDirectory as dt, pickFile as pt, pickFiles as ut, pickZipFile as ft, saveFile as ht } from "./dialog.js";
import { CaptureError as wt, createCaptureApi as gt } from "./capture-factory.js";
function E() {
  if (!(typeof window > "u"))
    return window.otools ?? window.utools;
}
async function j(e, t) {
  const o = String(e ?? "").trim();
  if (!o)
    return;
  const r = E();
  if (r?.shellOpen) {
    await r.shellOpen(o, t);
    return;
  }
  if (r?.shellOpenExternal && /^https?:\/\//i.test(o)) {
    r.shellOpenExternal(o);
    return;
  }
  if (r?.shellOpenPath) {
    r.shellOpenPath(o);
    return;
  }
  typeof window < "u" && window.open(o, "_blank", "noopener,noreferrer");
}
async function q(e) {
  const t = String(e ?? "").trim();
  if (!t)
    return;
  const o = E();
  if (o?.shellOpenPath) {
    o.shellOpenPath(t);
    return;
  }
}
async function W(e) {
  const t = String(e ?? "").trim();
  if (!t)
    return;
  const o = E();
  if (o?.shellOpenExternal) {
    o.shellOpenExternal(t);
    return;
  }
  typeof window < "u" && window.open(t, "_blank", "noopener,noreferrer");
}
const T = "otools-open-file", O = 3e3;
function F(e) {
  if (!e)
    return [];
  try {
    const o = new URLSearchParams(e).get("otoolsOpenFile");
    if (!o)
      return [];
    const r = JSON.parse(o);
    return Array.isArray(r) ? r.map((s) => String(s || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}
function U(e) {
  return e.map((t) => {
    const o = String(t || "").trim(), r = o.split(/[\\/]/), s = r[r.length - 1] || o, p = s.lastIndexOf("."), i = p > 0 ? s.slice(p + 1).toLowerCase() : "";
    return { path: o, name: s, ext: i };
  });
}
function D() {
  if (typeof window < "u")
    try {
      const e = window.__OToolsEnv, t = typeof e?.pluginUuid == "string" ? e.pluginUuid.trim() : "";
      if (t)
        return t;
      const o = new URLSearchParams(window.location?.search || ""), r = (o.get("plugin") || o.get("pluginUuid") || o.get("plugin_uuid") || "").trim();
      if (r)
        return r;
    } catch {
    }
  return "";
}
async function K(e) {
  const t = /* @__PURE__ */ new Map(), o = (i) => {
    const l = Date.now(), u = [];
    for (const m of i) {
      const w = String(m || "").trim();
      if (!w)
        continue;
      const f = t.get(w);
      typeof f == "number" && l - f < O || (t.set(w, l), u.push(w));
    }
    if (t.size > 256)
      for (const [m, w] of t)
        l - w >= O && t.delete(m);
    u.length && e(U(u));
  }, r = async () => {
    const i = D();
    if (!i)
      return;
    let l = [];
    try {
      const u = await x("otools_consume_open_files", { pluginUuid: i });
      l = Array.isArray(u) ? u.map(String) : [];
    } catch {
      return;
    }
    o(l);
  }, s = await S(T, () => {
    r();
  }), p = F(
    typeof window < "u" && window.location?.search || ""
  );
  return p.length && o(p), r(), s;
}
const H = "otools-keyword-dispatch";
function C() {
  if (typeof window < "u")
    try {
      const e = window.__OToolsEnv, t = typeof e?.pluginUuid == "string" ? e.pluginUuid.trim() : "";
      if (t)
        return t;
      const o = new URLSearchParams(window.location?.search || ""), r = (o.get("plugin") || o.get("pluginUuid") || o.get("plugin_uuid") || "").trim();
      if (r)
        return r;
    } catch {
    }
  return "";
}
const _ = /* @__PURE__ */ new Map();
async function V(e) {
  const t = C(), o = typeof window > "u" ? void 0 : window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label, r = JSON.stringify([t.toLowerCase(), o || ""]), s = _.get(r) || { entries: [], consuming: null };
  _.set(r, s);
  const p = s.consuming, i = /* @__PURE__ */ new Set();
  let l = !1, u = !1, m = null;
  const w = (h) => {
    const c = [];
    for (const y of h) {
      if (!y || typeof y != "object")
        continue;
      const g = y;
      typeof g.id != "string" || !g.id.trim() || typeof g.keyword != "string" || !g.keyword.trim() || i.has(g.id) || (i.add(g.id), c.push(g));
    }
    if (i.size > 512) {
      const y = Array.from(i).slice(-256);
      i.clear();
      for (const g of y)
        i.add(g);
    }
    c.length && !l && e(c);
  }, f = () => (u = !0, m || (m = (async () => {
    for (; u && !l; ) {
      if (u = !1, !t)
        return;
      if (!s.consuming) {
        const h = o ? { pluginUuid: t, targetLabel: o } : { pluginUuid: t };
        s.consuming = N("otools_consume_keyword_dispatch", h).then((c) => {
          Array.isArray(c) && s.entries.push(...c);
        }).finally(() => {
          s.consuming = null;
        });
      }
      try {
        await s.consuming;
      } catch {
        continue;
      }
      if (!l) {
        const h = s.entries;
        s.entries = [], w(h);
      }
    }
  })().finally(() => {
    m = null;
  }), m)), b = await L(H, (h) => {
    const c = h?.payload;
    !l && (typeof c != "string" || c.toLowerCase() === C().toLowerCase()) && f();
  });
  return p ? p.catch(() => {
  }).then(() => {
    l || f();
  }) : f(), async () => {
    l = !0, u = !1, await b();
  };
}
async function A(e) {
  return x("browse_dialog", { path: e ?? "" });
}
async function J(e) {
  const t = String(e ?? "").trim();
  if (!t)
    throw new Error("listHostDir requires path");
  return x("read_directory_recursive", { path: t });
}
async function Y(e) {
  const t = String(e ?? "").trim();
  if (!t)
    throw new Error("readHostFile requires path");
  return x("read_file_content", { filePath: t });
}
const I = (e, t) => {
  if (!t?.length || e.kind === "directory")
    return !0;
  const o = e.name.includes(".") ? e.name.split(".").pop().toLowerCase() : "";
  return t.some(
    (r) => r.extensions.some((s) => s.trim().toLowerCase().replace(/^\./, "") === o)
  );
};
function z() {
  if (document.getElementById("otools-host-tree-style"))
    return;
  const e = document.createElement("style");
  e.id = "otools-host-tree-style", e.textContent = M, document.head.appendChild(e);
}
async function R(e) {
  if (typeof document > "u" || !document.body)
    throw new Error("pickFromHostTree requires a DOM document");
  const t = !!e.directory, o = e.title ?? (t ? "选择目录" : "选择文件");
  return new Promise((r) => {
    let s = e.startPath ?? "", p = null;
    z();
    const i = document.createElement("div");
    i.setAttribute("data-host-tree", ""), i.className = "otools-host-tree-overlay";
    const l = document.createElement("div");
    l.className = "otools-host-tree-panel", i.appendChild(l);
    const u = document.createElement("div");
    u.className = "otools-host-tree-header";
    const m = document.createElement("div");
    m.className = "otools-host-tree-title", m.textContent = o, u.appendChild(m);
    const w = document.createElement("div");
    w.className = "otools-host-tree-path", u.appendChild(w), l.appendChild(u);
    const f = document.createElement("div");
    f.className = "otools-host-tree-body", l.appendChild(f);
    const b = document.createElement("div");
    b.className = "otools-host-tree-footer";
    const h = document.createElement("button");
    h.type = "button", h.textContent = "取消", h.className = "otools-host-tree-btn", h.setAttribute("data-host-tree-cancel", "");
    const c = document.createElement("button");
    c.type = "button", c.textContent = t ? "选择此目录" : "选择", c.className = "otools-host-tree-btn otools-host-tree-btn-primary", c.setAttribute("data-host-tree-confirm", ""), c.disabled = !t && !p, b.appendChild(h), b.appendChild(c), l.appendChild(b);
    const y = (a) => {
      window.removeEventListener("keydown", g, !0), i.remove(), r(a);
    }, g = (a) => {
      a.key === "Escape" && (a.preventDefault(), y({ kind: "cancelled", source: "host-tree", paths: [], names: [] }));
    };
    window.addEventListener("keydown", g, !0), i.addEventListener("mousedown", (a) => {
      a.target === i && y({ kind: "cancelled", source: "host-tree", paths: [], names: [] });
    }), h.addEventListener(
      "click",
      () => y({ kind: "cancelled", source: "host-tree", paths: [], names: [] })
    ), c.addEventListener("click", () => {
      if (t) {
        const a = s.split(/[\\/]/).pop() || s;
        y({
          kind: "picked",
          source: "host-tree",
          paths: [s],
          names: [a]
        });
      } else if (p) {
        const a = p.split(/[\\/]/).pop() || p;
        y({
          kind: "picked",
          source: "host-tree",
          paths: [p],
          names: [a]
        });
      }
    });
    const k = (a) => {
      if (a.currentPath && (s = a.currentPath), w.textContent = s || "（根）", f.innerHTML = "", a.parentPath) {
        const n = document.createElement("div");
        n.className = "otools-host-tree-entry otools-host-tree-up", n.setAttribute("data-host-tree-up", ""), n.setAttribute("data-path", a.parentPath), n.setAttribute("data-kind", "directory"), n.textContent = "↑ 上一级", f.appendChild(n);
      }
      for (const n of a.roots) {
        const d = document.createElement("div");
        d.className = "otools-host-tree-entry otools-host-tree-root", d.setAttribute("data-host-tree-root", ""), d.setAttribute("data-path", n.path), d.setAttribute("data-kind", "directory"), d.textContent = `📁 ${n.name}  (${n.path})`, f.appendChild(d);
      }
      const v = a.entries.filter(
        (n) => I(n, e.filters)
      );
      for (const n of v) {
        const d = document.createElement("div");
        d.className = "otools-host-tree-entry", d.setAttribute("data-host-tree-entry", ""), d.setAttribute("data-path", n.path), d.setAttribute("data-kind", n.kind), d.textContent = n.kind === "directory" ? `📁 ${n.name}` : `📄 ${n.name}`, !t && p === n.path && d.classList.add("otools-host-tree-selected"), f.appendChild(d);
      }
      if (!a.parentPath && !a.roots.length && !v.length) {
        const n = document.createElement("div");
        n.className = "otools-host-tree-empty", n.textContent = "该目录为空", f.appendChild(n);
      }
    };
    f.addEventListener("click", (a) => {
      const n = a.target.closest(
        "[data-host-tree-entry],[data-host-tree-root],[data-host-tree-up]"
      );
      if (!n)
        return;
      const d = n.getAttribute("data-path") || "";
      n.getAttribute("data-kind") === "directory" || n.hasAttribute("data-host-tree-root") || n.hasAttribute("data-host-tree-up") ? A(d).then(k).catch(() => {
      }) : (p = d, c.disabled = !1, f.querySelectorAll(".otools-host-tree-selected").forEach((P) => P.classList.remove("otools-host-tree-selected")), n.classList.add("otools-host-tree-selected"));
    }), document.body.appendChild(i), A(s || void 0).then(k).catch(() => {
      w.textContent = "无法读取宿主目录";
    });
  });
}
typeof window < "u" && (window.__otoolsHostTree = R);
const M = `
.otools-host-tree-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483000;
  font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
.otools-host-tree-panel {
  width: min(560px, 90vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  color: #1d1d1f;
}
.otools-host-tree-header {
  padding: 14px 18px 10px;
  border-bottom: 1px solid #ececec;
}
.otools-host-tree-title {
  font-size: 15px;
  font-weight: 600;
}
.otools-host-tree-path {
  margin-top: 4px;
  font-size: 12px;
  color: #6b6b70;
  word-break: break-all;
}
.otools-host-tree-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 6px 8px;
  min-height: 220px;
}
.otools-host-tree-entry {
  padding: 7px 10px;
  border-radius: 7px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.otools-host-tree-entry:hover {
  background: #f2f2f4;
}
.otools-host-tree-up,
.otools-host-tree-root {
  color: #2b6fff;
}
.otools-host-tree-selected {
  background: #e3edff !important;
  color: #1b4fd6;
}
.otools-host-tree-empty {
  padding: 18px 10px;
  text-align: center;
  color: #9a9aa0;
  font-size: 13px;
}
.otools-host-tree-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #ececec;
}
.otools-host-tree-btn {
  padding: 7px 16px;
  border: 1px solid #d6d6da;
  border-radius: 8px;
  background: #f7f7f9;
  font-size: 13px;
  cursor: pointer;
}
.otools-host-tree-btn-primary {
  background: #2b6fff;
  border-color: #2b6fff;
  color: #fff;
}
.otools-host-tree-btn-primary:disabled {
  background: #b9c8ee;
  border-color: #b9c8ee;
  cursor: not-allowed;
}
`;
export {
  wt as CaptureError,
  T as OTOOLS_FILE_DELIVER_EVENT,
  H as OTOOLS_KEYWORD_DISPATCH_EVENT,
  A as browseHostDir,
  Q as capture,
  gt as createCaptureApi,
  tt as createOtoolsAliasMap,
  rt as emit,
  st as getOtoolsApi,
  x as invoke,
  it as isOtoolsPluginRuntime,
  J as listHostDir,
  S as listen,
  V as onOtoolsKeyword,
  K as onOtoolsOpenFile,
  at as openExternal,
  lt as openPath,
  ot as otoolsTauriShimPlugin,
  F as parseLaunchOpenFiles,
  dt as pickDirectory,
  pt as pickFile,
  ut as pickFiles,
  R as pickFromHostTree,
  ft as pickZipFile,
  Y as readHostFile,
  ht as saveFile,
  j as shellOpen,
  W as shellOpenExternal,
  q as shellOpenPath,
  U as toOpenFileEntries
};
//# sourceMappingURL=index.js.map
