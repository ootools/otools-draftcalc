import { invoke as m } from "./runtime.js";
import { registerTransformCallback as p } from "./native-event-bridge.js";
const i = () => {
  if (!(typeof window > "u"))
    return window.__TAURI_INTERNALS__;
}, s = () => typeof i()?.invoke == "function", a = "/__tauri_remote_service_file__", c = (n) => n.replace(/\/+$/, ""), l = (n) => String(n || "").startsWith("/") || /^[A-Za-z]:[\\/]/.test(String(n || "")), o = (n) => {
  const t = String(n || "").trim();
  if (!t)
    return t;
  if (t.startsWith("file://"))
    try {
      const r = new URL(t);
      let e = decodeURIComponent(r.pathname);
      return e.startsWith("/") && /^[A-Za-z]:/.test(e.slice(1)) && (e = e.slice(1)), e;
    } catch {
      return t;
    }
  return t;
}, u = (n) => {
  const t = o(n);
  if (!l(t))
    return t;
  const r = typeof window < "u" ? c(window.location.origin || "") : "";
  return r ? `${r}${a}?path=${encodeURIComponent(t)}` : t;
}, f = (n, t = "asset") => {
  const r = o(n);
  if (!s())
    return u(r);
  const e = encodeURIComponent(r);
  return navigator.userAgent.includes("Windows") ? `http://${t}.localhost/${e}` : `${t}://localhost/${e}`;
};
export {
  f as convertFileSrc,
  m as invoke,
  s as isTauri,
  p as transformCallback
};
//# sourceMappingURL=tauri-core-shim.js.map
