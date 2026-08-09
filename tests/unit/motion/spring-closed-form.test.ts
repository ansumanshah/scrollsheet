import { describe, expect, test } from "bun:test";

import {
  SHEET_SPRING_CONFIG,
  sampleSpringAt,
  spring,
  type SpringConfig,
} from "../../../packages/scrollsheet/src/motion/spring";

/**
 * Frozen copy of the pre-closed-form spring simulation (Euler-Cromer at
 * 240Hz, the implementation this module replaced) — kept here only as a
 * regression oracle, not reachable from src/. See the top-of-file note below
 * for why its curve is compared against, but not required to numerically
 * match, the new closed-form solver.
 */
const LEGACY_MAX_MS = 2000;
function legacySpring(config: SpringConfig = {}): { easing: string; durationMs: number } {
  const { stiffness = 260, damping = 30, mass = 1, velocity = 0, restDelta = 0.001 } = config;
  const step = 1 / 240;
  let x = 0;
  let v = velocity;
  const positions: number[] = [0];
  let t = 0;
  while (t < LEGACY_MAX_MS / 1000) {
    const accel = (-stiffness * (x - 1) - damping * v) / mass;
    v += accel * step;
    x += v * step;
    t += step;
    positions.push(x);
    if (Math.abs(1 - x) < restDelta && Math.abs(v) < restDelta * 10) break;
  }
  const durationMs = Math.round(t * 1000);
  return { easing: "", durationMs };
}
function legacySampleSpringAt(
  config: SpringConfig,
  atMs: number,
): { value: number; velocity: number } {
  const { stiffness = 260, damping = 30, mass = 1, velocity = 0 } = config;
  const step = 1 / 240;
  const target = Math.max(0, atMs) / 1000;
  let x = 0;
  let v = velocity;
  let t = 0;
  while (t < target && t < LEGACY_MAX_MS / 1000) {
    const accel = (-stiffness * (x - 1) - damping * v) / mass;
    v += accel * step;
    x += v * step;
    t += step;
  }
  return { value: x, velocity: v };
}

/**
 * RK4 at a very fine step — an independent numerical ground truth (not
 * shared code with either the legacy Euler simulation or the new closed
 * form) used to prove which of the two is actually correct.
 */
function rk4At(
  stiffness: number,
  damping: number,
  mass: number,
  velocity: number,
  atMs: number,
): number {
  const deriv = (x: number, v: number): [number, number] => {
    const accel = (-stiffness * (x - 1) - damping * v) / mass;
    return [v, accel];
  };
  const h = 1 / 200_000;
  let x = 0;
  let v = velocity;
  const steps = Math.round(Math.max(0, atMs) / 1000 / h);
  for (let i = 0; i < steps; i++) {
    const [k1x, k1v] = deriv(x, v);
    const [k2x, k2v] = deriv(x + (h / 2) * k1x, v + (h / 2) * k1v);
    const [k3x, k3v] = deriv(x + (h / 2) * k2x, v + (h / 2) * k2v);
    const [k4x, k4v] = deriv(x + h * k3x, v + h * k3v);
    x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  }
  return x;
}

const REPRESENTATIVE_CONFIGS: Array<[string, SpringConfig]> = [
  ["default", {}],
  ["SHEET_SPRING config", SHEET_SPRING_CONFIG],
  ["underdamped (dampingRatio < 1)", { stiffness: 300, damping: 12, mass: 1 }],
  ["critically damped (dampingRatio === 1 exactly)", { stiffness: 100, damping: 20, mass: 1 }],
  ["overdamped (dampingRatio > 1)", { stiffness: 200, damping: 60, mass: 1 }],
];

describe("closed-form spring matches independent ground truth (RK4)", () => {
  // This is the real correctness proof: sampleSpringAt is now a direct O(1)
  // analytic evaluation, so it should agree with a fine-step RK4 integration
  // of the same ODE (m x'' + c x' + k(x-1) = 0) to near machine precision —
  // no simulation-vs-simulation tolerance haggling needed.
  for (const [name, config] of REPRESENTATIVE_CONFIGS) {
    test(name, () => {
      const { stiffness = 260, damping = 30, mass = 1, velocity = 0 } = config;
      for (const atMs of [0, 10, 30, 50, 100, 200, 300, 500, 800]) {
        const truth = rk4At(stiffness, damping, mass, velocity, atMs);
        const closedForm = sampleSpringAt(config, atMs).value;
        expect(Math.abs(closedForm - truth)).toBeLessThan(1e-6);
      }
    });
  }
});

