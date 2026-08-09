import { isBelowCloseThreshold } from "../internal/detents";

/**
 * Trackpad/wheel "session ended" idle gap — slightly above
 * SETTLE_FALLBACK_MS's 120ms since trackpad momentum can gap longer between
 * delta events than a discrete mouse wheel. Lives here, not
 * content-helpers.ts, so the wheel-latch feature stays self-contained.
 */
export const WHEEL_SESSION_IDLE_MS = 150;

/**
 * Pure end-of-wheel-session decision for single-detent sheets — a thin
 * wrapper over `isBelowCloseThreshold` so wheel and pointer/native-scroll
 * dismissal share exactly one threshold rule instead of a parallel one.
 * `accumulatedRevealedPx` is the caller's estimated revealed position for
 * this session (its starting revealed px plus the session's accumulated
 * wheel delta), not a raw delta — `isBelowCloseThreshold` compares an
 * absolute revealed value against `firstDetentHeight * closeThreshold`.
 */
export function resolveWheelLatch(
  accumulatedRevealedPx: number,
  firstDetentHeight: number,
  closeThreshold: number,
): "dismiss" | "detent" {
  return isBelowCloseThreshold(accumulatedRevealedPx, firstDetentHeight, closeThreshold)
    ? "dismiss"
    : "detent";
}
