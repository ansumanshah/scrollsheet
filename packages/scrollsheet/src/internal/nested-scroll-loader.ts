import { createFeatureLoader } from "./lazy-feature";

/** Nested-scroller support (touch handoff + managed overlay thumb): loads
 *  once a `[data-scrollsheet-nested-scroll]` descendant exists inside the
 *  dialog, so sheets that never mark one never fetch it. On a failed fetch
 *  the marker degrades to a plain scroller for the session. */
export const nestedScroll = createFeatureLoader(() => import("./use-nested-scroll"));
