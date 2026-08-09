import { describe, expect, test } from "bun:test";

import {
  SHEET_SPRING,
  SHEET_SPRING_CONFIG,
  sampleSpringAt,
  spring,
} from "../../../packages/scrollsheet/src/motion/spring";

describe("spring", () => {
  test("produces a linear() easing ending at 1", () => {
    const { easing, durationMs } = spring();
    expect(easing.startsWith("linear(0")).toBe(true);
    expect(easing.endsWith("1)")).toBe(true);
    expect(durationMs).toBeGreaterThan(100);
    expect(durationMs).toBeLessThan(2000);
  });

  test("underdamped spring overshoots past 1", () => {
    const { easing } = spring({ stiffness: 300, damping: 12 });
    const values = easing
      .slice("linear(".length, -1)
      .split(", ")
      .map((s) => Number.parseFloat(s));
    expect(Math.max(...values)).toBeGreaterThan(1);
  });

  test("critically damped spring never exceeds 1 by more than rounding", () => {
    const { easing } = spring({ stiffness: 200, damping: 40 });
    const values = easing
      .slice("linear(".length, -1)
      .split(", ")
      .map((s) => Number.parseFloat(s));
    expect(Math.max(...values)).toBeLessThanOrEqual(1.001);
  });
});

describe("sampleSpringAt", () => {
  // The WAAPI enter/exit interrupt path: re-running the same simulation the
  // linear() curve was sampled from must recover position/velocity at any
  // elapsed time — see motion/animate.ts's stop().

  test("starts at rest and settles at 1 with ~zero velocity", () => {
    const start = sampleSpringAt(SHEET_SPRING_CONFIG, 0);
    expect(start.value).toBe(0);
    const end = sampleSpringAt(SHEET_SPRING_CONFIG, SHEET_SPRING.durationMs);
    expect(end.value).toBeCloseTo(1, 1);
    expect(Math.abs(end.velocity)).toBeLessThan(0.5);
  });

  test("is mid-travel with positive velocity partway through", () => {
    const mid = sampleSpringAt(SHEET_SPRING_CONFIG, SHEET_SPRING.durationMs / 4);
    expect(mid.value).toBeGreaterThan(0.1);
    expect(mid.value).toBeLessThan(1);
    expect(mid.velocity).toBeGreaterThan(0);
  });

  test("matches the linear() curve the browser is actually playing", () => {
    // Interpolate the serialized easing at 50% of the duration and compare
    // to a direct simulation there — the two must be the same motion. The
    // stops are adaptively spaced (dense where the curve bends, sparse on
    // the tail), so the curve is evaluated by its own percentages, exactly
    // as the browser lerps it — never by array position.
    const stops = SHEET_SPRING.easing
      .slice("linear(".length, -1)
      .split(", ")
      .map((part, i, all) => {
        const [v, p] = part.split(" ");
        return {
          value: Number.parseFloat(v ?? ""),
          pct: p !== undefined ? Number.parseFloat(p) : i === 0 ? 0 : 100,
        };
      });
    const at = (pct: number): number => {
      let prev = stops[0]!;
      for (const stop of stops) {
        if (stop.pct >= pct) {
          if (stop.pct === prev.pct) return stop.value;
          const f = (pct - prev.pct) / (stop.pct - prev.pct);
          return prev.value + (stop.value - prev.value) * f;
        }
        prev = stop;
      }
      return stops[stops.length - 1]!.value;
    };
    const simMid = sampleSpringAt(SHEET_SPRING_CONFIG, SHEET_SPRING.durationMs / 2);
    expect(Math.abs(simMid.value - at(50))).toBeLessThan(0.05);
  });

  test("a velocity-seeded spring starts moving at that velocity", () => {
    const seeded = sampleSpringAt({ ...SHEET_SPRING_CONFIG, velocity: 2 }, 20);
    const unseeded = sampleSpringAt(SHEET_SPRING_CONFIG, 20);
    expect(seeded.value).toBeGreaterThan(unseeded.value);
  });
});
