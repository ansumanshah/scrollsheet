/**
 * Spring physics → CSS `linear()` easing.
 *
 * Simulates a damped spring and samples it into a `linear()` timing function,
 * so transitions get real spring motion with zero JS on the animation path.
 * The output runs on the compositor; the simulation runs once (and is cached).
 *
 * The per-regime closed-form solutions in `createSpringSolver` are adapted from
 * motion-dom's spring generator (MIT license) —
 * https://github.com/motiondivision/motion, packages/motion-dom/src/animation/generators/spring.ts —
 * re-derived for this library's fixed 0 → 1 progress convention instead of motion's
 * generic origin/target pair.
 */

export interface SpringConfig {
  /** Stiffness (N/m). Higher = snappier. */
  stiffness?: number;
  /** Damping coefficient. Higher = less oscillation. */
  damping?: number;
  /** Mass. Higher = more inertia. */
  mass?: number;
  /** Initial velocity in units of total-distance per second (from a gesture handoff). */
  velocity?: number;
  /** Rest threshold as a fraction of distance. */
  restDelta?: number;
}

export interface SpringCurve {
  /** CSS timing function: `linear(0, 0.29 4.3%, …, 1)` */
  easing: string;
  /** Duration in ms that pairs with the easing. */
  durationMs: number;
}

const SAMPLE_HZ = 60;
const MAX_MS = 2000;

interface SpringSample {
  value: number;
  velocity: number;
}

/**
 * Closed-form solution of the damped spring ODE (m·x″ + c·x′ + k·(x−1) = 0,
 * x(0)=0) split by damping regime. Each returned `resolveAt(t)` call is a
 * direct O(1) trig/exp evaluation, not a forward-integration step — so
 * repeated sampling (interrupt handling) carries no accumulated numerical
 * error and never needs to re-simulate from t=0.
 */
function createSpringSolver(
  stiffness: number,
  damping: number,
  mass: number,
  velocity: number,
): (t: number) => SpringSample {
  const undampedAngularFreq = Math.sqrt(stiffness / mass);
  const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
  const target = 1;
  const initialDelta = 1; // target(1) − origin(0), fixed by this library's progress convention
  // The closed forms below solve for x'(0) in terms of -velocity; negating here
  // is what makes resolveAt(0).velocity come back out as the caller's velocity.
  const v0 = -velocity;

  if (dampingRatio < 1) {
    const angularFreq = undampedAngularFreq * Math.sqrt(1 - dampingRatio * dampingRatio);
    const A = (v0 + dampingRatio * undampedAngularFreq * initialDelta) / angularFreq;
    const sinCoeff = dampingRatio * undampedAngularFreq * A + initialDelta * angularFreq;
    const cosCoeff = dampingRatio * undampedAngularFreq * initialDelta - A * angularFreq;
    return (t) => {
      const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
      const sin = Math.sin(angularFreq * t);
      const cos = Math.cos(angularFreq * t);
      return {
        value: target - envelope * (A * sin + initialDelta * cos),
        velocity: envelope * (sinCoeff * sin + cosCoeff * cos),
      };
    };
  }

  if (dampingRatio === 1) {
    const C = v0 + undampedAngularFreq * initialDelta;
    return (t) => {
      const envelope = Math.exp(-undampedAngularFreq * t);
      return {
        value: target - envelope * (initialDelta + C * t),
        velocity: envelope * (undampedAngularFreq * C * t - v0),
      };
    };
  }

  const dampedAngularFreq = undampedAngularFreq * Math.sqrt(dampingRatio * dampingRatio - 1);
  const P = (v0 + dampingRatio * undampedAngularFreq * initialDelta) / dampedAngularFreq;
  const sinhCoeff = dampingRatio * undampedAngularFreq * P - initialDelta * dampedAngularFreq;
  const coshCoeff = dampingRatio * undampedAngularFreq * initialDelta - P * dampedAngularFreq;
  return (t) => {
    const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
    // sinh/cosh overflow past ~710; capping keeps this finite once envelope has already collapsed the term to ~0
    const freqForT = Math.min(dampedAngularFreq * t, 300);
    const sinh = Math.sinh(freqForT);
    const cosh = Math.cosh(freqForT);
    return {
      value: target - envelope * (P * sinh + initialDelta * cosh),
      velocity: envelope * (sinhCoeff * sinh + coshCoeff * cosh),
    };
  };
}

/**
 * Simulate the spring in closed form, then sample down to `linear()` keypoints.
 * Throws if the config cannot settle inside the search horizon (for example
 * damping 0) instead of silently truncating the curve.
 */
