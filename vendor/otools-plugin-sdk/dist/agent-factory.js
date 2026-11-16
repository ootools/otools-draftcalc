class u extends Error {
  constructor(t, i = t) {
    super(i), this.code = t, this.name = "AgentError";
  }
}
const Q = 4 * 1024 * 1024, Z = 256 * 1024, $ = 1e5, D = /* @__PURE__ */ new Set(["done", "cancelled", "error"]);
function C(e) {
  if (e instanceof u) return e;
  const t = e, i = typeof e == "string" ? e : typeof t?.message == "string" ? t.message : "Agent transport failed";
  return typeof t?.code == "string" ? new u(t.code, i) : /(unknown command|command.*not found|not implemented|agent.*unavailable)/i.test(i) ? new u("unavailable", i) : e instanceof Error ? e : new u(typeof e == "string" ? e : "transportFailed", i);
}
function y() {
  throw new u("invalidRequest");
}
function m(e) {
  return (!e || typeof e != "object" || Array.isArray(e)) && y(), e;
}
function l(e, t = 512, i = !1) {
  return (typeof e != "string" || e.length > t || !i && !e.trim() || e.includes("\0")) && y(), e;
}
function j(e, t, i) {
  return (typeof e != "number" || !Number.isSafeInteger(e) || e < t || e > i) && y(), e;
}
function S(e) {
  return typeof e != "boolean" && y(), e;
}
function v(e, t, i, o = l) {
  t[i] !== void 0 && (e[i] = o(t[i]));
}
function _(e, t) {
  return { [t]: l(m(e)[t]) };
}
function G(e) {
  const t = m(e);
  return { id: l(t.id), after: t.after === void 0 ? 0 : j(t.after, 0, Number.MAX_SAFE_INTEGER) };
}
function H(e, t = !1) {
  const i = l(e, 4096, t);
  return t && (i === "" || i === ".") || (/^[\\/]|[\\:]|[\x00-\x1f]/.test(i) || i.split("/").some((o) => !o || o === "." || o === "..")) && y(), i;
}
function J(e) {
  const t = m(e), i = { providerId: l(t.providerId) };
  for (const o of ["clientSessionId", "workspaceId"]) v(i, t, o);
  v(i, t, "instructions", (o) => l(o, 1024 * 1024, !0)), v(i, t, "sandbox", (o) => (o !== "read-only" && o !== "workspace-write" && y(), o));
  for (const o of ["network", "background"]) v(i, t, o, S);
  return v(i, t, "tools", (o) => ((!Array.isArray(o) || o.length > 128) && y(), o.map((n) => l(n)))), i;
}
function W(e) {
  const t = m(e), i = { sessionId: l(t.sessionId), prompt: l(t.prompt, 1024 * 1024) };
  for (const o of ["model", "requestId"]) v(i, t, o);
  if (v(i, t, "reasoningEffort", (o) => o === null ? null : l(o, 64)), v(i, t, "timeoutSecs", (o) => j(o, 1, 86400)), t.mediaModels !== void 0) {
    const o = m(t.mediaModels), n = Object.entries(o);
    (n.length > 5 || n.some(([r]) => !["images", "video", "tts", "stt", "embeddings"].includes(r))) && y(), i.mediaModels = Object.fromEntries(n.map(([r, c]) => [r, l(c, 512)]));
  }
  return i;
}
function K(e, t, i) {
  const o = () => {
    throw new u("invalidResponse");
  }, n = () => {
    throw new u("responseTooLarge");
  };
  (!e || e.id !== t || !Array.isArray(e.events) || typeof e.done != "boolean" || !Number.isSafeInteger(e.after) || e.after < i) && o(), e.events.length > 256 && n(), ["running", "completed", "cancelled", "failed", "interrupted"].includes(e.status) || o(), e.text !== void 0 && (typeof e.text != "string" && o(), e.text.length > Q && n());
  let r = Z, c = 0;
  const w = (s, g = 0) => {
    if ((++c > 16384 || g > 32) && n(), s === null || typeof s == "boolean") r -= 5;
    else if (typeof s == "number")
      Number.isFinite(s) || o(), r -= 24;
    else if (typeof s == "string") r -= s.length;
    else if (Array.isArray(s)) {
      r -= s.length;
      for (const b of s) w(b, g + 1);
    } else if (typeof s == "object") {
      const b = Object.getPrototypeOf(s);
      b !== Object.prototype && b !== null && o();
      for (const [k, M] of Object.entries(s))
        r -= k.length, w(M, g + 1);
    } else o();
    r < 0 && n();
  };
  let h = 0, d = i, a;
  const p = [];
  for (const s of e.events) {
    (!s || !Number.isSafeInteger(s.sequence) || s.sequence <= h || s.sequence < 1 || a) && o(), h = s.sequence, ["text", "reasoning", "tool", "permission", "question", "status", "done", "cancelled", "error"].includes(s.type) || o();
    for (const g of ["text", "itemId", "error"])
      s[g] !== void 0 && (typeof s[g] != "string" && o(), r -= s[g].length);
    if (s.type === "text" && typeof s.text != "string" && o(), s.type === "error" && (typeof s.error != "string" || !s.error) && o(), s.data !== void 0 && w(s.data), r < 0 && n(), D.has(s.type) && (a = s), !(s.sequence <= i)) {
      if (s.sequence !== d + 1) throw new u("cursorGap");
      d = s.sequence, p.push(s);
    }
  }
  return (e.after !== (e.events.length ? h : i) || e.after !== d) && o(), e.done !== (e.status !== "running") && o(), a && !e.done && o(), e.done && !a && e.events.length > 0 && o(), a?.type === "done" && e.status !== "completed" && o(), a?.type === "cancelled" && e.status !== "cancelled" && o(), a?.type === "error" && e.status !== "failed" && e.status !== "interrupted" && o(), p;
}
function U(e) {
  const t = async (n, r) => {
    try {
      if (!e || typeof e.invoke != "function") throw new u("unavailable", "Host agent API is unavailable");
      return await e.invoke(`otools_host_agent_${n}`, r);
    } catch (c) {
      throw C(c);
    }
  }, i = {
    providers: () => t("providers"),
    tools: () => t("tools"),
    capabilities: async (n) => t("capabilities", _(n, "providerId")),
    health: async (n) => {
      const r = m(n), c = _(r, "providerId");
      return v(c, r, "refresh", S), t("health", c);
    },
    openManager: async (n = {}) => {
      const r = {};
      return v(r, m(n), "providerId"), t("open_manager", r);
    },
    openSession: async (n) => t("open_session", { request: J(n) }),
    configOptions: async (n) => t("config_options", _(n, "sessionId")),
    setConfigOption: async (n) => {
      const r = m(n);
      return t("set_config_option", { sessionId: l(r.sessionId), configId: l(r.configId), value: l(r.value, 4096) });
    },
    start: async (n) => {
      const { mediaModels: r, ...c } = W(n);
      return t("start", { request: c, ...r ? { mediaModels: r } : {} });
    },
    read: async (n) => t("read", G(n)),
    cancel: async (n) => t("cancel", _(n, "id")),
    closeSession: async (n) => t("close_session", _(n, "sessionId")),
    respondQuestion: async (n) => {
      const r = m(n), c = Object.entries(m(r.answers));
      c.length > 128 && y();
      const w = /* @__PURE__ */ Object.create(null);
      let h = 0;
      for (const [d, a] of c)
        l(d), (["__proto__", "constructor", "prototype"].includes(d) || !Array.isArray(a) || a.length > 128) && y(), w[d] = a.map((p) => {
          const s = l(p, 65536, !0);
          return h += s.length, h > 1048576 && y(), s;
        });
      return t("respond_question", { id: l(r.id), answers: w });
    },
    openPermission: async (n) => t("open_permission", _(n, "id")),
    workspace: async (n = {}) => {
      const r = {};
      return v(r, m(n), "workspaceId"), t("workspace", r);
    },
    syncAssets: async (n) => {
      const r = m(n);
      (!Array.isArray(r.files) || r.files.length > 256) && y();
      let c = 0;
      const w = r.files.map((h) => {
        const d = m(h), a = H(d.path), p = l(d.contentBase64, 16 * 1024 * 1024, !0);
        c += p.length;
        const s = p.endsWith("==") ? 2 : p.endsWith("=") ? 1 : 0, g = s ? p.slice(0, -s) : p;
        return (c > 32 * 1024 * 1024 || p.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(g) || s > 0 && g.length < 2) && y(), { path: a, contentBase64: p };
      });
      return t("sync_assets", { workspaceId: l(r.workspaceId), files: w });
    },
    workspaceFiles: async (n) => {
      const r = m(n), c = _(r, "workspaceId");
      return v(c, r, "path", (w) => H(w, !0)), t("workspace_files", c);
    },
    consume: (n, r = {}) => o(n, void 0, r),
    resume: (n, r = {}) => o(void 0, n, r)
  };
  function o(n, r, c) {
    return new Promise((w, h) => {
      let d = !1, a, p, s = 0, g = "", b = 0, k = !1, M = !1, L = !1, N, R, A;
      const z = () => {
        !a || M || k || (M = !0, i.cancel({ id: a }).catch(() => {
        }));
      }, F = () => {
        clearTimeout(N), clearTimeout(R), A?.removeEventListener("abort", O);
      }, E = (f, x = n !== void 0) => {
        d || (d = !0, L = x, F(), x && z(), h(C(f)));
      }, O = () => E(new u("cancelled"), n !== void 0 || c.cancelOnAbort === !0);
      let P, X, q;
      try {
        if (m(c), c.pollIntervalMs !== void 0 && (typeof c.pollIntervalMs != "number" || !Number.isFinite(c.pollIntervalMs)) && y(), P = c.pollIntervalMs === void 0 ? 100 : Math.max(0, Math.min(1e4, c.pollIntervalMs)), X = c.timeoutMs === void 0 ? 6e5 : j(c.timeoutMs, 1, 864e5), c.onEvent !== void 0 && typeof c.onEvent != "function" && y(), "cancelOnAbort" in c && c.cancelOnAbort !== void 0 && S(c.cancelOnAbort), A = c.signal, A && (typeof A.addEventListener != "function" || typeof A.removeEventListener != "function" || typeof A.aborted != "boolean") && y(), n !== void 0) q = W(n);
        else {
          const f = G(r);
          a = f.id, s = f.after;
        }
        if (A?.addEventListener("abort", O, { once: !0 }), A?.aborted) {
          O();
          return;
        }
      } catch (f) {
        E(f, !1);
        return;
      }
      R = setTimeout(() => E(new u("timeout"), n !== void 0 || c.cancelOnAbort === !0), X);
      const T = async () => {
        if (!(d || !a))
          try {
            const f = await i.read({ id: a, after: s });
            if (d) return;
            const x = K(f, a, s);
            if (b += x.length, b > $) throw new u("responseTooLarge");
            const V = x.filter((I) => I.type === "text").map((I) => I.text).join(""), B = f.text === void 0 ? g + V : f.text;
            if (B.length > Q) throw new u("responseTooLarge");
            g = B, k = f.done;
            for (const I of x) {
              if (s = I.sequence, c.onEvent?.(I), d) return;
              if (I.type === "error") throw new u(I.error);
              if (I.type === "cancelled") throw new u("cancelled");
            }
            if (s = f.after, f.done) {
              if (f.status !== "completed") throw new u(f.status === "failed" ? "failed" : f.status);
              d = !0, F(), w({ id: a, ...p === void 0 ? {} : { sessionId: p }, text: g });
            } else N = setTimeout(() => {
              T();
            }, P);
          } catch (f) {
            E(f);
          }
      };
      if (!q) {
        T();
        return;
      }
      (async () => {
        try {
          const f = await i.start(q);
          if (!f || typeof f.id != "string" || !f.id.trim() || f.id.length > 512) throw new u("invalidResponse");
          if (a = f.id, d) {
            L && z();
            return;
          }
          if (f.sessionId !== q.sessionId) throw new u("invalidResponse");
          p = f.sessionId, T();
        } catch (f) {
          E(f);
        }
      })();
    });
  }
  return i;
}
export {
  u as AgentError,
  U as createAgentApi
};
//# sourceMappingURL=agent-factory.js.map
