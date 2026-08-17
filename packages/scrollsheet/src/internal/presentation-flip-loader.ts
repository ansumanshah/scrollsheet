import { createFeatureLoader } from "./lazy-feature";

/** desktopSide re-present system: ships only to Roots that configure it. */
export const presentationFlip = createFeatureLoader(() => import("./use-presentation-flip"));
