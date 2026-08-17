import { createFeatureLoader } from "./lazy-feature";

/** Content-height morph animation. Universal (every sheet observes its
 *  body), so this defers the bytes rather than gating them; on a failed
 *  fetch content resizes land without the spring. */
export const contentMorph = createFeatureLoader(() => import("./use-content-morph"));
