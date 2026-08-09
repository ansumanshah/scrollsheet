import { describe, expect, test } from "bun:test";
import {
  SWIPE_DISMISS_THRESHOLD_PX,
  SWIPE_VELOCITY_THRESHOLD,
  computeSwipeAxisAmount,
  dampenSwipeDelta,
  getDefaultSwipeDirections,
  isSwipeReleaseAllowed,
  lockSwipeAxis,
  resolveSwipeOutDirection,
  shouldDismissOnSwipeRelease,
} from "../../packages/scrollsheet/src/toast/shell/swipe-math";

/**
 * Pure, DOM-free coverage for the new shell's own swipe math — the same
 * "extract the pure logic, test it without mounting anything" convention
 * shell-selectors.ts's own test file already establishes.
 */

describe("getDefaultSwipeDirections", () => {
  test("every position's default matches the port design's own table", () => {
    expect(getDefaultSwipeDirections("top-left")).toEqual(["top", "left"]);
    expect(getDefaultSwipeDirections("top-center")).toEqual(["top"]);
    expect(getDefaultSwipeDirections("top-right")).toEqual(["top", "right"]);
    expect(getDefaultSwipeDirections("bottom-left")).toEqual(["bottom", "left"]);
    expect(getDefaultSwipeDirections("bottom-center")).toEqual(["bottom"]);
    expect(getDefaultSwipeDirections("bottom-right")).toEqual(["bottom", "right"]);
  });
});

describe("lockSwipeAxis", () => {
  test("no lock until either axis crosses the 1px threshold", () => {
    expect(lockSwipeAxis(0, 0)).toBeNull();
    expect(lockSwipeAxis(1, 1)).toBeNull();
  });

  test("locks to whichever axis moved further, the instant one crosses 1px", () => {
    expect(lockSwipeAxis(2, 0)).toBe("x");
    expect(lockSwipeAxis(0, 2)).toBe("y");
    expect(lockSwipeAxis(10, 3)).toBe("x");
    expect(lockSwipeAxis(3, 10)).toBe("y");
  });

  test("a tie goes to y (Math.abs(dx) > Math.abs(dy) is false on equal magnitudes)", () => {
    expect(lockSwipeAxis(5, 5)).toBe("y");
    expect(lockSwipeAxis(-5, 5)).toBe("y");
  });
});

describe("dampenSwipeDelta", () => {
  test("dampens a positive delta toward zero without ever exceeding it in magnitude", () => {
    const dampened = dampenSwipeDelta(100);
    expect(dampened).toBeGreaterThan(0);
    expect(dampened).toBeLessThan(100);
  });

  test("dampens a negative delta symmetrically", () => {
    const dampened = dampenSwipeDelta(-100);
    expect(dampened).toBeLessThan(0);
    expect(Math.abs(dampened)).toBeLessThan(100);
  });

  test("a zero delta stays zero", () => {
    expect(dampenSwipeDelta(0)).toBe(0);
  });

  test("matches real Sonner's own getDampening formula exactly (index.tsx:387-391)", () => {
    // factor = |100|/20 = 5, damping = 1/(1.5+5) = 1/6.5, dampened = 100/6.5.
    expect(dampenSwipeDelta(100)).toBeCloseTo(100 / 6.5, 5);
  });

  test("a small delta damps less aggressively than a large one (monotonic-ish clamp, never a jump)", () => {
    const small = dampenSwipeDelta(2);
    const large = dampenSwipeDelta(200);
    // Both stay under their own raw magnitude...
    expect(Math.abs(small)).toBeLessThan(2);
    expect(Math.abs(large)).toBeLessThan(200);
    // ...and the small one's damping factor is closer to 1 (less reduction).
    expect(Math.abs(small) / 2).toBeGreaterThan(Math.abs(large) / 200);
  });
});

describe("computeSwipeAxisAmount", () => {
  test("an axis with neither direction allowed stays exactly zero, undamped", () => {
    expect(computeSwipeAxisAmount("x", 100, ["top", "bottom"])).toBe(0);
    expect(computeSwipeAxisAmount("x", -100, ["top", "bottom"])).toBe(0);
    expect(computeSwipeAxisAmount("y", 100, ["left", "right"])).toBe(0);
  });

  test("moving toward the allowed direction passes the raw delta through unchanged", () => {
    expect(computeSwipeAxisAmount("x", 60, ["right"])).toBe(60);
    expect(computeSwipeAxisAmount("x", -60, ["left"])).toBe(-60);
    expect(computeSwipeAxisAmount("y", 60, ["bottom"])).toBe(60);
    expect(computeSwipeAxisAmount("y", -60, ["top"])).toBe(-60);
  });

  test("moving toward the disallowed direction on an ENABLED axis is dampened, not zeroed", () => {
    // bottom-right's own default: x enabled via 'right', but this delta is
    // negative (toward 'left', not allowed) — dampened, still nonzero.
    const amount = computeSwipeAxisAmount("x", -100, ["bottom", "right"]);
    expect(amount).toBeLessThan(0);
    expect(Math.abs(amount)).toBeLessThan(100);
    expect(amount).toBeCloseTo(dampenSwipeDelta(-100), 5);
  });
});

describe("isSwipeReleaseAllowed", () => {
  test("a positive x amount is allowed only if 'right' is in directions", () => {
    expect(isSwipeReleaseAllowed("x", 60, ["right"])).toBe(true);
    expect(isSwipeReleaseAllowed("x", 60, ["left"])).toBe(false);
  });

  test("a negative y amount is allowed only if 'top' is in directions", () => {
    expect(isSwipeReleaseAllowed("y", -60, ["top"])).toBe(true);
    expect(isSwipeReleaseAllowed("y", -60, ["bottom"])).toBe(false);
  });
});

describe("shouldDismissOnSwipeRelease", () => {
  test("distance threshold alone is enough, even at zero velocity", () => {
    expect(shouldDismissOnSwipeRelease(SWIPE_DISMISS_THRESHOLD_PX, 0)).toBe(true);
    expect(shouldDismissOnSwipeRelease(SWIPE_DISMISS_THRESHOLD_PX - 1, 0)).toBe(false);
  });

  test("velocity alone is enough, even under the distance threshold", () => {
    expect(shouldDismissOnSwipeRelease(10, SWIPE_VELOCITY_THRESHOLD + 0.01)).toBe(true);
    expect(shouldDismissOnSwipeRelease(10, SWIPE_VELOCITY_THRESHOLD - 0.01)).toBe(false);
  });

  test("neither trigger crossed: no dismiss", () => {
    expect(shouldDismissOnSwipeRelease(10, 0.05)).toBe(false);
  });
});

describe("resolveSwipeOutDirection", () => {
  test("maps each axis/sign pair to its own real-Sonner direction name", () => {
    expect(resolveSwipeOutDirection("x", 60)).toBe("right");
    expect(resolveSwipeOutDirection("x", -60)).toBe("left");
    expect(resolveSwipeOutDirection("y", 60)).toBe("down");
    expect(resolveSwipeOutDirection("y", -60)).toBe("up");
  });
});
