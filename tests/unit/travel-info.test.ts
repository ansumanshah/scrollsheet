import { describe, expect, test } from "bun:test";
import { fillProgressAtDetents } from "../../packages/scrollsheet/src/content";
import type { ResolvedDetent } from "../../packages/scrollsheet/src/internal/detents";

const detent = (
  height: number,
  index: number,
  spec: ResolvedDetent["spec"] = height,
): ResolvedDetent => ({
  spec,
  height,
  index,
});

describe("fillProgressAtDetents", () => {
  test("one entry per resolved detent, clamped 0-1", () => {
    const resolved = [detent(200, 0), detent(500, 1)];
    const target = new Map<number, number>();
    fillProgressAtDetents(target, resolved, 100);
    expect(target.size).toBe(2);
    expect(target.get(200)).toBeCloseTo(0.5);
    expect(target.get(500)).toBeCloseTo(0.2);
  });

  test("clamps above the tallest detent to 1", () => {
    const resolved = [detent(200, 0), detent(500, 1)];
    const target = new Map<number, number>();
    fillProgressAtDetents(target, resolved, 900);
    expect(target.get(200)).toBe(1);
    expect(target.get(500)).toBe(1);
  });

  test("clamps negative revealed to 0", () => {
    const resolved = [detent(200, 0)];
    const target = new Map<number, number>();
    fillProgressAtDetents(target, resolved, -50);
    expect(target.get(200)).toBe(0);
  });

  test("a zero-height detent reports 0, never NaN/Infinity", () => {
    const resolved = [detent(0, 0), detent(300, 1)];
    const target = new Map<number, number>();
    fillProgressAtDetents(target, resolved, 150);
    expect(target.get(0)).toBe(0);
    expect(target.get(300)).toBeCloseTo(0.5);
  });

  test("reuses (clears, not replaces) the target Map across calls", () => {
    const target = new Map<number, number>();
    fillProgressAtDetents(target, [detent(200, 0)], 100);
    const before = target;
    fillProgressAtDetents(target, [detent(400, 0)], 100);
    expect(target).toBe(before);
    expect(target.has(200)).toBe(false);
    expect(target.get(400)).toBeCloseTo(0.25);
  });

  test("empty resolved list clears to an empty map", () => {
    const target = new Map<number, number>([[1, 1]]);
    fillProgressAtDetents(target, [], 100);
    expect(target.size).toBe(0);
  });
});
