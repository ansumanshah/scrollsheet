"use client";

/**
 * Pure, DOM-free swipe-to-dismiss math for the new shell's own rows — split
 * out from the hook itself (./use-toast-swipe.ts) for the same reason
 * shell-selectors.ts's own offset/position math is: directly testable
 * without mounting anything, matching this project's established
 * "extract the pure logic" convention (selectToastWindow, selectGhostCount).
 *
 * Ported from real Sonner's own Toast component
 * (~/code/references/sonner/src/index.tsx:49-62,315-427): 2-axis, direction
 * lock on first move past 1px, dampened (not blocked) movement against a
 * disallowed direction, and TWO release triggers — a px threshold OR a
 * velocity flick.
 */

import type { SwipeDirection, ToastPosition } from "../state";
import { splitPosition } from "./shell-selectors";

/** Real Sonner's own SWIPE_THRESHOLD (index.tsx:40) — px past which a release counts as a dismiss regardless of velocity. */
export const SWIPE_DISMISS_THRESHOLD_PX = 45;

/** Real Sonner's own inline velocity constant (index.tsx:348, `velocity > 0.11`) — px/ms past which a release dismisses even under the distance threshold, so a fast flick doesn't need the full distance. Inherited, not re-derived — see the port design's Open Risks #3 for the real-device-verification gap. */
export const SWIPE_VELOCITY_THRESHOLD = 0.11;

/** Real Sonner's own axis-lock trigger (index.tsx:381, `Math.abs(xDelta) > 1 || Math.abs(yDelta) > 1`). */
export const SWIPE_LOCK_THRESHOLD_PX = 1;

/**
 * Real Sonner's own `getDefaultSwipeDirections` (index.tsx:49-62), with one
 * fix: real Sonner's own implementation blindly pushes the position string's
 * x-half even when it's `'center'` — not a valid `SwipeDirection` at all —
 * so `getDefaultSwipeDirections('top-center')` returns `['top', 'center']`
 * in the real source. The port design's own per-position table
 * (`.claude/sonner-port-design.md`, Swipe section) already normalizes this
 * away: `top-center` -> `['top']`, not `['top', 'center']`. Ported to match
 * that documented table, not the literal (mistyped) real-Sonner line.
 */
export function getDefaultSwipeDirections(position: ToastPosition): SwipeDirection[] {
  const { y, x } = splitPosition(position);
  const directions: SwipeDirection[] = [y];
  if (x === "left" || x === "right") directions.push(x);
  return directions;
}

/**
 * Real Sonner's own axis lock (index.tsx:381-382): the first move past
 * `SWIPE_LOCK_THRESHOLD_PX` on either axis picks whichever moved further,
 * and that pick is sticky for the rest of the gesture — the caller only
 * calls this again while its own locked-axis ref is still `null`.
 */
export function lockSwipeAxis(dx: number, dy: number): "x" | "y" | null {
  if (Math.abs(dx) <= SWIPE_LOCK_THRESHOLD_PX && Math.abs(dy) <= SWIPE_LOCK_THRESHOLD_PX) {
    return null;
  }
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

/**
 * Real Sonner's own `getDampening` (index.tsx:387-391) folded together with
 * its "don't jump when transitioning to dampened movement" clamp
 * (index.tsx:401-403 / 412-415) — a raw delta damps toward 0, but the
 * dampened magnitude can never exceed the raw one, so movement never
 * visibly snaps forward the instant it crosses into dampened territory.
 */
export function dampenSwipeDelta(delta: number): number {
  const factor = Math.abs(delta) / 20;
  const damping = 1 / (1.5 + factor);
  const dampened = delta * damping;
  return Math.abs(dampened) < Math.abs(delta) ? dampened : delta;
}

/**
 * Real Sonner's own per-axis move handler (index.tsx:394-418), generalized
 * into one function called with whichever axis is locked instead of two
 * near-identical `if` blocks. `directions` gates in two tiers: the axis
 * itself must have AT LEAST ONE of its two directions allowed (an axis with
 * neither allowed never moves at all, full stop) — and independently,
 * moving toward the specific disallowed direction of an axis that IS
 * allowed gets dampened rather than zeroed, so a fast flick can still cross
 * the velocity trigger against a dampened direction (index.tsx:341-342's own
 * documented intent).
 */
export function computeSwipeAxisAmount(
  axis: "x" | "y",
  delta: number,
  directions: readonly SwipeDirection[],
): number {
  const negativeDir: SwipeDirection = axis === "x" ? "left" : "top";
  const positiveDir: SwipeDirection = axis === "x" ? "right" : "bottom";
  const axisEnabled = directions.includes(negativeDir) || directions.includes(positiveDir);
  if (!axisEnabled) return 0;
  const movingAllowedDirection =
    (directions.includes(negativeDir) && delta < 0) ||
    (directions.includes(positiveDir) && delta > 0);
  return movingAllowedDirection ? delta : dampenSwipeDelta(delta);
}

/** Real Sonner's own release-time direction check (index.tsx:343-346) — gates the two triggers below; a disallowed direction never dismisses no matter how far or fast it moved. */
export function isSwipeReleaseAllowed(
  axis: "x" | "y",
  amount: number,
  directions: readonly SwipeDirection[],
): boolean {
  if (axis === "x") return directions.includes(amount > 0 ? "right" : "left");
  return directions.includes(amount > 0 ? "bottom" : "top");
}

/** Real Sonner's own dual dismiss trigger (index.tsx:348) — a plain px threshold OR a velocity flick, either is enough on its own. */
export function shouldDismissOnSwipeRelease(
  amount: number,
  velocity: number,
  thresholdPx: number = SWIPE_DISMISS_THRESHOLD_PX,
  velocityThreshold: number = SWIPE_VELOCITY_THRESHOLD,
): boolean {
  return Math.abs(amount) >= thresholdPx || velocity > velocityThreshold;
}

/** Real Sonner's own swipe-out direction resolution (index.tsx:353-357). */
export function resolveSwipeOutDirection(
  axis: "x" | "y",
  amount: number,
): "left" | "right" | "up" | "down" {
  if (axis === "x") return amount > 0 ? "right" : "left";
  return amount > 0 ? "down" : "up";
}
