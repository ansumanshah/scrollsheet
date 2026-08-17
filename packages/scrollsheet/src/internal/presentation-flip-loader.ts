import { createFeatureLoader } from "./lazy-feature";

/** desktopSide re-present system: ships only to Roots that configure it.
 *  On a failed chunk fetch the sheet keeps its base `side` at every width
 *  for the session — degraded, never broken. */
export const presentationFlip = createFeatureLoader(() => import("./use-presentation-flip"));
