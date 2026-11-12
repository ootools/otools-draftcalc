const r = "__OTOOLS_POPUP_MANAGER__", f = "data-otools-popup-id", b = "data-otools-popup-target", h = "data-otools-popup-label", w = "data-otools-popup-window-id";
function x(e, t) {
  try {
    return new URL(e).toString();
  } catch {
    return new URL(e, t.location.href).toString();
  }
}
function P() {
  if (typeof window > "u") return;
  const e = window.frameElement, t = e?.dataset.otoolsPopupLabel, o = e?.dataset.otoolsPopupWindowId;
  return t && o ? { label: t, windowId: o } : void 0;
}
class m {
  constructor(t) {
    this.owner = t, this.sequence = 0, this.popups = /* @__PURE__ */ new Map();
  }
  open(t, o, i, s, p) {
    if (typeof window > "u")
      return;
    const d = `otools-popup-${++this.sequence}`, a = this.owner.document, l = a.createElement("div");
    l.setAttribute(f, d), l.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:24px",
      "background:rgba(15,23,42,0.45)",
      "backdrop-filter:blur(6px)"
    ].join(";");
    const u = a.createElement("div");
    u.style.cssText = [
      "position:relative",
      "display:flex",
      "flex-direction:column",
      "width:min(1120px,100%)",
      "height:min(760px,100%)",
      "overflow:hidden",
      "border-radius:16px",
      "border:1px solid rgba(148,163,184,0.28)",
      "background:#ffffff",
      "box-shadow:0 24px 80px rgba(15,23,42,0.28)"
    ].join(";");
    const c = a.createElement("button");
    c.type = "button", c.textContent = "Close", c.style.cssText = [
      "position:absolute",
      "top:12px",
      "right:12px",
      "z-index:2",
      "border:0",
      "border-radius:999px",
      "padding:8px 12px",
      "background:rgba(15,23,42,0.72)",
      "color:#ffffff",
      "cursor:pointer"
    ].join(";"), c.addEventListener("click", () => {
      this.close(d);
    });
    const n = a.createElement("iframe");
    return n[r] = this, n.setAttribute(b, o ?? "popup"), n.dataset.otoolsPopupId = d, s !== void 0 && (n.setAttribute(h, s), n.setAttribute(w, p ?? s)), n.src = x(t, this.owner), n.style.cssText = [
      "width:100%",
      "height:100%",
      "border:0",
      "background:#ffffff"
    ].join(";"), u.append(c, n), l.append(u), a.body.append(l), this.popups.set(d, { root: l, label: s, windowId: p }), d;
  }
  getAll() {
    return Array.from(this.popups, ([t, o]) => ({ id: t, label: o.label, windowId: o.windowId ?? o.label })).filter((t) => t.label !== void 0);
  }
  closeLabel(t) {
    for (const [o, i] of this.popups)
      i.label === t && this.close(o);
  }
  close(t) {
    const o = this.popups.get(t);
    o && (o.root.remove(), this.popups.delete(t));
  }
  closeCurrent(t = this.owner) {
    const i = t.frameElement?.dataset.otoolsPopupId;
    if (i) {
      this.close(i);
      return;
    }
    const s = Array.from(this.popups.keys()), p = s[s.length - 1];
    p && this.close(p);
  }
}
function g() {
  const e = window;
  if (e[r]) return e[r];
  const t = e.frameElement;
  return t?.[r] ? t[r] : (e[r] = new m(e), e[r]);
}
export {
  g as ensurePopupManager,
  P as resolvePopupWindowIdentity
};
//# sourceMappingURL=popup-manager.js.map
