import { invoke as i } from "./runtime.js";
const l = (t) => {
  if (typeof t == "string") {
    const n = t.trim();
    return n || null;
  }
  if (t && typeof t == "object" && "path" in t) {
    const n = t.path;
    if (typeof n == "string") {
      const r = n.trim();
      return r || null;
    }
  }
  return null;
}, u = (t) => {
  if (Array.isArray(t))
    return t.map((r) => l(r)).filter((r) => !!r);
  const n = l(t);
  return n ? [n] : [];
}, o = (t, n) => {
  const r = u(t);
  return n.multiple ? r.length ? r : null : r[0] ?? null;
};
function e() {
  if (typeof window > "u")
    return;
  const t = window.otools ?? window.utools;
  return t?.dialog ?? t?.runtime?.dialog ?? void 0;
}
async function c(t) {
  try {
    const n = await i("plugin:dialog|open", {
      options: t
    });
    return o(n, t);
  } catch {
    return null;
  }
}
async function f(t) {
  try {
    const n = await i("plugin:dialog|save", { options: t });
    return l(n);
  } catch {
    return null;
  }
}
async function s(t = {}) {
  const n = t ?? {}, r = e();
  if (r?.open)
    return o(
      await r.open(n),
      n
    );
  const a = await c(n);
  return a !== null ? a : null;
}
async function g(t = {}) {
  const n = e();
  if (n?.save)
    return l(await n.save(t));
  const r = await f(t);
  return r !== null ? r : null;
}
async function y(t, n) {
  const r = e();
  if (r?.message) {
    await r.message(t, n);
    return;
  }
  try {
    await i("plugin:dialog|message", {
      message: String(t),
      title: typeof n == "string" ? n : n?.title,
      kind: typeof n == "string" ? void 0 : n?.kind,
      okButtonLabel: typeof n == "string" ? void 0 : n?.okLabel ?? n?.buttons?.ok
    });
    return;
  } catch {
  }
  typeof window < "u" && window.alert(t);
}
async function w(t, n) {
  const r = e();
  if (r?.confirm)
    return r.confirm(t, n);
  try {
    return !!await i("plugin:dialog|confirm", {
      message: String(t),
      title: typeof n == "string" ? n : n?.title,
      kind: typeof n == "string" ? void 0 : n?.kind,
      okButtonLabel: typeof n == "string" ? void 0 : n?.okLabel,
      cancelButtonLabel: typeof n == "string" ? void 0 : n?.cancelLabel
    });
  } catch {
  }
  return typeof window > "u" ? !1 : window.confirm(t);
}
async function k(t, n) {
  const r = e();
  if (r?.ask)
    return r.ask(t, n);
  try {
    return !!await i("plugin:dialog|ask", {
      message: String(t),
      title: typeof n == "string" ? n : n?.title,
      kind: typeof n == "string" ? void 0 : n?.kind,
      yesButtonLabel: typeof n == "string" ? void 0 : n?.okLabel,
      noButtonLabel: typeof n == "string" ? void 0 : n?.cancelLabel
    });
  } catch {
  }
  return typeof window > "u" ? !1 : window.confirm(t);
}
export {
  k as ask,
  w as confirm,
  y as message,
  s as open,
  g as save
};
//# sourceMappingURL=tauri-plugin-dialog-shim.js.map
