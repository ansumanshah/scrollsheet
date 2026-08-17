import * as React from "react";

/**
 * Shared machinery for feature chunks — the theme-color/fallback-sheet
 * loader pattern generalized. Each feature keeps its own tiny `*-loader.ts`
 * in the core graph holding nothing but the dynamic `import()` literal
 * (bundlers need the literal to split the chunk); everything reachable only
 * through that import ships on demand instead of in the default bundle.
 *
 * Loading fires at the earliest KNOWABLE moment (mount plus a gate), never
 * at first activation: a feature that waited for its own trigger to start
 * fetching would race the very state it exists to handle (the beta.4/beta.5
 * mid-transition reconciliation bug class).
 */

/**
 * Chunks whose resolve gates an open sequence (a `fill` sheet's detent
 * measurement, a nested child's first recede frame). The set is module-level
 * because chunk residency is process-wide, not per-sheet.
 */
const pendingCritical = new Set<Promise<unknown>>();

/**
 * Mark a chunk load as open-gating. Returns the same promise so call sites
 * can chain. The entry removes itself on settle either way — a failed load
 * must not wedge every future open (the feature is absent, opens proceed).
 */
export function trackCritical<T>(promise: Promise<T>): Promise<T> {
  pendingCritical.add(promise);
  const drop = () => {
    pendingCritical.delete(promise);
  };
  promise.then(drop, drop);
  return promise;
}

/**
 * Null when nothing is pending — the open sequence stays fully synchronous
 * unless a critical chunk is genuinely in flight (first open of a session,
 * cold cache), so settled-state timing never changes.
 */
export function ensureFeatures(): Promise<void> | null {
  if (pendingCritical.size === 0) return null;
  return Promise.all([...pendingCritical]).then(() => undefined);
}

export interface FeatureLoader<T> {
  /** Fire (or join) the fetch; resolves null on failure, never rejects. */
  preload: () => Promise<T | null>;
  /**
   * Mount-side accessor: null until resolved, then the module namespace.
   * `active` false never fires the fetch (and is the SSR guard — the fetch
   * lives in an effect).
   */
  useFeature: (active: boolean) => T | null;
}

export function createFeatureLoader<T>(importer: () => Promise<T>): FeatureLoader<T> {
  let pending: Promise<T | null> | null = null;
  const preload = () => (pending ??= importer().catch(() => null));
  function useFeature(active: boolean): T | null {
    const [mod, setMod] = React.useState<T | null>(null);
    React.useEffect(() => {
      if (!active || mod) return;
      let alive = true;
      void preload().then((resolved) => {
        // Updater form: a module namespace is an object today, but T is
        // caller-chosen and a function-valued module must not be invoked
        // as a setState updater.
        if (alive && resolved) setMod(() => resolved);
      });
      return () => {
        alive = false;
      };
    }, [active, mod]);
    return mod;
  }
  return { preload, useFeature };
}
