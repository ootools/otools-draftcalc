function o() {
  return typeof window > "u" ? "unknown" : window.otools?.getAppVersion?.() ?? window.utools?.getAppVersion?.() ?? window.__OToolsEnv?.appVersion ?? "unknown";
}
async function n() {
  return o();
}
async function e() {
  return typeof window > "u" ? "OTools" : window.otools?.getAppName?.() ?? window.utools?.getAppName?.() ?? window.__OToolsEnv?.appName ?? "OTools";
}
export {
  e as getName,
  n as getVersion
};
//# sourceMappingURL=tauri-app-shim.js.map
