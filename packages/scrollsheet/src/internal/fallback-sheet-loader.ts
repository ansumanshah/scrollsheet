/**
 * Lazy entry to fallback-sheet.tsx, the static centered modal for the ~4% of
 * browsers with no <dialog>. The dynamic import keeps it out of the ~96%'s
 * bundles; Content preloads it on mount the moment the platform probe says
 * <dialog> is missing, so the module is resident before the first open. A
 * failed load resolves null and open renders nothing on that platform, which
 * is exactly the pre-fallback behavior this component exists to improve on —
 * the preload retries on the next mount rather than caching the failure.
 */

let pending: Promise<typeof import("./fallback-sheet") | null> | null = null;

export function preloadFallbackSheet(): Promise<typeof import("./fallback-sheet") | null> {
  pending ??= import("./fallback-sheet").catch(() => {
    pending = null;
    return null;
  });
  return pending;
}
