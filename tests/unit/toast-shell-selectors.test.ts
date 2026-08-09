import { describe, expect, test } from "bun:test";
import {
  computePossiblePositions,
  computeRowOffsets,
  findNewestDismissible,
  splitPosition,
} from "../../packages/scrollsheet/src/toast/shell/shell-selectors";
import type { ToastRecord } from "../../packages/scrollsheet/src/toast/state";

/**
 * Pure, DOM-free coverage for the new shell's own offset/position math — the
 * same "extract the pure logic, test it without mounting anything"
 * convention selectToastWindow/selectGhostCount already established.
 */

function record(overrides: Partial<ToastRecord> = {}): ToastRecord {
  return {
    id: 1,
    type: "default",
    title: "hi",
    createdAt: Date.now(),
    dismissible: true,
    ...overrides,
  };
}

describe("splitPosition", () => {
  test("splits every one of the six positions into y/x", () => {
    expect(splitPosition("top-left")).toEqual({ y: "top", x: "left" });
    expect(splitPosition("top-center")).toEqual({ y: "top", x: "center" });
    expect(splitPosition("top-right")).toEqual({ y: "top", x: "right" });
    expect(splitPosition("bottom-left")).toEqual({ y: "bottom", x: "left" });
    expect(splitPosition("bottom-center")).toEqual({ y: "bottom", x: "center" });
    expect(splitPosition("bottom-right")).toEqual({ y: "bottom", x: "right" });
  });
});

describe("computePossiblePositions", () => {
  test("the default position is always present, even with zero toasts", () => {
    expect(computePossiblePositions("bottom-right", [])).toEqual(["bottom-right"]);
  });

  test("default position is always first, per-toast overrides follow, deduped", () => {
    const toasts = [
      record({ id: 1, position: "top-left" }),
      record({ id: 2, position: "top-left" }),
      record({ id: 3, position: "bottom-center" }),
      record({ id: 4 }), // no override — routes to the default position, doesn't add a new one
    ];
    expect(computePossiblePositions("bottom-right", toasts)).toEqual([
      "bottom-right",
      "top-left",
      "bottom-center",
    ]);
  });

  test("a per-toast override matching the default doesn't duplicate it", () => {
    const toasts = [record({ id: 1, position: "bottom-right" })];
    expect(computePossiblePositions("bottom-right", toasts)).toEqual(["bottom-right"]);
  });
});

describe("computeRowOffsets", () => {
  test("empty input yields empty output", () => {
    expect(computeRowOffsets([], new Map(), 14)).toEqual([]);
  });

  test("index/toastsBefore are 0-based positions in the newest-first list", () => {
    const newestFirst = [record({ id: "c" }), record({ id: "b" }), record({ id: "a" })];
    const offsets = computeRowOffsets(newestFirst, new Map(), 14);
    expect(offsets.map((o) => o.id)).toEqual(["c", "b", "a"]);
    expect(offsets.map((o) => o.index)).toEqual([0, 1, 2]);
    expect(offsets.map((o) => o.toastsBefore)).toEqual([0, 1, 2]);
  });

  test("stackOffset is the cumulative height of every strictly-newer row, plus one gap per row crossed — real Sonner's own heightIndex * gap + toastsHeightBefore", () => {
    const newestFirst = [record({ id: "c" }), record({ id: "b" }), record({ id: "a" })];
    const heights = new Map<number | string, number>([
      ["c", 80],
      ["b", 60],
      ["a", 100],
    ]);
    const offsets = computeRowOffsets(newestFirst, heights, 14);
    // front (index 0): no newer rows, no gap crossed yet.
    expect(offsets[0]).toMatchObject({ id: "c", stackOffset: 0 });
    // second row: one gap crossed + the front row's own height.
    expect(offsets[1]).toMatchObject({ id: "b", stackOffset: 1 * 14 + 80 });
    // third row: two gaps crossed + both newer rows' heights.
    expect(offsets[2]).toMatchObject({ id: "a", stackOffset: 2 * 14 + 80 + 60 });
  });

  test("an unmeasured row (not yet in `heights`) contributes zero height to its own offset AND to siblings behind it", () => {
    const newestFirst = [record({ id: "c" }), record({ id: "b" })];
    const offsets = computeRowOffsets(newestFirst, new Map(), 14);
    expect(offsets[1]?.stackOffset).toBe(14); // just the one gap, no height yet
  });
});

describe("findNewestDismissible", () => {
  test("undefined for an empty list", () => {
    expect(findNewestDismissible([])).toBeUndefined();
  });

  test("the last (newest, store order is oldest-first) dismissible record", () => {
    const toasts = [record({ id: 1 }), record({ id: 2 }), record({ id: 3 })];
    expect(findNewestDismissible(toasts)?.id).toBe(3);
  });

  test("skips a trailing non-dismissible record to find the next-newest dismissible one", () => {
    const toasts = [record({ id: 1 }), record({ id: 2 }), record({ id: 3, dismissible: false })];
    expect(findNewestDismissible(toasts)?.id).toBe(2);
  });

  test("undefined when every record is non-dismissible", () => {
    const toasts = [record({ id: 1, dismissible: false }), record({ id: 2, dismissible: false })];
    expect(findNewestDismissible(toasts)).toBeUndefined();
  });
});
