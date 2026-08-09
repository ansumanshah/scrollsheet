import { describe, expect, test } from "bun:test";

import {
  resolveWheelLatch,
  WHEEL_SESSION_IDLE_MS,
} from "../../../packages/scrollsheet/src/motion/wheel-latch";

describe("resolveWheelLatch", () => {
  const firstDetent = 400;

  test.each([
    // [accumulatedRevealedPx, closeThreshold, expected]
    [400, 0.5, "detent"], // no movement — resting at the detent
    [199, 0.5, "dismiss"], // below the default 0.5 line
    [201, 0.5, "detent"], // just above the default 0.5 line
    [200, 0.5, "detent"], // exactly at the line is not below it (isBelowCloseThreshold's own rule)
    [280, 0.9, "dismiss"], // an easy-to-dismiss consumer config
    [280, 0.1, "detent"], // a hard-to-dismiss consumer config, same gesture magnitude
    [0, 0, "detent"], // closeThreshold 0 never dismisses
  ] as const)(
    "resolveWheelLatch(%d, firstDetent, %d) -> %s",
    (accumulatedRevealedPx, closeThreshold, expected) => {
      expect(resolveWheelLatch(accumulatedRevealedPx, firstDetent, closeThreshold)).toBe(expected);
    },
  );
});

describe("WHEEL_SESSION_IDLE_MS", () => {
  test("is a positive, small debounce window", () => {
    expect(WHEEL_SESSION_IDLE_MS).toBeGreaterThan(0);
    expect(WHEEL_SESSION_IDLE_MS).toBeLessThan(1000);
  });
});
