const c = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map();
let b = 0, f = 0, i = null;
function d() {
  if (!(typeof window > "u"))
    return window.otools ?? window.utools;
}
function g(t) {
  const e = t && typeof t == "object" && "payload" in t ? t.payload : t;
  if (!e || typeof e != "object")
    return null;
  const n = e.topic;
  return typeof n != "string" || !n ? null : {
    topic: n,
    payload: e.payload ?? null
  };
}
function _(t) {
  const e = o.get(t.topic);
  if (e)
    for (const n of e.values())
      n(t.payload);
}
async function p() {
  if (i)
    return i;
  const t = d();
  return t?.listenNative ? (i = t.listenNative((e) => {
    const n = g(e);
    n && _(n);
  }), i) : (i = Promise.resolve(async () => {
  }), i);
}
async function m() {
  if (o.size > 0 || !i)
    return;
  const t = await i;
  i = null, await t();
}
function N(t) {
  const e = r.get(t) ?? 0;
  r.set(t, e + 1);
}
function v(t) {
  const e = r.get(t);
  if (!e || e <= 1) {
    r.delete(t), c.delete(t);
    return;
  }
  r.set(t, e - 1);
}
function l() {
  if (typeof window > "u" || typeof window.__TAURI_EVENT_PLUGIN_INTERNALS__?.unregisterListener == "function")
    return;
  const e = {
    unregisterListener(n, s) {
      w(s);
    }
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = e;
}
function T(t, e = !1) {
  l();
  const n = ++b;
  return c.set(n, { callback: t, once: e }), n;
}
async function k(t, e) {
  l();
  const n = ++f, s = o.get(t) ?? /* @__PURE__ */ new Map();
  return s.set(n, (y) => {
    const u = c.get(e);
    u && (u.callback({ payload: y }), u.once && (c.delete(e), r.delete(e)));
  }), o.set(t, s), a.set(n, { topic: t, handlerId: e }), N(e), await p(), n;
}
async function w(t) {
  const e = a.get(t);
  if (!e)
    return;
  a.delete(t);
  const n = o.get(e.topic);
  n?.delete(t), n && n.size === 0 && o.delete(e.topic), typeof e.handlerId == "number" && v(e.handlerId), await m();
}
async function L(t, e) {
  l();
  const n = ++f, s = o.get(t) ?? /* @__PURE__ */ new Map();
  return s.set(n, e), o.set(t, s), a.set(n, { topic: t }), await p(), async () => {
    await w(n);
  };
}
export {
  k as attachTransformListener,
  w as detachTransformListener,
  L as listenNativeTopic,
  T as registerTransformCallback
};
//# sourceMappingURL=native-event-bridge.js.map
