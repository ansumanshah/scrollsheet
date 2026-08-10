/**
 * A minimal WAAPI wrapper for the panel's enter/exit legs — one numeric value
 * driving one CSS property, owned by one Content instance at a time.
 *
 * Why WAAPI, not a CSS transition: a transition can retarget position but
 * never carries velocity through an interruption, and
 * its end is a guessed `setTimeout`, not a completion signal. Here the leg's
 * `finished` promise is exact, and `stop()` recovers the current position and
 * velocity by re-running the same spring simulation the `linear()` easing was
 * sampled from (see spring.ts's sampleSpringAt) — no computed-style parsing.
 * The interrupted value seeds a fresh velocity-carrying spring for the next
 * leg, which is the part CSS structurally can't do.
 */

import { type SpringConfig, type SpringCurve, sampleSpringAt } from "./spring";

export interface AnimateHandle {
  /** Resolves on natural completion only — never on stop()/cancel(), never rejects. */
  readonly finished: Promise<void>;
  /** True once the leg is no longer driving the element (finished, stopped, or canceled). */
  readonly settled: boolean;
  /** The value the leg is heading toward. */
  readonly to: number;
  /** Paired duration of the generated curve, for backstop timers. */
  readonly durationMs: number;
  /**
   * Freeze the element at its current position (commitStyles + cancel) and
   * return the JS-computed value + velocity (value-units per second) there —
   * the handoff for a retargeted or gesture-grabbed leg.
   */
  stop(): { value: number; velocity: number };
  /** Drop the animation without committing anything. */
  cancel(): void;
}

/**
 * Animate `el`'s `prop` from `from` to `to` (numeric, in whatever unit space
 * `toCss` maps out of) along a spring's `linear()` curve. `config` must be
 * the same spring the curve was generated from — `stop()` re-simulates it.
 *
 * A zero/absent duration, a missing `el.animate` (no WAAPI), or a throwing
 * `animate()` call (e.g. an easing the engine can't parse) all degrade to an
 * immediately-finished no-op handle: the caller's CSS resting state for the
 * leg's end is what shows, an instant jump instead of a crash.
 */
export function animate(
  el: HTMLElement,
  prop: string,
  from: number,
  to: number,
  toCss: (value: number) => string,
  curve: SpringCurve,
  config: SpringConfig,
  /**
   * Additional properties driven by the same leg, each with its own
   * formatter over the same numeric value — one WAAPI animation, several
   * keyframe channels (the center presentation's zoom+fade pairs transform
   * with opacity). stop()/cancel() cover every channel; the recovered
   * value/velocity stay in the shared numeric space.
   */
  extraChannels?: Record<string, (value: number) => string>,
): AnimateHandle {
  let settled = false;
  let animation: Animation | null = null;
  let resolveFinished: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;

  const safeCancel = () => {
    // WAAPI throws on some idle/no-effect states; a dead animation is dead.
    try {
      animation?.cancel();
    } catch {}
    animation = null;
  };

  if (curve.durationMs > 0 && typeof el.animate === "function") {
    try {
      const keyframes: Record<string, string[]> = { [prop]: [toCss(from), toCss(to)] };
      if (extraChannels) {
        for (const [extraProp, format] of Object.entries(extraChannels)) {
          keyframes[extraProp] = [format(from), format(to)];
        }
      }
      animation = el.animate(keyframes, {
        duration: curve.durationMs,
        easing: curve.easing,
        fill: "both",
      });
      animation.finished.then(
        () => {
          if (settled) return;
          settled = true;
          // The caller's CSS resting rule for this leg's end state holds the
          // same value the animation ends on, so dropping the (fill: both)
          // animation at natural finish never flashes — and keeping it alive
          // would keep overriding later inline writes to the same property
          // (recede, overshoot) for the rest of the panel's life.
          safeCancel();
          resolveFinished();
        },
        () => {
          // Rejected == canceled (stop()/cancel() already handled state).
        },
      );
    } catch {
      animation = null;
    }
  }

  if (!animation && !settled) {
    settled = true;
    queueMicrotask(() => resolveFinished());
  }

  return {
    get settled() {
      return settled;
    },
    to,
    durationMs: curve.durationMs,
    finished,
    stop() {
      if (settled || !animation) return { value: to, velocity: 0 };
      settled = true;
      const elapsed = performance.now() - startedAt;
      const distance = to - from;
      let result = { value: to, velocity: 0 };
      if (elapsed < curve.durationMs) {
        const sample = sampleSpringAt(config, elapsed);
        result = {
          value: from + sample.value * distance,
          velocity: sample.velocity * distance,
        };
      }
      try {
        // The browser's own primitive for "hold what's on screen right now"
        // as inline style — no computed-style parsing. Throws if the element
        // isn't being rendered; the JS-sampled value stands in below.
        animation.commitStyles();
      } catch {
        el.style.setProperty(prop, toCss(result.value));
      }
      safeCancel();
      return result;
    },
    cancel() {
      if (settled) return;
      settled = true;
      safeCancel();
    },
  };
}
