class o extends Error {
  constructor(a, i) {
    super(i), this.code = a, this.name = "ObservationError";
  }
}
function p(n) {
  if (n instanceof o) return n;
  let a = n;
  if (typeof a == "string")
    try {
      a = JSON.parse(a);
    } catch {
    }
  const i = a && typeof a == "object" ? a : void 0;
  return new o(i?.code ?? "unsupported", i?.message ?? String(n));
}
function g() {
  throw new o("invalidRequest", "Provide an explicit target and a sampling interval of at least 30000 ms");
}
function c(n) {
  (typeof n != "string" || !n || n.length > 128) && g();
}
function d(n, a) {
  if (!n || typeof n.id != "string" || a && n.id !== a || !["pending", "active", "stopped"].includes(n.state))
    throw new o("invalidResponse", "Invalid observation status");
  return n;
}
function u(n) {
  const a = /* @__PURE__ */ new Map(), i = async (t, s) => {
    try {
      return await n.invoke(`otools_host_observation_${t}`, s);
    } catch (e) {
      throw p(e);
    }
  }, l = async ({ id: t }) => {
    c(t);
    const s = d(await i("status", { id: t }), t);
    if (s.state === "stopped") {
      const e = a.get(t);
      e && (e.cancelled = !0);
    }
    return s;
  };
  return {
    targets: () => i("targets"),
    async request(t) {
      const s = t?.target, e = s?.kind === "screen" ? s.displayId : s?.kind === "window" ? s.windowId : void 0, r = t?.intervalMs ?? 6e4;
      return (typeof e != "string" || !/^[1-9]\d{0,9}$/.test(e) || Number(e) > 4294967295 || !Number.isSafeInteger(r) || r < 3e4 || r > 36e5) && g(), d(await i("request", { options: { target: s, intervalMs: r } }));
    },
    status: l,
    async capture({ id: t }) {
      if (c(t), a.has(t) || a.size >= 32) throw new o("busy", "An observation capture is already in progress");
      const s = { cancelled: !1 };
      a.set(t, s);
      let e, r = !1;
      try {
        if (e = await i("capture", { id: t }), !e || typeof e.imageId != "string" || !e.imageId || e.imageId.length > 128 || e.mimeType !== "image/png" || !Number.isSafeInteger(e.width) || e.width <= 0 || !Number.isSafeInteger(e.height) || e.height <= 0 || e.width * e.height > 64e6 || !Number.isFinite(e.expiresAt)) throw new o("invalidResponse", "Invalid observation image");
        if (s.cancelled || (await l({ id: t })).state !== "active" || s.cancelled)
          throw new o("stopped", "Observation stopped before capture delivery");
        return r = !0, e;
      } finally {
        if (a.delete(t), !r && typeof e?.imageId == "string" && e.imageId.length <= 128)
          try {
            await n.invoke("otools_host_capture_release", { imageId: e.imageId });
          } catch {
          }
      }
    },
    async stop({ id: t }) {
      c(t);
      const s = a.get(t);
      s && (s.cancelled = !0), await i("stop", { id: t });
    }
  };
}
export {
  o as ObservationError,
  u as createObservationApi
};
//# sourceMappingURL=observation-factory.js.map
