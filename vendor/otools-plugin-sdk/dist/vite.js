import { createOtoolsAliasMap as o } from "./aliases.js";
function i() {
  return {
    name: "otools-tauri-shim",
    config() {
      return {
        resolve: {
          alias: o()
        }
      };
    }
  };
}
export {
  o as createOtoolsAliasMap,
  i as otoolsTauriShimPlugin
};
//# sourceMappingURL=vite.js.map
