import { isIOS } from "./env";
import { createFeatureLoader } from "./lazy-feature";

/** iOS body freeze: fetched at module evaluation on iOS only (every other
 *  platform never fetches it), so it is resident before any sheet a user
 *  opens. On a failed fetch the body stays scrollable behind the sheet for
 *  the session, today's behavior on every non-iOS engine. */
export const bodyFreeze = createFeatureLoader(() => import("./use-body-freeze"));
if (isIOS()) void bodyFreeze.preload();
