import { open as r, save as a } from "@tauri-apps/plugin-dialog";
async function f(t = {}) {
  const n = await r({
    ...t,
    directory: !0,
    multiple: !1
  });
  return e(n);
}
async function o(t = {}) {
  const n = await r({
    ...t,
    directory: !1,
    multiple: !1
  });
  return e(n);
}
async function u(t = {}) {
  const n = await r({
    ...t,
    directory: !1,
    multiple: !0
  });
  return l(n);
}
async function p(t = {}) {
  return o({
    ...t,
    filters: [c]
  });
}
async function y(t) {
  const i = await a(typeof t == "string" ? { defaultPath: t } : t);
  return e(i);
}
const c = {
  name: "Zip",
  extensions: ["zip"]
};
function e(t) {
  if (typeof t == "string") {
    const n = t.trim();
    return n || null;
  }
  if (t && typeof t == "object" && "path" in t) {
    const n = t.path;
    if (typeof n == "string") {
      const i = n.trim();
      return i || null;
    }
  }
  return null;
}
function l(t) {
  if (Array.isArray(t))
    return t.map((i) => e(i)).filter((i) => !!i);
  const n = e(t);
  return n ? [n] : [];
}
export {
  f as pickDirectory,
  o as pickFile,
  u as pickFiles,
  p as pickZipFile,
  y as saveFile
};
//# sourceMappingURL=dialog.js.map
