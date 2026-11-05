import { createFeatureLoader } from "./lazy-feature";

/**
 * Lazy entry to theme-color.ts. Content starts the load on mount the moment the
 * prop is true, so the module is resident before a user gesture can open the
 * sheet. A failed load renders without dimming, matching platforms that ignore
 * theme-color.
 */
export const themeColor = createFeatureLoader(() => import("./theme-color"));
