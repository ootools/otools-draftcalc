function G(M) {
  const O = (r) => M.invoke("tools_webview_browse_dialog", {
    request: { path: r ?? "" }
  }), R = (r, s) => {
    if (!s?.length || r.kind === "directory")
      return !0;
    const H = r.name.includes(".") ? r.name.split(".").pop().toLowerCase() : "";
    return s.some(
      (N) => N.extensions.some((g) => g.trim().toLowerCase().replace(/^\./, "") === H)
    );
  };
  function K() {
    if (document.getElementById("otools-host-tree-style"))
      return;
    const r = document.createElement("style");
    r.id = "otools-host-tree-style", r.textContent = Y, document.head.appendChild(r);
  }
  async function U(r) {
    if (typeof document > "u" || !document.body)
      throw new Error("pickFromHostTree requires a DOM document");
    const s = !!r.directory, H = !!r.multiple && !s, N = r.title ?? (s ? "选择目录" : "选择文件");
    let g = !!r.showHidden, T = null;
    return new Promise((W) => {
      let m = "", $ = r.startPath ?? "", f = !1, v = !1, P = 0;
      const d = /* @__PURE__ */ new Set();
      K();
      const b = document.createElement("div");
      b.setAttribute("data-host-tree", ""), b.className = "otools-host-tree-overlay";
      const c = document.createElement("div");
      c.className = "otools-host-tree-panel", c.setAttribute("role", "dialog"), c.setAttribute("aria-modal", "true"), c.setAttribute("aria-label", N), b.appendChild(c);
      const z = document.createElement("div");
      z.className = "otools-host-tree-header";
      const q = document.createElement("div");
      q.className = "otools-host-tree-title", q.textContent = N, z.appendChild(q);
      const L = document.createElement("div");
      L.className = "otools-host-tree-path", z.appendChild(L), c.appendChild(z);
      const p = document.createElement("div");
      p.className = "otools-host-tree-status", p.setAttribute("role", "status"), p.hidden = !0;
      const _ = document.createElement("span");
      _.setAttribute("data-host-tree-error", "");
      const y = document.createElement("button");
      y.type = "button", y.className = "otools-host-tree-btn", y.textContent = "重试", y.setAttribute("data-host-tree-retry", ""), p.appendChild(_), p.appendChild(y), c.appendChild(p);
      const n = document.createElement("div");
      n.className = "otools-host-tree-body", c.appendChild(n);
      const w = document.createElement("div");
      w.className = "otools-host-tree-footer";
      const A = document.createElement("label");
      A.className = "otools-host-tree-toggle", A.title = "显示或隐藏以 . 开头的文件（如 .git、.env）";
      const k = document.createElement("input");
      k.type = "checkbox", k.checked = g, k.setAttribute("data-host-tree-show-hidden", ""), A.appendChild(k), A.appendChild(document.createTextNode("显示隐藏文件")), w.appendChild(A);
      const x = document.createElement("div");
      x.className = "otools-host-tree-selection", x.setAttribute("data-host-tree-selection", ""), x.setAttribute("role", "status"), x.textContent = s ? "请选择目录" : "请选择文件", w.appendChild(x);
      const C = document.createElement("button");
      C.type = "button", C.textContent = "取消", C.className = "otools-host-tree-btn", C.setAttribute("data-host-tree-cancel", "");
      const h = document.createElement("button");
      h.type = "button", h.textContent = s ? "选择此目录" : "选择", h.className = "otools-host-tree-btn otools-host-tree-btn-primary", h.setAttribute("data-host-tree-confirm", ""), h.disabled = !0, w.appendChild(C), w.appendChild(h), c.appendChild(w);
      const S = () => {
        h.disabled = !f || (s ? !m : !d.size), L.classList.toggle("otools-host-tree-current", s && f && !!m), x.textContent = s && f ? `已选目录：${m}` : d.size ? `已选 ${d.size} 个文件` : s ? "请选择目录" : "请选择文件", x.title = s && f ? m : "";
      }, B = (t) => {
        v || (v = !0, P += 1, window.removeEventListener("keydown", I, !0), b.remove(), W(t));
      }, I = (t) => {
        t.key === "Escape" && (t.preventDefault(), t.stopImmediatePropagation(), B({ kind: "cancelled", source: "host-tree", paths: [], names: [] }));
      };
      window.addEventListener("keydown", I, !0), b.addEventListener("mousedown", (t) => {
        t.target === b && B({ kind: "cancelled", source: "host-tree", paths: [], names: [] });
      }), C.addEventListener(
        "click",
        () => B({ kind: "cancelled", source: "host-tree", paths: [], names: [] })
      ), h.addEventListener("click", () => {
        if (h.disabled) return;
        const t = s ? [m] : Array.from(d);
        B({
          kind: "picked",
          source: "host-tree",
          paths: t,
          names: t.map((a) => a.split(/[\\/]/).filter(Boolean).pop() || a)
        });
      });
      const D = (t) => {
        if (!t || typeof t.currentPath != "string" || !t.currentPath || !Array.isArray(t.roots) || !Array.isArray(t.entries))
          throw new Error("宿主返回的目录数据无效");
        if (m = t.currentPath, T = t, L.textContent = m, n.replaceChildren(), t.parentPath) {
          const e = document.createElement("div");
          e.className = "otools-host-tree-entry otools-host-tree-up", e.setAttribute("data-host-tree-up", ""), e.setAttribute("data-path", t.parentPath), e.setAttribute("data-kind", "directory"), e.textContent = "↑ 上一级", n.appendChild(e);
        }
        for (const e of t.roots) {
          const o = document.createElement("div");
          o.className = "otools-host-tree-entry otools-host-tree-root", o.setAttribute("data-host-tree-root", ""), o.setAttribute("data-path", e.path), o.setAttribute("data-kind", "directory"), o.textContent = `📁 ${e.name}  (${e.path})`, n.appendChild(o);
        }
        const a = (e) => e.name.startsWith("."), i = t.entries.filter(
          (e) => e.kind === "file" || e.kind === "directory"
        ), l = i.filter(a).length, u = i.filter(
          (e) => (g || !a(e)) && R(e, r.filters)
        );
        for (const e of u) {
          const o = document.createElement("div");
          o.className = "otools-host-tree-entry", o.setAttribute("data-host-tree-entry", ""), o.setAttribute("data-path", e.path), o.setAttribute("data-kind", e.kind);
          const F = document.createElement("span");
          if (F.className = "otools-host-tree-entry-label", F.textContent = e.kind === "directory" ? `📁 ${e.name}` : `📄 ${e.name}`, o.appendChild(F), !s && e.kind === "file") {
            o.setAttribute("aria-selected", "false");
            const E = document.createElement("span");
            E.className = "otools-host-tree-check", E.setAttribute("data-host-tree-check", ""), E.setAttribute("aria-hidden", "true"), E.textContent = "✓", E.hidden = !0, o.appendChild(E);
          }
          n.appendChild(o);
        }
        if (!u.length) {
          const e = document.createElement("div");
          e.className = "otools-host-tree-empty", e.textContent = l > 0 && !g ? `该目录只有 ${l} 个隐藏项，勾选「显示隐藏文件」查看` : "该目录为空", n.appendChild(e);
        }
      }, j = async (t) => {
        if (v) return;
        const a = ++P;
        $ = t, f = !1, d.clear(), S(), p.hidden = !0, n.replaceChildren();
        const i = document.createElement("div");
        i.className = "otools-host-tree-empty", i.textContent = "正在读取目录…", n.appendChild(i);
        try {
          const l = await O(t);
          if (v || a !== P) return;
          D(l), f = !0, S();
        } catch (l) {
          if (v || a !== P) return;
          n.replaceChildren(), _.textContent = `无法读取宿主目录：${l instanceof Error ? l.message : String(l)}`, p.hidden = !1;
        }
      };
      y.addEventListener("click", () => {
        j($);
      }), k.addEventListener("change", () => {
        g = k.checked, T && D(T), S();
      }), n.addEventListener("click", (t) => {
        if (!f || !(t.target instanceof Element)) return;
        const a = t.target.closest(
          "[data-host-tree-entry],[data-host-tree-root],[data-host-tree-up]"
        );
        if (!a || !n.contains(a)) return;
        const i = a.getAttribute("data-path") || "", l = a.getAttribute("data-kind");
        i && (l === "directory" ? j(i) : !s && l === "file" && (H ? d.has(i) ? d.delete(i) : d.add(i) : (d.clear(), d.add(i)), n.querySelectorAll("[data-host-tree-entry]").forEach((u) => {
          const e = d.has(u.getAttribute("data-path") || "");
          u.classList.toggle("otools-host-tree-selected", e), u.getAttribute("data-kind") === "file" && u.setAttribute("aria-selected", String(e));
          const o = u.querySelector("[data-host-tree-check]");
          o && (o.hidden = !e);
        }), S()));
      }), document.body.appendChild(b), j($);
    });
  }
  return U;
}
const Y = `
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
.otools-host-tree-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  font-size: 13px;
  color: #b42318;
}
.otools-host-tree-status[hidden] { display: none; }
.otools-host-tree-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 6px 8px;
  min-height: 220px;
}
.otools-host-tree-entry {
  display: flex;
  align-items: center;
  gap: 8px;
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
  background: #dbeafe !important;
  color: #174ea6 !important;
  box-shadow: inset 3px 0 #2563eb;
  font-weight: 600;
}
.otools-host-tree-entry-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.otools-host-tree-check { color: #174ea6; font-weight: 700; }
.otools-host-tree-check[hidden] { display: none; }
.otools-host-tree-current {
  background: #dbeafe;
  color: #174ea6;
  border-radius: 6px;
  padding: 6px 8px;
}
.otools-host-tree-selection {
  flex: 1;
  min-width: 0;
  color: #174ea6;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.otools-host-tree-empty {
  padding: 18px 10px;
  text-align: center;
  color: #9a9aa0;
  font-size: 13px;
}
.otools-host-tree-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #ececec;
}
.otools-host-tree-toggle {
  margin-right: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4a4a4f;
  cursor: pointer;
  user-select: none;
}
.otools-host-tree-toggle input {
  margin: 0;
  cursor: pointer;
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
  G as createHostTreePicker
};
//# sourceMappingURL=host-tree-factory.js.map
