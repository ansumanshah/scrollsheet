import { describe, expect, test } from "bun:test";
import {
  type Side,
  type SideGeometry,
  geometryFor,
  mapScroll,
  recedeTransform,
} from "../../../packages/scrollsheet/src/motion/geometry";

const ALL_SIDES: Side[] = ["bottom", "top", "left", "right"];

/**
 * geometry.ts's own RECEDE_SHIFT_PX is private (8) — mirrored here as a
 * literal since it's the exact value recedeTransform's shift math is built
 * on. If it ever changes, this test breaks alongside applyRecede's own
 * "1 -> 0.94" comment in content-helpers.ts.
 */
const RECEDE_SHIFT_PX = 8;

describe("geometryFor", () => {
  test("bottom: y axis, scrollTop, sign +1 (raw scroll IS revealed px), origin at the free top edge", () => {
    const g = geometryFor("bottom");
    expect(g).toEqual({
      side: "bottom",
      axis: "y",
      scrollProp: "scrollTop",
      clientSizeProp: "clientHeight",
      offsetSizeProp: "offsetHeight",
      sign: 1,
      recedeOrigin: "50% 0%",
    });
  });

  test("top: y axis, scrollTop, sign -1 (mirrored — flush with screen when open), origin at the free bottom edge", () => {
    const g = geometryFor("top");
    expect(g).toEqual({
      side: "top",
      axis: "y",
      scrollProp: "scrollTop",
      clientSizeProp: "clientHeight",
      offsetSizeProp: "offsetHeight",
      sign: -1,
      recedeOrigin: "50% 100%",
    });
  });

  test("right: x axis, scrollLeft, sign +1, origin at the free left edge", () => {
    const g = geometryFor("right");
    expect(g).toEqual({
      side: "right",
      axis: "x",
      scrollProp: "scrollLeft",
      clientSizeProp: "clientWidth",
      offsetSizeProp: "offsetWidth",
      sign: 1,
      recedeOrigin: "0% 50%",
    });
  });

  test("left: x axis, scrollLeft, sign -1, origin at the free right edge", () => {
    const g = geometryFor("left");
    expect(g).toEqual({
      side: "left",
      axis: "x",
      scrollProp: "scrollLeft",
      clientSizeProp: "clientWidth",
      offsetSizeProp: "offsetWidth",
      sign: -1,
      recedeOrigin: "100% 50%",
    });
  });

  test("every side has a distinct recede origin (each panel grows toward its own free edge)", () => {
    const origins = ALL_SIDES.map((side) => geometryFor(side).recedeOrigin);
    expect(new Set(origins).size).toBe(4);
  });
});

describe("mapScroll", () => {
  test("sign +1 is identity in both directions (bottom/right: raw scroll IS revealed px)", () => {
    expect(mapScroll(0, 400, 1)).toBe(0);
    expect(mapScroll(150, 400, 1)).toBe(150);
    expect(mapScroll(400, 400, 1)).toBe(400);
  });

  test("sign -1 mirrors around maxDetent (top/left: near-end scroll)", () => {
    expect(mapScroll(0, 400, -1)).toBe(400);
    expect(mapScroll(400, 400, -1)).toBe(0);
    expect(mapScroll(150, 400, -1)).toBe(250);
  });

  test("is self-inverse for a fixed maxDetent — the same call converts both directions", () => {
    for (const maxDetent of [0, 240, 812]) {
      for (const sign of [1, -1] as const) {
        for (const value of [0, maxDetent / 3, maxDetent]) {
          expect(mapScroll(mapScroll(value, maxDetent, sign), maxDetent, sign)).toBeCloseTo(
            value,
            10,
          );
        }
      }
    }
  });

  test("maxDetent 0 (degenerate, e.g. an empty content detent) mirrors sign -1 to the negated value", () => {
    expect(mapScroll(0, 0, -1)).toBe(0);
    expect(mapScroll(37, 0, -1)).toBe(-37);
  });
});

describe("recedeTransform", () => {
  test("progress 0 collapses the shift to exactly 0 regardless of side or scale", () => {
    for (const side of ALL_SIDES) {
      expect(recedeTransform(geometryFor(side), 0, 1)).toBe("translate3d(0px, 0px, 0) scale(1)");
    }
  });

  test("bottom (axis y, sign +1) shifts DOWN (positive y) with progress — deeper is further down", () => {
    const g = geometryFor("bottom");
    expect(recedeTransform(g, 1, 0.94)).toBe(
      `translate3d(0px, ${RECEDE_SHIFT_PX}px, 0) scale(0.94)`,
    );
    expect(recedeTransform(g, 0.5, 0.97)).toBe(
      `translate3d(0px, ${RECEDE_SHIFT_PX * 0.5}px, 0) scale(0.97)`,
    );
  });

  test("left (axis x, sign -1) shifts along x in the opposite direction from right", () => {
    const g = geometryFor("left");
    expect(recedeTransform(g, 1, 0.94)).toBe(
      `translate3d(${-RECEDE_SHIFT_PX}px, 0px, 0) scale(0.94)`,
    );
  });

  test("never emits a y shift for the x-axis sides, nor an x shift for the y-axis sides", () => {
    for (const side of ["left", "right"] as const) {
      expect(recedeTransform(geometryFor(side), 1, 1)).toContain(", 0px, 0)");
    }
    for (const side of ["top", "bottom"] as const) {
      expect(recedeTransform(geometryFor(side), 1, 1)).toMatch(/^translate3d\(0px, /);
    }
  });
});

// Sanity: geometryFor's return type shape matches what content-helpers.ts's
// applyRecede/recedeTransform destructure (axis, sign, recedeOrigin) — a
// compile-time check that would fail typecheck if the shape ever drifted.
const _typeCheck: SideGeometry = geometryFor("bottom");
void _typeCheck;
