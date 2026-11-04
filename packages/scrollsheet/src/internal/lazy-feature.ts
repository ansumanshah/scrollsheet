import * as React from "react";

/**
 * Feature-chunk loading (the theme-color pattern generalized). Each feature
 * keeps a tiny `*-loader.ts` in the core graph holding the `import()`
 * literal (bundlers need the literal to split); loading fires at the
 * earliest knowable moment — mount plus a gate — never at first activation,
 * which would race the state the feature exists to handle.
 */

export interface FeatureLoader<T> {
  /** Fire (or join) the fetch; resolves null on failure, never rejects. */
  preload: () => Promise<T | null>;
  /** Null until resolved. `active` false never fetches (and is the SSR
   *  guard — the fetch lives in an effect). */
  useFeature: (active: boolean) => T | null;
}

export function createFeatureLoader<T>(importer: () => Promise<T>): FeatureLoader<T> {
  let pending: Promise<T | null> | null = null;
  let resident: T | null = null;
  const preload = () =>
    (pending ??= importer()
      .then((m) => (resident = m))
      .catch(() => null));
  // A resident chunk resolves in the first render, so a feature that was
  // preloaded applies in the same commit as the state it guards.
  function useFeature(active: boolean): T | null {
    const [mod, setMod] = React.useState<T | null>(() => (active ? resident : null));
    React.useEffect(() => {
      if (!active || mod) return;
      let alive = true;
      void preload().then((resolved) => {
        // Updater form: a function-valued module must not be invoked as a
        // setState updater.
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
