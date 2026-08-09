"use client";

/**
 * Pure, DOM-free helpers for the new sonner-architecture shell — split out
 * so the offset/position math is directly unit-testable, matching this
 * project's existing convention of extracting pure logic (selectToastWindow,
 * selectGhostCount) specifically so it's provable without mounting anything.
 */

import type { ToastPosition, ToastRecord } from "../state";

/** Real Sonner's own position-string split — `'top-left'` -> `{y:'top', x:'left'}`. */
export function splitPosition(position: ToastPosition): {
  y: "top" | "bottom";
  x: "left" | "center" | "right";
} {
  const [y, x] = position.split("-") as ["top" | "bottom", "left" | "center" | "right"];
  return { y, x };
}

/**
 * Every position this Toaster instance needs its own `<ol>` for: its own
 * `position` prop (always first, always present even with zero toasts —
 * matches real Sonner exactly) plus any distinct per-toast position override
 * actually present among `toasts`. Pure, exported for tests.
 */
export function computePossiblePositions(
  defaultPosition: ToastPosition,
  toasts: readonly ToastRecord[],
): ToastPosition[] {
  const seen = new Set<ToastPosition>([defaultPosition]);
  for (const t of toasts) if (t.position) seen.add(t.position);
  return [...seen];
}

export interface RowOffset {
  id: number | string;
  /** 0-based position in the newest-first list — real Sonner's own `index`. */
  index: number;
  /** Real Sonner's own `--toasts-before` — identical to `index` here (every row, visible or hidden, gets one). */
  toastsBefore: number;
  /** Real Sonner's own `--offset` — cumulative height of every strictly-newer row, plus one `gap` per row crossed. */
  stackOffset: number;
}

/**
 * Pure, exported for tests. `newestFirst` must already be newest-first
 * (the same view `selectToastWindow` produces). Computed across the WHOLE
 * position group — visible and hidden alike — so a hidden row already has a
 * correct resting offset queued up before it's ever promoted to visible;
 * mirrors real Sonner's own `heightIndex * gap + toastsHeightBefore`
 * (index.tsx), just keyed by array position instead of a separate
 * `heights`-array lookup since this port's own heights are already a
 * per-id map (see use-toast-heights.ts) rather than a parallel array.
 */
export function computeRowOffsets(
  newestFirst: readonly ToastRecord[],
  heights: ReadonlyMap<number | string, number>,
  gap: number,
): RowOffset[] {
  let cumulativeHeight = 0;
  return newestFirst.map((record, index) => {
    const stackOffset = index * gap + cumulativeHeight;
    cumulativeHeight += heights.get(record.id) ?? 0;
    return { id: record.id, index, toastsBefore: index, stackOffset };
  });
}

/**
 * The newest dismissible record across `toasts` — every position combined,
 * oldest-first (state.ts's own store order). CloseWatcher's dismiss target:
 * position-agnostic, like the old Sheet-backed Toaster's single `front` was
 * (a back-gesture dismisses whichever toast is newest for this Toaster
 * instance, not scoped to whichever corner happens to have focus).
 */
export function findNewestDismissible(toasts: readonly ToastRecord[]): ToastRecord | undefined {
  for (let i = toasts.length - 1; i >= 0; i -= 1) {
    const t = toasts[i];
    if (t && t.dismissible !== false) return t;
  }
  return undefined;
}
