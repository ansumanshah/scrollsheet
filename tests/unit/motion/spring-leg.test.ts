import { describe, expect, test } from "bun:test";

import {
  SHEET_SPRING,
  SHEET_SPRING_CONFIG,
  sampleSpringAt,
} from "../../../packages/scrollsheet/src/motion/spring";
import {
  scaleDismissDuration,
  scaleSheetSpring,
  selectEnterExitCurve,
} from "../../../packages/scrollsheet/src/motion/spring-leg";

const base = {
  from: 0,
  to: 1 as const,
  velocity: 0,
  reduced: false,
  noTravel: false,
  linearEasing: true,
};

describe("selectEnterExitCurve precedence", () => {
  test("reduced motion wins over everything: instant leg", () => {
    const { curve } = selectEnterExitCurve({
      ...base,
      reduced: true,
      velocity: 3,
      linearEasing: false,
    });
    expect(curve.durationMs).toBe(0);
    expect(curve.easing).toBe("linear");
  });

  test("--scrollsheet-travel: none degrades identically to reduced motion", () => {
    const { curve } = selectEnterExitCurve({ ...base, noTravel: true });
    expect(curve.durationMs).toBe(0);
  });

  test("from≈to is an instant no-op leg", () => {
    const { curve } = selectEnterExitCurve({ ...base, from: 1 - 1e-4 });
    expect(curve.durationMs).toBe(0);
  });

  test("no linear() support falls back to ease-out at the spring's duration", () => {
    const { curve } = selectEnterExitCurve({ ...base, linearEasing: false, velocity: 2 });
    expect(curve.easing).toBe("ease-out");
    expect(curve.durationMs).toBe(SHEET_SPRING.durationMs);
  });

  test("carried velocity seeds a fresh spring config", () => {
    const { curve, config } = selectEnterExitCurve({ ...base, velocity: 2 });
    expect(config.velocity).toBe(2);
    expect(curve.easing).toStartWith("linear(");
    expect(curve).not.toBe(SHEET_SPRING);
  });

  test("default path returns the shared sheet spring identity", () => {
    const { curve, config } = selectEnterExitCurve(base);
    expect(curve).toBe(SHEET_SPRING);
    expect(config).toBe(SHEET_SPRING_CONFIG);
  });
});

describe("animationSpeed", () => {
  test("speed 1 keeps the shared spring identities", () => {
    const { curve, config } = selectEnterExitCurve({ ...base, speed: 1 });
    expect(curve).toBe(SHEET_SPRING);
    expect(config).toBe(SHEET_SPRING_CONFIG);
  });

  test("speed 2 halves the duration with the same easing shape", () => {
    const { curve } = selectEnterExitCurve({ ...base, speed: 2 });
    expect(curve.easing).toBe(SHEET_SPRING.easing);
    expect(curve.durationMs).toBe(Math.round(SHEET_SPRING.durationMs / 2));
  });

  test("the scaled config is the base spring on a faster clock", () => {
    // stop() re-simulates from the config at elapsed wall time, so the
    // scaled config at t must equal the base spring at t * speed.
    const fast = scaleSheetSpring(2);
    for (const t of [20, 60, 120, 200]) {
      const a = sampleSpringAt(fast, t);
      const b = sampleSpringAt(SHEET_SPRING_CONFIG, t * 2);
      expect(a.value).toBeCloseTo(b.value, 6);
      expect(a.velocity).toBeCloseTo(b.velocity * 2, 4);
    }
  });

  test("a velocity-seeded leg at a slow speed does not throw and stretches the base curve", () => {
    // spring() refuses a curve that settles past its ceiling; building the
    // seeded one at base speed and stretching it keeps slow-motion legal.
    for (const speed of [0.2, 0.1]) {
      const { curve, config } = selectEnterExitCurve({ ...base, velocity: 2, speed });
      expect(curve.easing).toStartWith("linear(");
      expect(curve.durationMs).toBeGreaterThan(SHEET_SPRING.durationMs * 1.5);
      expect(config.velocity).toBe(2);
    }
  });

  test("sampleSpringAt has no 2s ceiling, so a slowed leg interrupted late reads true values", () => {
    const slow = scaleSheetSpring(0.1);
    const a = sampleSpringAt(slow, 3000);
    const b = sampleSpringAt(SHEET_SPRING_CONFIG, 300);
    expect(a.value).toBeCloseTo(b.value, 6);
  });

  test("the ease-out fallback scales too", () => {
    const { curve } = selectEnterExitCurve({ ...base, linearEasing: false, speed: 0.5 });
    expect(curve.durationMs).toBe(SHEET_SPRING.durationMs * 2);
  });

  test("reduced motion stays instant at any speed", () => {
    const { curve } = selectEnterExitCurve({ ...base, reduced: true, speed: 0.25 });
    expect(curve.durationMs).toBe(0);
  });

  test("a velocity-seeded leg keeps the speed-scaled stiffness", () => {
    const { config } = selectEnterExitCurve({ ...base, velocity: 2, speed: 2 });
    expect(config.stiffness).toBe(scaleSheetSpring(2).stiffness);
    expect(config.velocity).toBe(2);
  });
});

describe("scaleDismissDuration", () => {
  const curve = { easing: "linear", durationMs: 600 };

  test("scales by the revealed fraction, rounded", () => {
    expect(scaleDismissDuration(curve, 0.5).durationMs).toBe(300);
  });

  test("floors at the minimum dismiss duration", () => {
    expect(scaleDismissDuration(curve, 0.05).durationMs).toBe(140);
  });

  test("skips near-fully-revealed sheets", () => {
    expect(scaleDismissDuration(curve, 0.99)).toBe(curve);
  });

  test("the floor never exceeds the curve itself (fast speeds)", () => {
    expect(scaleDismissDuration({ easing: "linear", durationMs: 48 }, 0.5).durationMs).toBe(48);
  });

  test("no-op on an instant curve", () => {
    expect(scaleDismissDuration({ easing: "linear", durationMs: 0 }, 0.5).durationMs).toBe(0);
  });
});
