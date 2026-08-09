import { warnOnce } from "./dev-warn";

/**
 * Detents — the stops a sheet can rest at, in the spirit of
 * UISheetPresentationController's `detents`.
 *
 * A detent resolves to the visible height of the sheet in px.
 * Accepted forms:
 *   - 'full'            → viewport height minus top inset
 *   - 'medium'          → 50% of viewport
 *   - 'content'         → natural content height (measured, capped at full)
 *   - number in (0, 1]  → fraction of viewport
 *   - `${number}px`     → absolute pixels
 */

export type DetentSpec = "full" | "medium" | "content" | number | `${number}px`;

export interface DetentContext {
  /** Height of the sheet viewport (the scroll container), px. */
  viewportHeight: number;
  /** Measured natural height of the sheet content, px. */
  contentHeight: number;
  /** Gap left above the sheet at 'full', px. */
  topInset: number;
}

export interface ResolvedDetent {
  spec: DetentSpec;
  /** Visible sheet height at this detent, px. */
  height: number;
  /** Index in the sorted (ascending) detent list. */
  index: number;
}

export function resolveDetent(spec: DetentSpec, ctx: DetentContext): number {
  const max = Math.max(0, ctx.viewportHeight - ctx.topInset);
  if (spec === "full") return max;
  if (spec === "medium") return Math.min(max, ctx.viewportHeight * 0.5);
  if (spec === "content") return Math.min(max, ctx.contentHeight);
  if (typeof spec === "number") {
    if (spec <= 0) return 0;
    if (spec <= 1) return Math.min(max, ctx.viewportHeight * spec);
    // Numbers > 1 are treated as px for forgiveness.
    return Math.min(max, spec);
  }
  const px = Number.parseFloat(spec);
  return Number.isFinite(px) ? Math.min(max, Math.max(0, px)) : 0;
}

/** Resolve, de-dupe and sort ascending. Index is stable against the sorted order. */
export function resolveDetents(specs: readonly DetentSpec[], ctx: DetentContext): ResolvedDetent[] {
  const seen = new Set<number>();
  const resolved: Array<{ spec: DetentSpec; height: number }> = [];
  for (const spec of specs) {
    // Not a crash guard — resolveDetent() below still resolves the bad spec
    // exactly as it always has (parseFloat, or 0 if that fails too), which is
    // how a typo currently no-ops silently instead of erroring. Keyed by the
    // spec itself so a `detents` array with several distinct bad entries
    // gets a warning for each one, not just the first.
    const recognized =
      typeof spec === "number" ||
      spec === "full" ||
      spec === "medium" ||
      spec === "content" ||
      (typeof spec === "string" && spec.endsWith("px") && Number.isFinite(Number.parseFloat(spec)));
    if (!recognized) {
      const message = `scrollsheet: ${spec}: full/medium/content/number/px`;
      warnOnce(message, message);
    }
    const height = Math.round(resolveDetent(spec, ctx));
    if (height <= 0 || seen.has(height)) continue;
    seen.add(height);
    resolved.push({ spec, height });
  }
  return resolved.sort((a, b) => a.height - b.height).map((d, index) => ({ ...d, index }));
}

/**
 * Given a scroll offset (0 = fully hidden, height = fully revealed at that px),
 * find the nearest detent. Velocity biasing is left to native scroll-snap; this
 * is used for programmatic moves and for resolving post-snap state.
 */
export function nearestDetent(
  revealedPx: number,
  detents: readonly ResolvedDetent[],
): ResolvedDetent | null {
  let best: ResolvedDetent | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const d of detents) {
    const dist = Math.abs(revealedPx - d.height);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

/** `closeThreshold`: whether `revealed` (px) has dropped far enough below the first detent to dismiss. */
export function isBelowCloseThreshold(
  revealed: number,
  firstDetentHeight: number,
  closeThreshold: number,
): boolean {
  return revealed < firstDetentHeight * closeThreshold;
}

/**
 * `sequentialDetents`: clamp a velocity/projection-resolved (or post-settle)
 * target detent to the immediate neighbor of the detent the gesture started
 * from (or, for a native-scroll settle, the last settled detent), so a hard
 * fling or a fast scroll-snap resolution never skips an intermediate stop.
 * `startIndex` -1 (no matching start detent) passes `target` through
 * unclamped — `resolved`'s `index` field matches its own array position, so
 * a neighbor is a direct lookup, not a search.
 */
export function clampSequentialDetent(
  target: ResolvedDetent,
  startIndex: number,
  resolved: readonly ResolvedDetent[],
): ResolvedDetent {
  if (startIndex < 0) return target;
  if (target.index > startIndex + 1) return resolved[startIndex + 1] ?? target;
  if (target.index < startIndex - 1) return resolved[startIndex - 1] ?? target;
  return target;
}
