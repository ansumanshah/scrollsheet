import { createFeatureLoader } from "./lazy-feature";

/** Software-keyboard engine: loads on the first editable focus inside a
 *  sheet, so input-less sheets never fetch it. On a failed fetch the sheet
 *  keeps pre-keyboard behavior (no inset tracking) for the session. */
export const keyboardViewport = createFeatureLoader(() => import("./use-keyboard-viewport"));
