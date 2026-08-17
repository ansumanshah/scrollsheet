import { createFeatureLoader } from "./lazy-feature";

/**
 * The desktopSide/desktopBreakpoint re-present system ships only to Roots
 * that configure it. The import() literal must live here, in the core
 * graph, for bundlers to split the chunk.
 */
export const presentationFlip = createFeatureLoader(() => import("./use-presentation-flip"));
