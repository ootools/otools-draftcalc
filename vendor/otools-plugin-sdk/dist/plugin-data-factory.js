class a extends Error {
  constructor(r, e) {
    super(e), this.code = r, this.name = "PluginDataError";
  }
}
const h = ["permissionDenied", "forbidden", "conflict", "deleted", "resyncRequired", "invalidCursor", "invalidRequest", "storageFailed", "unavailable", "unsupported", "busy"];
function f(i) {
  if (i instanceof a) return i;
  let r = i;
  if (typeof r == "string")
    try {
      r = JSON.parse(r);
    } catch {
    }
  const e = r && typeof r == "object" ? r : void 0, s = typeof e?.message == "string" ? e.message : String(i), t = e?.code && h.includes(e.code) ? e.code : /unknown command|command .*not found|runtime.*unavailable|bridge.*unavailable/i.test(s) ? "unsupported" : "unavailable";
  return new a(t, s);
}
function b(i) {
  if (!Number.isSafeInteger(i) || i < 0) throw new a("invalidRequest", "expectedRevision must be a non-negative safe integer");
}
function u(i) {
  return typeof i == "string" && i.length > 0 && new TextEncoder().encode(i).length <= 256 && !/[\u0000-\u001f\u007f-\u009f]/.test(i);
}
function w(i) {
  const r = /* @__PURE__ */ new Set();
  return i.map((e) => {
    if (!e || !e.provider || !u(e.provider.source) || !u(e.provider.uuid) || [e.provider.source, e.provider.uuid].some((t) => t.trim() !== t || /[A-Z]/.test(t)) || !u(e.type) || e.subscribe !== void 0 && typeof e.subscribe != "boolean")
      throw new a("invalidRequest", "Access items require a canonical provider, resource type and optional boolean subscribe");
    if (e.scope !== void 0 && (!e.scope || e.scope.kind !== "all" && e.scope.kind !== "ids" || e.scope.kind === "ids" && (!Array.isArray(e.scope.ids) || !e.scope.ids.length || e.scope.ids.length > 256 || ![...e.scope.ids].every(u))))
      throw new a("invalidRequest", "Access scope must be all or contain 1..256 valid IDs");
    const s = JSON.stringify([e.provider.source, e.provider.uuid, e.type]);
    if (r.has(s)) throw new a("invalidRequest", "Duplicate access item");
    return r.add(s), {
      provider: { source: e.provider.source, uuid: e.provider.uuid },
      type: e.type,
      ...e.scope ? { scope: e.scope.kind === "ids" ? { kind: "ids", ids: [...e.scope.ids] } : { kind: "all" } } : {},
      ...e.subscribe !== void 0 ? { subscribe: e.subscribe } : {}
    };
  });
}
function A(i) {
  const r = async (s, t) => {
    try {
      return await i.invoke(`otools_host_plugin_data_${s}`, t === void 0 ? void 0 : { request: t });
    } catch (o) {
      throw f(o);
    }
  };
  return {
    discover: () => r("discover"),
    list: (s) => r("list", s),
    get: (s) => r("get", s),
    async put(s) {
      return b(s.expectedRevision), r("put", s);
    },
    async remove(s) {
      return b(s.expectedRevision), r("remove", s);
    },
    changes: (s) => r("changes", s),
    async requestAccessBatch(s) {
      if (!s || !Array.isArray(s.items) || !s.items.length || s.items.length > 32)
        throw new a("invalidRequest", "Access bundles contain 1..32 explicit items");
      return r("request_access_batch", { items: w(s.items) });
    },
    accessStatus: (s) => r("access_status", { id: s.id }),
    requestAccess: (s) => r("request_access", s),
    revokeAccess: (s) => r("revoke_access", s),
    subscribe(s, t, o) {
      let c = !1, p, l = s.after;
      const g = { type: s.type, provider: s.provider ? { ...s.provider } : void 0, limit: s.limit }, y = Math.max(250, Math.min(6e4, Number.isFinite(o.intervalMs) ? o.intervalMs : 1e3)), d = () => {
        c || (c = !0, clearTimeout(p), o.signal?.removeEventListener("abort", d));
      }, v = async () => {
        if (!c)
          try {
            const n = await r("changes", { ...g, after: l });
            if (c) return;
            if (!n || typeof n.after != "string" || !Array.isArray(n.items) || typeof n.hasMore != "boolean" || n.hasMore && n.after === l)
              throw new a("unavailable", "Host returned an invalid changes page");
            l = n.after, await t(n), c || (p = setTimeout(() => {
              v();
            }, n.hasMore ? 0 : y));
          } catch (n) {
            if (c) return;
            d();
            try {
              o.onError(f(n));
            } catch {
            }
          }
      };
      return o.signal?.addEventListener("abort", d, { once: !0 }), o.signal?.aborted ? d() : v(), d;
    }
  };
}
export {
  a as PluginDataError,
  A as createPluginDataApi
};
//# sourceMappingURL=plugin-data-factory.js.map
