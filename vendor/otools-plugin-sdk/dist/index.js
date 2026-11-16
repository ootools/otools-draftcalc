import { createOtoolsAliasMap as R } from "./aliases.js";
import { otoolsTauriShimPlugin as V } from "./vite.js";
import { CaptureError as C } from "./capture-factory.js";
import { invoke as r, listenTauri as a, invokeTauri as f, listen as c } from "./runtime.js";
import { emit as $, getOtoolsApi as B, isOtoolsPluginRuntime as G, openExternal as M, openPath as U } from "./runtime.js";
import { pickDirectory as Y, pickFile as Z, pickFiles as j, pickZipFile as z, saveFile as J } from "./dialog.js";
import { createHostTreePicker as w } from "./host-tree-factory.js";
import { createKeywordListener as u } from "./keyword-factory.js";
import { OTOOLS_KEYWORD_DISPATCH_EVENT as X } from "./keyword-factory.js";
import { createFileOpenListener as d } from "./file-open-factory.js";
import { OTOOLS_FILE_DELIVER_EVENT as oe, parseLaunchOpenFiles as te, toOpenFileEntries as ne } from "./file-open-factory.js";
import { capture as ie } from "./capture.js";
function i() {
  if (!(typeof window > "u"))
    return window.otools ?? window.utools;
}
async function x(e, o) {
  const t = String(e ?? "").trim();
  if (!t)
    return;
  const n = i();
  if (n?.shellOpen) {
    await n.shellOpen(t, o);
    return;
  }
  if (n?.shellOpenExternal && /^https?:\/\//i.test(t)) {
    n.shellOpenExternal(t);
    return;
  }
  if (n?.shellOpenPath) {
    n.shellOpenPath(t);
    return;
  }
  typeof window < "u" && window.open(t, "_blank", "noopener,noreferrer");
}
async function F(e) {
  const o = String(e ?? "").trim();
  if (!o)
    return;
  const t = i();
  if (t?.shellOpenPath) {
    t.shellOpenPath(o);
    return;
  }
}
async function T(e) {
  const o = String(e ?? "").trim();
  if (!o)
    return;
  const t = i();
  if (t?.shellOpenExternal) {
    t.shellOpenExternal(o);
    return;
  }
  typeof window < "u" && window.open(o, "_blank", "noopener,noreferrer");
}
async function L(e) {
  return r("tools_webview_browse_dialog", { request: { path: e ?? "" } });
}
async function P(e) {
  const o = String(e ?? "").trim();
  if (!o)
    throw new Error("listHostDir requires path");
  return r("tools_webview_list_dir", { path: o });
}
async function v(e) {
  const o = String(e ?? "").trim();
  if (!o)
    throw new Error("readHostFile requires path");
  return r("tools_webview_read_file", { path: o });
}
let s = null;
const O = () => (s ??= w({ invoke: r }), s), H = (e) => typeof window < "u" && typeof window.otools?.pickFromHostTree == "function" ? window.otools.pickFromHostTree(e) : O()(e);
let l = null;
const h = () => (l ??= u({
  invoke: (e, o) => f(e, o),
  listen: (e, o) => a(e, o)
}), l), b = (e) => typeof window < "u" && typeof window.otools?.onOtoolsKeyword == "function" ? window.otools.onOtoolsKeyword(e) : h()(e);
let p = null;
const m = () => (p ??= d({
  invoke: (e, o) => r(e, o),
  listen: (e, o) => c(e, o)
}), p), S = (e) => typeof window < "u" && typeof window.otools?.onOtoolsOpenFile == "function" ? window.otools.onOtoolsOpenFile(e) : m()(e), y = /^(?:transparent|#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|rgba|hsl|hsla)\([0-9 .,%/]{1,40}\))$/i, D = (e) => typeof e == "string" && e.length <= 48 && y.test(e);
export {
  C as CaptureError,
  oe as OTOOLS_FILE_DELIVER_EVENT,
  X as OTOOLS_KEYWORD_DISPATCH_EVENT,
  L as browseHostDir,
  ie as capture,
  R as createOtoolsAliasMap,
  $ as emit,
  B as getOtoolsApi,
  r as invoke,
  G as isOtoolsPluginRuntime,
  D as isValidHostThemeBackground,
  P as listHostDir,
  c as listen,
  b as onOtoolsKeyword,
  S as onOtoolsOpenFile,
  M as openExternal,
  U as openPath,
  V as otoolsTauriShimPlugin,
  te as parseLaunchOpenFiles,
  Y as pickDirectory,
  Z as pickFile,
  j as pickFiles,
  H as pickFromHostTree,
  z as pickZipFile,
  v as readHostFile,
  J as saveFile,
  x as shellOpen,
  T as shellOpenExternal,
  F as shellOpenPath,
  ne as toOpenFileEntries
};
//# sourceMappingURL=index.js.map