export function spring(config: SpringConfig = {}): SpringCurve {
  const { stiffness = 260, damping = 30, mass = 1, velocity = 0, restDelta = 0.001 } = config;
  const resolveAt = createSpringSolver(stiffness, damping, mass, velocity);

  // Each step reads the closed form directly (O(1) eval), not a
  // forward-integration estimate — the search costs one eval per 1/240s and
  // never drifts from the true curve.
  const step = 1 / 240;
  let t = 0;
  let settled = false;
  while (t < MAX_MS / 1000) {
    const sample = resolveAt(t);
    if (Math.abs(1 - sample.value) < restDelta && Math.abs(sample.velocity) < restDelta * 10) {
      settled = true;
      break;
    }
    t += step;
  }
  if (!settled) {
    // Fail loudly rather than truncate: a linear() curve whose last keyframe
    // hasn't reached rest visibly pops instead of settling. Only fires for a
    // genuinely broken config (near-zero or negative damping/stiffness).
    throw new Error(
      `spring() did not settle within ${MAX_MS}ms (stiffness=${stiffness}, damping=${damping}, ` +
        `mass=${mass}, restDelta=${restDelta}) — check for near-zero damping/stiffness or an ` +
        `unreachable restDelta.`,
    );
  }

  const durationMs = Math.round(t * 1000);
  const durationSec = t;
  const samples = Math.max(2, Math.round((durationMs / 1000) * SAMPLE_HZ));

  // Dense, evenly spaced candidates first; then adaptive simplification
  // drops every point a straight line between its kept neighbors already
  // predicts within tolerance — spring tails are nearly linear, so this
  // roughly halves the emitted stops with no visible motion change.
  const candidates: Array<{ p: number; y: number }> = [];
  for (let i = 0; i <= samples; i++) {
    const p = i / samples;
    candidates.push({ p, y: resolveAt(p * durationSec).value });
  }
  const TOLERANCE = 0.0015;
  const keep = new Array<boolean>(candidates.length).fill(false);
  keep[0] = keep[candidates.length - 1] = true;
  const stack: Array<[number, number]> = [[0, candidates.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (hi - lo < 2) continue;
    const a = candidates[lo]!;
    const b = candidates[hi]!;
    let worst = -1;
    let worstError = TOLERANCE;
    for (let i = lo + 1; i < hi; i++) {
      const c = candidates[i]!;
      const predicted = a.y + ((b.y - a.y) * (c.p - a.p)) / (b.p - a.p);
      const error = Math.abs(c.y - predicted);
      if (error > worstError) {
        worstError = error;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = true;
      stack.push([lo, worst], [worst, hi]);
    }
  }

  const kept = candidates.filter((_, i) => keep[i]);
  const parts = kept.map((c, i) => {
    const rounded = Math.round(c.y * 1000) / 1000;
    return i === 0 || i === kept.length - 1
      ? String(rounded)
      : `${rounded} ${Math.round(c.p * 1000) / 10}%`;
  });

  return { easing: `linear(${parts.join(", ")})`, durationMs };
}

/**
 * Sample the same closed-form solution at a single elapsed time — progress and
 * velocity (progress-units per second) at `atMs`. This is what lets an
 * in-flight WAAPI enter/exit leg be interrupted mid-travel: the browser is
 * playing a `linear()` curve sampled from this exact solution, so
 * re-evaluating it at the elapsed wall-clock time recovers the current
 * position and velocity without parsing any computed style (see
 * internal/animate.ts). O(1): a direct analytic evaluation, never a
 * re-simulation from t=0.
 */
export function sampleSpringAt(
  config: SpringConfig,
  atMs: number,
): { value: number; velocity: number } {
  const { stiffness = 260, damping = 30, mass = 1, velocity = 0 } = config;
  const resolveAt = createSpringSolver(stiffness, damping, mass, velocity);
  const t = Math.min(Math.max(0, atMs), MAX_MS) / 1000;
  return resolveAt(t);
}

/** The config behind SHEET_SPRING — for velocity-seeded re-generation on interrupt. */
export const SHEET_SPRING_CONFIG: SpringConfig = {
  stiffness: 380,
  damping: 38,
  mass: 1,
};

/**
 * The default sheet spring — tuned to feel like UISheetPresentationController:
 * near-critically-damped (damping ratio ~0.975, negligible overshoot) at
 * ~475ms closed-form duration.
 */
export const SHEET_SPRING: SpringCurve = /* @__PURE__ */ spring(SHEET_SPRING_CONFIG);
