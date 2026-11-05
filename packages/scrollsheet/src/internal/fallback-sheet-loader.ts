import { createFeatureLoader } from "./lazy-feature";

/**
 * Lazy entry to fallback-sheet.tsx, the static modal for the ~3% of browsers
 * with no <dialog>. Content starts the load on mount the moment the platform
 * probe says <dialog> is missing, so the module is resident before the first
 * open. A failed load renders nothing on that platform and retries on the next
 * mount.
 */
export const fallbackSheet = createFeatureLoader(() => import("./fallback-sheet"));
