import { describe, expect, test } from "bun:test";
import { type ToastRecord, selectToastWindow } from "../../packages/scrollsheet/src/toast/state";

/**
 * The hide-not-evict window: selectToastWindow is a pure index cutoff over a
 * newest-first view of the store — nothing is ever evicted or queued here,
 * so it's safe to call on every render. This superseded an earlier
 * evict/queued fold (see git history) whose non-dismissible slot-protection
 * logic existed only to soften an eviction that no longer happens — there is
 * nothing left to protect once nothing is ever bumped out of the store.
 */

function fixture(id: number, overrides: Partial<ToastRecord> = {}): ToastRecord {
  return { id, type: "default", createdAt: id, dismissible: true, ...overrides };
}

describe("selectToastWindow", () => {
  test("under cap: everything visible, nothing hidden", () => {
    const w = selectToastWindow([fixture(1), fixture(2)], 3);
    expect(w.visible.map((t) => t.id)).toEqual([2, 1]);
    expect(w.hidden).toEqual([]);
  });

  test("empty input is a no-op", () => {
    const w = selectToastWindow([], 3);
    expect(w).toEqual({ visible: [], hidden: [] });
  });

  test("overflow: the first `visibleToasts` newest-first are visible, the rest hidden — a pure index cutoff, nothing evicted", () => {
    const w = selectToastWindow([fixture(1), fixture(2), fixture(3), fixture(4)], 3);
    expect(w.visible.map((t) => t.id)).toEqual([4, 3, 2]);
    expect(w.hidden.map((t) => t.id)).toEqual([1]);
  });

  test("dismissible: false earns no protection — a non-dismissible toast overflows into `hidden` exactly like any other, purely by index", () => {
    const w = selectToastWindow(
      [fixture(1, { dismissible: false }), fixture(2), fixture(3), fixture(4)],
      3,
    );
    expect(w.visible.map((t) => t.id)).toEqual([4, 3, 2]);
    expect(w.hidden.map((t) => t.id)).toEqual([1]);
  });

  test("hidden records are never removed by this function — every record it was given reappears in exactly one of the two arrays", () => {
    const toasts = [fixture(1), fixture(2), fixture(3), fixture(4), fixture(5)];
    const w = selectToastWindow(toasts, 2);
    expect(w.visible.length + w.hidden.length).toBe(toasts.length);
    const seen = new Set([...w.visible, ...w.hidden].map((t) => t.id));
    expect(seen).toEqual(new Set(toasts.map((t) => t.id)));
  });

  test("a hidden record leaving the store (the only way it ever leaves — a direct toast.dismiss(id), not this function) promotes the next-newest hidden record on the next call", () => {
    const saturated = [fixture(1), fixture(2), fixture(3), fixture(4)];
    const before = selectToastWindow(saturated, 3);
    expect(before.hidden.map((t) => t.id)).toEqual([1]);

    const afterRemoval = saturated.filter((t) => t.id !== 1);
    const after = selectToastWindow(afterRemoval, 3);
    expect(after.visible.map((t) => t.id)).toEqual([4, 3, 2]);
    expect(after.hidden).toEqual([]);
  });
});
