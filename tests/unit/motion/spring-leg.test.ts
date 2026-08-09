import { describe, expect, test } from "bun:test";

import { SHEET_SPRING, SHEET_SPRING_CONFIG } from "../../../packages/scrollsheet/src/motion/spring";
import {
  scaleDismissDuration,
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

  test("no-op on an instant curve", () => {
    expect(scaleDismissDuration({ easing: "linear", durationMs: 0 }, 0.5).durationMs).toBe(0);
  });
});
