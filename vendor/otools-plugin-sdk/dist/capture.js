import { listenTauri as i, invoke as u } from "./runtime.js";
import { createCaptureApi as p } from "./capture-factory.js";
import { CaptureError as m } from "./capture-factory.js";
let e = null;
const c = () => {
  const o = typeof window < "u" ? window.otools?.capture : void 0;
  return o || (e ??= p({ invoke: u, listen: i }), e);
}, l = new Proxy({}, {
  get(o, n) {
    const r = c(), t = r[n];
    return typeof t == "function" ? t.bind(r) : t;
  }
});
export {
  m as CaptureError,
  l as capture
};
//# sourceMappingURL=capture.js.map
