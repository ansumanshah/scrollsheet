import { afterEach, describe, expect, spyOn, test } from "bun:test";

import {
  clampSequentialDetent,
  isBelowCloseThreshold,
  nearestDetent,
  resolveDetents,
} from "../../packages/scrollsheet/src/internal/detents";
import { _resetWarnOnceForTests } from "../../packages/scrollsheet/src/internal/dev-warn";

describe("detents", () => {
  const ctx = { viewportHeight: 800, contentHeight: 300, topInset: 48 };

  test("resolves fractions, px, and keywords, sorted ascending", () => {
    const detents = resolveDetents(["full", 0.25, "120px", "medium", "content"], ctx);
    expect(detents.map((d) => d.height)).toEqual([120, 200, 300, 400, 752]);
    expect(detents.map((d) => d.index)).toEqual([0, 1, 2, 3, 4]);
  });

  test("caps content and full at viewport minus inset", () => {
    const tall = resolveDetents(["content", "full"], { ...ctx, contentHeight: 2000 });
    expect(tall.map((d) => d.height)).toEqual([752]); // deduped: both cap to 752
  });

  test("drops non-positive and duplicate heights", () => {
    const detents = resolveDetents([0, 0.5, "medium", "400px"], ctx);
    expect(detents.map((d) => d.height)).toEqual([400]);
  });

  test("nearestDetent picks the closest stop", () => {
    const detents = resolveDetents([0.25, "medium", "full"], ctx);
    expect(nearestDetent(180, detents)?.height).toBe(200);
    expect(nearestDetent(590, detents)?.height).toBe(752);
    expect(nearestDetent(0, detents)?.height).toBe(200);
  });

  // Guards the resolveSpec collision fix: when a spec collapses during de-dup,
  // resolving its true height and snapping to nearest must land on the right
  // survivor, not a list-position guess. Here 'content' (contentHeight 400 =
  // 'medium') collapses; declaration-order index would mis-map to 'full'.
  test("a collapsed detent resolves to its own height, not a list-position guess", () => {
    const collideCtx = { viewportHeight: 800, contentHeight: 400, topInset: 48 };
    const detents = resolveDetents(["full", "medium", "content"], collideCtx);
    expect(detents.map((d) => d.height)).toEqual([400, 752]);
    // 'content' resolved to 400; nearest survivor is the 400px ('medium') stop.
    const contentHeight = Math.min(
      collideCtx.contentHeight,
      collideCtx.viewportHeight - collideCtx.topInset,
    );
    expect(nearestDetent(contentHeight, detents)?.height).toBe(400);
  });
});

describe("resolveDetents — unresolvable spec warning", () => {
  const ctx = { viewportHeight: 800, contentHeight: 300, topInset: 48 };

  afterEach(() => {
    _resetWarnOnceForTests();
  });

  test("does not warn for any recognized spec form", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      resolveDetents(["full", "medium", "content", 0.5, 1, "120px", "0px"], ctx);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("warns once for a bad spec, naming the value and the valid forms", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      resolveDetents(["full", "conent"], ctx);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0]?.[0]);
      expect(message).toContain("conent");
      expect(message).toContain("full");
      expect(message).toContain("medium");
      expect(message).toContain("content");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("still resolves the bad spec instead of throwing (unchanged behavior)", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => resolveDetents(["conent"], ctx)).not.toThrow();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("a non-string, non-number garbage spec warns instead of throwing", () => {
    // Non-TS callers (or an `as any` escape) can hand this a value that
    // isn't even a string or number — the recognized-spec check must not
    // assume `.endsWith` exists before confirming that with typeof.
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      // biome-ignore lint: deliberately malformed input, the whole point of the test
      expect(() => resolveDetents([null, undefined, {}] as any, ctx)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(3);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("warns once per distinct bad value, not once per array", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      resolveDetents(["conent", "conent", "bogus"], ctx);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      resolveDetents(["conent"], ctx);
      expect(warnSpy).toHaveBeenCalledTimes(2); // already-warned value, no repeat
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("isBelowCloseThreshold", () => {
  test("default 0.5 threshold matches the old hardcoded * 0.5 rule", () => {
    expect(isBelowCloseThreshold(199, 400, 0.5)).toBe(true);
    expect(isBelowCloseThreshold(201, 400, 0.5)).toBe(false);
    expect(isBelowCloseThreshold(200, 400, 0.5)).toBe(false); // exactly at the line, not below it
  });

  test("a higher closeThreshold dismisses from a release the default would have kept open", () => {
    // 280px of a 400px first detent: below a 0.9 threshold (360px), above
    // the default 0.5 one (200px).
    expect(isBelowCloseThreshold(280, 400, 0.5)).toBe(false);
    expect(isBelowCloseThreshold(280, 400, 0.9)).toBe(true);
  });

  test("closeThreshold 0 never dismisses via this check (short of fully closed)", () => {
    expect(isBelowCloseThreshold(1, 400, 0)).toBe(false);
    expect(isBelowCloseThreshold(0, 400, 0)).toBe(false);
  });
});

describe("clampSequentialDetent", () => {
  const ctx = { viewportHeight: 800, contentHeight: 300, topInset: 0 };
  const detents = resolveDetents([0.2, 0.5, 0.8, 1], ctx); // 4 detents, indices 0-3

  test("passes the target through unclamped when it's already the neighbor", () => {
    const target = detents[1]!; // index 1
    expect(clampSequentialDetent(target, 0, detents)).toBe(target);
    expect(clampSequentialDetent(target, 2, detents)).toBe(target);
  });

  test("clamps a fling from index 0 straight to index 3 down to index 1", () => {
    const target = detents[3]!;
    expect(clampSequentialDetent(target, 0, detents)).toBe(detents[1]!);
  });

  test("clamps a fling from index 3 straight to index 0 up to index 2", () => {
    const target = detents[0]!;
    expect(clampSequentialDetent(target, 3, detents)).toBe(detents[2]!);
  });

  test("startIndex -1 (no matching start detent) passes target through unclamped", () => {
    const target = detents[3]!;
    expect(clampSequentialDetent(target, -1, detents)).toBe(target);
  });
});
