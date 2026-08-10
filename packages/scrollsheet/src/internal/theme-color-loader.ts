/**
 * Lazy entry to theme-color.ts, the only module Content pulls in for an
 * opt-in prop. The dynamic import keeps it out of every consumer bundle
 * where `themeColorDimming` is never set; Content preloads it on mount the
 * moment the prop is true, so the module is resident before a user gesture
 * can open the sheet. A failed load resolves null and the sheet simply
 * renders without meta dimming, matching platforms that ignore theme-color.
 */

let pending: Promise<typeof import("./theme-color") | null> | null = null;

export function preloadThemeColor(): Promise<typeof import("./theme-color") | null> {
  pending ??= import("./theme-color").catch(() => null);
  return pending;
}
