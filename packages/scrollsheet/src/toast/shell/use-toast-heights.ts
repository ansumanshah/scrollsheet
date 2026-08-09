"use client";

/**
 * Per-position heights bookkeeping for the new toast shell: one
 * ResizeObserver per row (an upgrade over real Sonner's own dependency-array
 * remeasure, which only reacts to title/description/jsx/action/cancel
 * changing — it misses a height change driven by a `toast.custom()` node's
 * own internal state). Mirrors use-content-morph.ts's existing "observe the
 * node, re-read getBoundingClientRect() on fire" convention rather than
 * reading the ResizeObserverEntry's own box (shape differs across engines,
 * and this codebase already has a working, tested pattern for the simpler
 * re-read).
 */
import * as React from "react";

export interface ToastHeightsApi {
  heights: ReadonlyMap<number | string, number>;
  /** Attach (or, on `null`, detach) the ResizeObserver for one row's id. Safe to call every render. */
  observe: (id: number | string, el: HTMLElement | null) => void;
  /** Drop a row's entry outright — called once a row is genuinely removed (not merely hidden past visibleToasts), mirroring real Sonner's own deleteToast() height cleanup so a departing row's height stops counting toward its still-live siblings' offsets. */
  forget: (id: number | string) => void;
}

export function useToastHeights(): ToastHeightsApi {
  const [heights, setHeights] = React.useState<ReadonlyMap<number | string, number>>(
    () => new Map(),
  );
  const observersRef = React.useRef(new Map<number | string, ResizeObserver>());

  const setHeight = React.useCallback((id: number | string, height: number) => {
    setHeights((prev) => (prev.get(id) === height ? prev : new Map(prev).set(id, height)));
  }, []);

  const forget = React.useCallback((id: number | string) => {
    observersRef.current.get(id)?.disconnect();
    observersRef.current.delete(id);
    setHeights((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const observe = React.useCallback(
    (id: number | string, el: HTMLElement | null) => {
      const observers = observersRef.current;
      observers.get(id)?.disconnect();
      observers.delete(id);
      if (!el || typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => setHeight(id, el.getBoundingClientRect().height));
      ro.observe(el);
      observers.set(id, ro);
      // Seed the first measurement synchronously — the observer's own first
      // callback fires async (a real browser defers it to the next paint),
      // and a row shouldn't sit at height 0 for that whole first frame.
      setHeight(id, el.getBoundingClientRect().height);
    },
    [setHeight],
  );

  React.useEffect(() => {
    const observers = observersRef.current;
    return () => {
      for (const ro of observers.values()) ro.disconnect();
      observers.clear();
    };
  }, []);

  return { heights, observe, forget };
}
