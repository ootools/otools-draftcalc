class l extends Error {
  constructor(a, n) {
    super(n), this.code = a, this.name = "CaptureError";
  }
}
const B = ["unsupported", "permissionDenied", "busy", "cancelled", "timeout", "notFound", "invalidRequest", "forbidden", "captureFailed", "outputFailed"];
function I(i) {
  if (i instanceof l) return i;
  let a = i;
  if (typeof a == "string")
    try {
      a = JSON.parse(a);
    } catch {
    }
  const n = a && typeof a == "object" ? a : void 0, o = n?.message || String(i), p = n?.code && B.includes(n.code) ? n.code : /runtime.*unavailable|bridge.*unavailable|not supported|unknown command|command .*not found/i.test(o) ? "unsupported" : "captureFailed";
  return new l(p, o);
}
function S(i) {
  const a = async (n, o) => {
    try {
      return await i.invoke(`otools_host_capture_${n}`, o);
    } catch (p) {
      throw I(p);
    }
  };
  return {
    capabilities: () => a("capabilities"),
    permissionStatus: () => a("permission_status"),
    requestPermission: () => a("request_permission"),
    repairPermission: () => a("repair_permission"),
    screen: (n = {}) => a("screen", { options: n }),
    region: (n) => a("region", { options: n }),
    window: (n = {}) => a("window", { options: n }),
    pin: (n) => a("pin", { options: n }),
    retain: (n) => a("retain", { imageId: n }),
    release: (n) => a("release", { imageId: n }),
    select(n = {}, o) {
      return new Promise((p, s) => {
        let r = !1, e, d, c, u = !1;
        const g = /* @__PURE__ */ new Set(), w = (t) => {
          t?.status === "completed" && t.captureId === e && !g.has(t.image.imageId) && (g.add(t.image.imageId), a("release", { imageId: t.image.imageId }).catch(() => {
          }));
        }, v = (t) => {
          a("cancel", { captureId: t }).then(() => a("result", { captureId: t })).then(w).catch(() => {
          });
        }, b = () => {
          const t = d;
          if (d = void 0, t)
            try {
              Promise.resolve(t()).catch(() => {
              });
            } catch {
            }
        }, f = (t, m) => {
          r || (r = !0, clearTimeout(x), clearTimeout(c), o?.removeEventListener("abort", h), b(), m ? (e && v(e), s(I(m))) : p(t));
        }, h = () => f(void 0, new l("cancelled", "Capture aborted")), x = setTimeout(() => f(void 0, new l("timeout", "Capture timed out")), 600 * 1e3), y = async () => {
          if (!(r || !e || u)) {
            clearTimeout(c), u = !0;
            try {
              const t = await a("result", { captureId: e });
              if (r) {
                w(t);
                return;
              }
              if (t) {
                if (t.captureId !== e || !["completed", "cancelled", "error"].includes(t.status))
                  throw new l("captureFailed", "Invalid capture result");
                f(t);
              }
            } catch (t) {
              f(void 0, t);
            } finally {
              u = !1, r || (c = setTimeout(() => {
                y();
              }, 250));
            }
          }
        };
        if (o?.addEventListener("abort", h, { once: !0 }), o?.aborted) {
          h();
          return;
        }
        (async () => {
          try {
            if (i.listen)
              try {
                d = await i.listen("otools-capture-result", (m) => {
                  m.payload?.captureId === e && y();
                });
              } catch {
              }
            if (r) {
              b();
              return;
            }
            const t = await a("begin", { options: n });
            if (!t?.captureId) throw new l("captureFailed", "Missing capture id");
            if (e = t.captureId, r) {
              v(e);
              return;
            }
            y();
          } catch (t) {
            f(void 0, t);
          }
        })();
      });
    },
    async readImage(n) {
      let s = 0, r;
      do {
        const e = await a("read_chunk", { imageId: n, offset: s, length: 1048576 }), d = () => new l("captureFailed", "Invalid capture image chunk");
        if (!e || !Number.isSafeInteger(e.totalBytes) || e.totalBytes <= 0 || e.totalBytes > 67108864 || !Number.isSafeInteger(e.nextOffset) || e.nextOffset <= s || e.nextOffset > e.totalBytes || e.nextOffset - s > 1048576 || typeof e.dataBase64 != "string" || e.dataBase64.length > Math.ceil(1048576 / 3) * 4 || r && r.length !== e.totalBytes) throw d();
        let c;
        try {
          c = atob(e.dataBase64);
        } catch {
          throw d();
        }
        if (c.length !== e.nextOffset - s) throw d();
        r ??= new Uint8Array(e.totalBytes);
        for (let u = 0; u < c.length; u++) r[s + u] = c.charCodeAt(u);
        s = e.nextOffset;
      } while (s < r.length);
      return r;
    }
  };
}
export {
  l as CaptureError,
  S as createCaptureApi
};
//# sourceMappingURL=capture-factory.js.map
