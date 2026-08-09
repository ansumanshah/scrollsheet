import { describe, expect, test } from "bun:test";

import { isAtScrollBoundary } from "../../../packages/scrollsheet/src/motion/scroll-handoff";

describe("isAtScrollBoundary", () => {
  describe("top edge", () => {
    test.each([
      [0, "at rest, never scrolled"],
      [-1, "momentum bounce past the top"],
    ] as const)("scrollTop=%d (%s) -> true", (scrollTop) => {
      expect(isAtScrollBoundary({ scrollTop, scrollHeight: 800, clientHeight: 400 }, "top")).toBe(
        true,
      );
    });

    test("scrolled mid-content -> false", () => {
      expect(
        isAtScrollBoundary({ scrollTop: 120, scrollHeight: 800, clientHeight: 400 }, "top"),
      ).toBe(false);
    });
  });

  describe("bottom edge", () => {
    test("exactly at the bottom -> true", () => {
      expect(
        isAtScrollBoundary({ scrollTop: 400, scrollHeight: 800, clientHeight: 400 }, "bottom"),
      ).toBe(true);
    });

    test("within the -1px slop -> true", () => {
      expect(
        isAtScrollBoundary({ scrollTop: 399.3, scrollHeight: 800, clientHeight: 400 }, "bottom"),
      ).toBe(true);
    });

    test("mid-content, well short of the bottom -> false", () => {
      expect(
        isAtScrollBoundary({ scrollTop: 120, scrollHeight: 800, clientHeight: 400 }, "bottom"),
      ).toBe(false);
    });

    test("content shorter than the viewport (nothing to scroll) -> true", () => {
      expect(
        isAtScrollBoundary({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 }, "bottom"),
      ).toBe(true);
    });
  });
});
