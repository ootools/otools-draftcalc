const u = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/, d = (a) => {
  if (!a || typeof a != "object") return !1;
  const e = a;
  return typeof e.requestId == "string" && ["open", "panel", "detach", "callback"].includes(e.action) && (e.route === null || typeof e.route == "string") && !!e.params && typeof e.params == "object" && !Array.isArray(e.params) && Object.values(e.params).every((t) => Array.isArray(t) && t.every((n) => typeof n == "string"));
};
function f(a) {
  return {
    async createCallback(e) {
      if (!e || !u.test(e.route) || [".", ".."].includes(e.route) || e.openMode !== void 0 && !["panel", "tabs", "detach"].includes(e.openMode) || e.ttlSeconds !== void 0 && (!Number.isInteger(e.ttlSeconds) || e.ttlSeconds < 10 || e.ttlSeconds > 600))
        throw new Error("Invalid callback options");
      return await a.invoke("otools_host_deep_link_create_callback", { ...e });
    },
    async cancelCallback(e) {
      if (typeof e != "string" || !u.test(e)) throw new Error("Invalid callback state");
      await a.invoke("otools_host_deep_link_cancel_callback", { state: e });
    },
    async onOpen(e) {
      let t = !0, n = !1, s = !1;
      const r = /* @__PURE__ */ new Set(), i = async () => {
        if (t) {
          if (n) {
            s = !0;
            return;
          }
          n = !0;
          try {
            do {
              s = !1;
              const l = await a.invoke("otools_host_deep_link_consume");
              if (!t) return;
              if (Array.isArray(l)) for (const c of l) {
                if (!t) return;
                !d(c) || r.has(c.requestId) || (r.add(c.requestId), r.size > 128 && r.delete(r.values().next().value), await e(c));
              }
            } while (s && t);
          } finally {
            n = !1;
          }
        }
      }, o = await a.listen("otools:deep-link-ready", () => {
        i().catch(() => {
        });
      });
      try {
        await i();
      } catch (l) {
        throw t = !1, o(), l;
      }
      return () => {
        t && (t = !1, r.clear(), o());
      };
    }
  };
}
export {
  f as createDeepLinksApi
};
//# sourceMappingURL=deep-links.js.map
