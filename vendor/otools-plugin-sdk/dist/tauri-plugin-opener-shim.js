function e() {
  if (!(typeof window > "u"))
    return window.otools ?? window.utools;
}
async function l(o) {
  const n = e();
  if (n?.shellOpenExternal) {
    n.shellOpenExternal(o);
    return;
  }
  typeof window < "u" && window.open(o, "_blank", "noopener,noreferrer");
}
async function t(o) {
  const n = e();
  if (n?.shellOpenPath) {
    n.shellOpenPath(o);
    return;
  }
}
async function r(o) {
  const n = e();
  if (n?.shellShowItemInFolder) {
    n.shellShowItemInFolder(o);
    return;
  }
  await t(o);
}
export {
  t as openPath,
  l as openUrl,
  r as revealItemInDir
};
//# sourceMappingURL=tauri-plugin-opener-shim.js.map
