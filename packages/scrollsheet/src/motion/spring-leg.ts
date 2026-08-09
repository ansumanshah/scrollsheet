/**
 * Pure curve/config selection for the enter/exit WAAPI leg — split out of
 * use-enter-exit-leg.ts's startEnterExitLeg so the interrupt-handling math is
 * independently testable and reusable outside the React hook. The hook still
 * owns every DOM read (matchMedia, getComputedStyle, track geometry) and
 * passes the results in as plain values.
 */

import {
  SHEET_SPRING,
  SHEET_SPRING_CONFIG,
  type SpringConfig,
  type SpringCurve,
  spring,
} from "./spring";

export interface CurveSelectionInput {
  /** Leg's start value (0 = open, 1 = offscreen). */
  from: number;
  /** Leg's target value. */
  to: 0 | 1;
  /** progress-units/sec carried over from an interrupted previous leg; 0 for a fresh leg. */
  velocity: number;
  reduced: boolean;
  /** `--scrollsheet-travel: none` opt-out. */
  noTravel: boolean;
  /** `env().linearEasing` — false on Safari 15.4-17.1. */
  linearEasing: boolean;
}

export interface CurveSelection {
  curve: SpringCurve;
  config: SpringConfig;
}

/** Instant / plain ease-out / velocity-seeded / default spring, in that precedence order. */
export function selectEnterExitCurve({
  from,
  to,
  velocity,
  reduced,
  noTravel,
  linearEasing,
}: CurveSelectionInput): CurveSelection {
  if (reduced || noTravel || Math.abs(to - from) < 1e-3) {
    return { curve: { easing: "linear", durationMs: 0 }, config: SHEET_SPRING_CONFIG };
  }
  if (!linearEasing) {
    return {
      curve: { easing: "ease-out", durationMs: SHEET_SPRING.durationMs },
      config: SHEET_SPRING_CONFIG,
    };
  }
  if (velocity !== 0) {
    const config = { ...SHEET_SPRING_CONFIG, velocity };
    return { curve: spring(config), config };
  }
  return { curve: SHEET_SPRING, config: SHEET_SPRING_CONFIG };
}

const MIN_DISMISS_DURATION_MS = 140;
const REVEALED_FRACTION_SKIP = 0.98;

/**
 * Scales a dismiss leg's duration down to the panel's actually-revealed
 * fraction, so a drag-release close that hands over an already-mostly-hidden
 * sheet doesn't play a dead tail (dialog open, backdrop lingering, nothing
 * moving). No-op below a floor duration and above the skip threshold.
 */
export function scaleDismissDuration(curve: SpringCurve, revealedFraction: number): SpringCurve {
  if (curve.durationMs <= 0 || revealedFraction >= REVEALED_FRACTION_SKIP) return curve;
  return {
    ...curve,
    durationMs: Math.max(MIN_DISMISS_DURATION_MS, Math.round(curve.durationMs * revealedFraction)),
  };
}
