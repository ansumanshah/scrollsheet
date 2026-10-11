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
  /** `animationSpeed` time multiplier (2 = twice as fast); 1 when omitted. */
  speed?: number;
}

export interface CurveSelection {
  curve: SpringCurve;
  config: SpringConfig;
}

/**
 * The sheet spring played `speed` times faster. Scaling time by `s` is
 * stiffness * s^2 and damping * s at the same mass: the damping ratio (the
 * curve's shape) is unchanged and only the clock runs faster, so the
 * prebuilt SHEET_SPRING easing still describes it at durationMs / s, and
 * stop()'s re-simulation from this config lands on the same curve.
 */
export function scaleSheetSpring(speed: number): SpringConfig {
  if (speed === 1) return SHEET_SPRING_CONFIG;
  const { stiffness = 260, damping = 30 } = SHEET_SPRING_CONFIG;
  return { ...SHEET_SPRING_CONFIG, stiffness: stiffness * speed * speed, damping: damping * speed };
}

/** Instant / plain ease-out / velocity-seeded / default spring, in that precedence order. */
export function selectEnterExitCurve({
  from,
  to,
  velocity,
  reduced,
  noTravel,
  linearEasing,
  speed = 1,
}: CurveSelectionInput): CurveSelection {
  const config = scaleSheetSpring(speed);
  const durationMs = Math.round(SHEET_SPRING.durationMs / speed);
  if (reduced || noTravel || Math.abs(to - from) < 1e-3) {
    return { curve: { easing: "linear", durationMs: 0 }, config };
  }
  if (!linearEasing) {
    return { curve: { easing: "ease-out", durationMs }, config };
  }
  if (velocity !== 0) {
    // Generated at base speed and stretched: the curve is time-normalized,
    // and spring() refuses anything that settles past its own ceiling,
    // which a slowed (speed < ~0.25) leg would.
    const base = spring({ ...SHEET_SPRING_CONFIG, velocity: velocity / speed });
    return {
      curve: { ...base, durationMs: Math.round(base.durationMs / speed) },
      config: { ...config, velocity },
    };
  }
  return { curve: speed === 1 ? SHEET_SPRING : { ...SHEET_SPRING, durationMs }, config };
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
    durationMs: Math.max(
      Math.min(MIN_DISMISS_DURATION_MS, curve.durationMs),
      Math.round(curve.durationMs * revealedFraction),
    ),
  };
}