describe("old-vs-new agreement (default + 3 damping-regime configs)", () => {
  // The brief for this change asked for old-vs-new curve sample agreement
  // within 1% across the duration. That number turns out not to be
  // achievable and is NOT used below — measured and independently confirmed
  // against RK4 (see the describe block above and the worktree report):
  // the legacy Euler-Cromer simulation at a 1/240s step has real numerical
  // error, up to ~20% locally in the first ~50-100ms of a stiff/near-critical
  // spring (e.g. SHEET_SPRING's config) before it decays as the curve
  // settles. The closed-form solver is the one that's correct (RK4-verified
  // above); the legacy simulation was the one with error, which is exactly
  // what "keyframes carry no integration error" (this change's own stated
  // goal) means eliminating. Matching that error to within 1% would mean
  // reproducing the bug this change removes.
  //
  // What's asserted instead, calibrated to what's actually measured (with
  // margin) rather than an arbitrary tighter number that would sometimes
  // fail: RMS agreement across the duration stays under 3% (measured max
  // ~1.86%, underdamped/bouncy config) and no single sample point differs
  // by more than 10% (measured max ~7.15%, same config) — both far tighter
  // than would survive a sign error, a wrong-regime branch, or a
  // unit/scale mistake, which is what a regression here would actually
  // look like.
  for (const [name, config] of REPRESENTATIVE_CONFIGS) {
    test(`${name}: RMS < 3%, worst sample < 10%, duration within 10%`, () => {
      const legacyCurve = legacySpring(config);
      const newCurve = spring(config);

      const durationDiffPct =
        (Math.abs(legacyCurve.durationMs - newCurve.durationMs) / legacyCurve.durationMs) * 100;
      expect(durationDiffPct).toBeLessThan(10);

      let sumSquaredError = 0;
      let worstError = 0;
      let n = 0;
      for (let ms = 0; ms <= legacyCurve.durationMs; ms += 5) {
        const legacyValue = legacySampleSpringAt(config, ms).value;
        const newValue = sampleSpringAt(config, ms).value;
        const error = Math.abs(legacyValue - newValue);
        sumSquaredError += error * error;
        worstError = Math.max(worstError, error);
        n++;
      }
      const rms = Math.sqrt(sumSquaredError / n);
      expect(rms).toBeLessThan(0.03);
      expect(worstError).toBeLessThan(0.1);
    });
  }
});

describe("sampleSpringAt is O(1) (no per-call re-simulation loop)", () => {
  test("cost at a late elapsed time is not proportional to that elapsed time", () => {
    // A residual simulate-from-0 loop would make a call at 1900ms take
    // roughly 1900/10 = 190x longer than a call at 10ms; the closed form
    // does the same fixed amount of work (a handful of trig/exp calls)
    // regardless of atMs.
    const iterations = 20_000;
    const early = () => sampleSpringAt(SHEET_SPRING_CONFIG, 10);
    const late = () => sampleSpringAt(SHEET_SPRING_CONFIG, 1900);

    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) early();
    const earlyMs = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < iterations; i++) late();
    const lateMs = performance.now() - t1;

    // Generous ceiling (a real O(1) solver's early/late calls should cost
    // about the same); a 10x-plus gap would indicate a lingering loop.
    expect(lateMs).toBeLessThan(Math.max(earlyMs * 10, 5));
  });
});

describe("non-convergence is surfaced explicitly, not silently truncated", () => {
  test("a spring that never settles throws instead of returning a truncated curve", () => {
    // damping: 0 with default restDelta never crosses the rest threshold —
    // the envelope never decays, so the search runs out the MAX_MS clock.
    expect(() => spring({ stiffness: 260, damping: 0, mass: 1 })).toThrow(/did not settle/);
  });

  test("a config that does settle within MAX_MS does not throw", () => {
    expect(() => spring(SHEET_SPRING_CONFIG)).not.toThrow();
  });
});
