class a extends Error {
  constructor(i, r = i) {
    super(r), this.code = i, this.name = "AiError";
  }
}
function b(t) {
  if (t instanceof Error) return t;
  if (typeof t == "string") return new a(t);
  const i = t;
  return new a(typeof i?.code == "string" ? i.code : "transportFailed", typeof i?.message == "string" ? i.message : void 0);
}
function R(t, i, r) {
  const o = () => {
    throw new a("invalidResponse");
  };
  (!t || t.id !== i || !Array.isArray(t.events) || t.events.length > 256 || typeof t.done != "boolean") && o();
  let d = !1, f = 0;
  for (const e of t.events)
    switch ((!e || !Number.isSafeInteger(e.sequence) || e.sequence !== ++r || d) && o(), e.type) {
      case "delta":
        typeof e.text != "string" && o(), f += e.text.length, f > 256 * 1024 && o();
        break;
      case "error":
        typeof e.error != "string" && o(), d = !0;
        break;
      case "done":
      case "cancelled":
        d = !0;
        break;
      default:
        o();
    }
  t.done !== d && o();
}
function M(t) {
  if (!t || typeof t != "object" || Array.isArray(t)) throw new a("invalidSettings");
  const i = (r, o) => {
    if (r === null) return null;
    if (typeof r != "string" || r.length > o || !r.trim()) throw new a("invalidSettings");
    return r.trim();
  };
  return { model: i(t.model, 512), reasoningEffort: i(t.reasoningEffort, 64) };
}
function u(t, i) {
  if (!t || typeof t != "object" || Array.isArray(t)) throw new a("invalidRequest");
  const r = t;
  return Object.fromEntries(i.filter((o) => r[o] !== void 0).map((o) => [o, r[o]]));
}
function j(t) {
  const i = async (e, c) => {
    try {
      return await t.invoke(`otools_host_ai_${e}`, c);
    } catch (l) {
      throw b(l);
    }
  }, r = async (e, c) => {
    try {
      return await t.invoke(e, { request: c });
    } catch (l) {
      throw b(l);
    }
  }, o = /* @__PURE__ */ new Map(), d = async (e, c, l) => {
    for (; ; ) {
      const p = o.get(e);
      await p;
      const s = l.model ?? (await i("media_get_settings", { channel: e })).model;
      if (p === o.get(e)) {
        if (typeof s != "string" || !s.trim()) throw new a("modelNotSelected");
        return r(c, { ...l, model: s });
      }
    }
  }, f = {
    media: {
      models: ({ channel: e }) => i("media_models", { channel: e }),
      getSettings: ({ channel: e }) => i("media_get_settings", { channel: e }),
      saveSettings: async ({ channel: e, model: c }) => {
        const l = M({ model: c, reasoningEffort: null }).model, p = o.get(e), s = (async () => (await p?.catch(() => {
        }), i("media_save_settings", { channel: e, model: l })))();
        return o.set(e, s), s.catch(() => {
        }), s;
      },
      images: (e) => d("images", "otools_ai_images", u(e, ["prompt", "model", "size", "n"])),
      speech: (e) => d("tts", "otools_ai_speech", u(e, ["input", "model", "voice", "responseFormat", "speed"])),
      transcribe: (e) => d("stt", "otools_ai_transcribe", u(e, ["audioBase64", "filename", "model", "language"])),
      embeddings: (e) => d("embeddings", "otools_ai_embeddings", u(e, ["input", "model"])),
      videoSubmit: (e) => d("video", "otools_ai_video_submit", u(e, ["prompt", "model", "image", "duration", "fps", "width", "height", "seed", "metadata"])),
      videoStatus: (e) => r("otools_ai_video_status", u(e, ["taskId", "refresh"])),
      videoContent: (e) => r("otools_ai_video_content", u(e, ["taskId"]))
    },
    capabilities: () => i("capabilities"),
    models: () => i("models"),
    getSettings: () => i("get_settings"),
    saveSettings: async (e) => i("save_settings", { settings: M(e) }),
    start: (e) => i("start", { request: e }),
    read: (e) => i("read", e),
    cancel: (e) => i("cancel", e),
    consume(e, c = {}) {
      return new Promise((l, p) => {
        let s = !1, m, w = 0, y = "", E, S;
        const A = (n) => {
          f.cancel({ id: n }).catch(() => {
          });
        }, x = () => {
          clearTimeout(E), clearTimeout(S), c.signal?.removeEventListener("abort", _);
        }, h = (n) => {
          s || (s = !0, x(), m && A(m), p(b(n)));
        }, _ = () => h(new a("cancelled"));
        if (c.signal?.addEventListener("abort", _, { once: !0 }), c.signal?.aborted) {
          _();
          return;
        }
        S = setTimeout(() => h(new a("timeout")), 600 * 1e3);
        const I = Number.isFinite(c.pollIntervalMs) ? Math.max(0, Math.min(1e4, c.pollIntervalMs)) : 100, k = async () => {
          if (!(s || !m))
            try {
              const n = await f.read({ id: m, after: w });
              if (s) return;
              R(n, m, w);
              for (const g of n.events) {
                if (w = g.sequence, g.type === "delta" && (y += g.text, y.length > 4 * 1024 * 1024))
                  throw new a("responseTooLarge");
                if (c.onEvent?.(g), s) return;
                if (g.type === "error") throw new a(g.error);
                if (g.type === "cancelled") throw new a("cancelled");
              }
              n.done ? (s = !0, x(), f.read({ id: m, after: w }).catch(() => {
              }), l({ id: m, text: y })) : E = setTimeout(() => {
                k();
              }, I);
            } catch (n) {
              h(n);
            }
        };
        (async () => {
          try {
            const n = await f.capabilities();
            if (s) return;
            if (!n?.configured) throw new a("notConfigured");
            if (!n.streaming || !n.cancellation) throw new a("unsupported");
            if ((!e.model || e.model === n.model) && n.vision === "unsupported" && e.messages.some((T) => T.content.some((z) => z.type === "image")))
              throw new a("visionUnsupported");
            const v = await f.start(e);
            if (!v || typeof v.id != "string" || !v.id) throw new a("invalidResponse");
            if (m = v.id, s) {
              A(m);
              return;
            }
            k();
          } catch (n) {
            h(n);
          }
        })();
      });
    }
  };
  return f;
}
export {
  a as AiError,
  j as createAiApi
};
//# sourceMappingURL=ai-factory.js.map
