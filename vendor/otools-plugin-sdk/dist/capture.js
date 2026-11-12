import { listenTauri as r, invoke as t } from "./runtime.js";
import { createCaptureApi as e } from "./capture-factory.js";
import { CaptureError as n } from "./capture-factory.js";
const i = e({ invoke: t, listen: r });
export {
  n as CaptureError,
  i as capture,
  e as createCaptureApi
};
//# sourceMappingURL=capture.js.map
