import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { ToasterShell as Toaster } from "../../../packages/scrollsheet/src/toast/shell/toaster-shell";
import {
  _resetWarnOnceForTests,
  resolveVisibleToasts,
} from "../../../packages/scrollsheet/src/toast/toaster";
import {
  _getSonnerSnapshotForTests,
  _resetSonnerStoreForTests,
  expire,
  selectPositionToasts,
  selectToasterToasts,
  toast,
  type ToastRecord,
} from "../../../packages/scrollsheet/src/toast/state";

/**
 * The sonner compat layer (src/toast) is a much larger shim than src/drawer's
 * — scrollsheet has no queue/store concept at all to translate onto, so
 * toast()/useSonner() are new code, not a thin prop translation. These tests
 * split the same way vaul-compat.test.tsx's do: pure store/selector
 * functions tested directly (no DOM needed), plus SSR renderToString smoke
 * tests for the Toaster component itself (its actual dialog markup is
 * behind Content's client-only mount gate, same as every Sheet.Content —
 * see vaul-compat.test.tsx's own note on this).
 */

beforeEach(() => {
  _resetSonnerStoreForTests();
  _resetWarnOnceForTests();
});

describe("toast() store", () => {
  test("pushes a new entry with type='default' and the message as title", () => {
    const id = toast("Saved");
    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ id, title: "Saved", type: "default", dismissible: true });
  });

  test(".success/.error/.info/.warning/.loading set the right type", () => {
    toast.success("ok");
    toast.error("bad");
    toast.info("fyi");
    toast.warning("careful");
    toast.loading("working");
    const types = _getSonnerSnapshotForTests().map((t) => t.type);
    expect(types).toEqual(["success", "error", "info", "warning", "loading"]);
  });

  test(".message is an alias for the base call — type='default'", () => {
    toast.message("plain");
    expect(_getSonnerSnapshotForTests()[0]?.type).toBe("default");
  });

  test("per-toast style carries through create and update-in-place", () => {
    const id = toast("styled", { style: { top: "12px" } });
    expect(_getSonnerSnapshotForTests()[0]?.style).toEqual({ top: "12px" });
    toast("styled again", { id, style: { top: "24px" } });
    expect(_getSonnerSnapshotForTests()[0]?.style).toEqual({ top: "24px" });
  });

  test("passing an existing id updates that entry in place instead of pushing a new one", () => {
    const id = toast("first", { id: "fixed" });
    toast("second", { id: "fixed" });
    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.title).toBe("second");
    expect(id).toBe("fixed");
  });

  test(".custom renders the jsx render-function's own return value, receiving the resolved id", () => {
    let receivedId: number | string | undefined;
    toast.custom((id) => {
      receivedId = id;
      return "custom node";
    });
    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.jsx).toBe("custom node");
    expect(snapshot[0]?.id).toBe(receivedId);
  });

  test(".dismiss(id) removes only that entry and fires its onDismiss", () => {
    const dismissed: unknown[] = [];
    const idA = toast("a", { onDismiss: (t) => dismissed.push(t.id) });
    toast("b");
    toast.dismiss(idA);
    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.title).toBe("b");
    expect(dismissed).toEqual([idA]);
  });

  test(".dismiss() with no id clears every toast and fires every onDismiss", () => {
    const dismissed: unknown[] = [];
    toast("a", { onDismiss: (t) => dismissed.push(t.id) });
    toast("b", { onDismiss: (t) => dismissed.push(t.id) });
    toast.dismiss();
    expect(_getSonnerSnapshotForTests()).toHaveLength(0);
    expect(dismissed).toHaveLength(2);
  });

  test(".dismiss(id) for an id not in the queue is a no-op, not a throw", () => {
    toast("a");
    expect(() => toast.dismiss("nope")).not.toThrow();
    expect(_getSonnerSnapshotForTests()).toHaveLength(1);
  });
});

describe("expire() (internal auto-close removal path, fix 2)", () => {
  test("fires onAutoClose, never onDismiss, and removes the record", () => {
    let autoClosed = 0;
    let dismissed = 0;
    const id = toast("Timed out", {
      onAutoClose: () => {
        autoClosed += 1;
      },
      onDismiss: () => {
        dismissed += 1;
      },
    });
    expire(id);
    expect(autoClosed).toBe(1);
    expect(dismissed).toBe(0);
    expect(_getSonnerSnapshotForTests()).toHaveLength(0);
  });

  test("expiring an id not in the queue is a no-op, not a throw", () => {
    toast("a");
    expect(() => expire("nope")).not.toThrow();
    expect(_getSonnerSnapshotForTests()).toHaveLength(1);
  });
});

describe("toast.getToasts() / toast.getHistory() (fix 9)", () => {
  test("getToasts returns only live toasts; getHistory keeps a dismissed one too", () => {
    const idA = toast("A");
    const idB = toast("B");
    expect(toast.getToasts().map((t) => t.id)).toEqual([idA, idB]);
    expect(toast.getHistory().map((t) => t.id)).toEqual([idA, idB]);

    toast.dismiss(idA);
    expect(toast.getToasts().map((t) => t.id)).toEqual([idB]);
    expect(toast.getHistory().map((t) => t.id)).toEqual([idA, idB]);
  });

  test("an update-in-place updates the SAME history entry rather than adding a second one", () => {
    const id = toast("first", { id: "fixed" });
    toast("second", { id: "fixed" });
    expect(toast.getHistory()).toHaveLength(1);
    expect(toast.getHistory()[0]?.title).toBe("second");
    expect(id).toBe("fixed");
  });

  test("never drops a toast that's still live, even past the 100-entry cap", () => {
    const ids: Array<number | string> = [];
    for (let i = 0; i < 105; i++) ids.push(toast(`toast ${i}`));
    // Nothing dismissed — trimHistory has no removable (non-live) candidate,
    // so history grows past the nominal cap rather than dropping something
    // still on screen, matching real Sonner's own trimHistory contract.
    expect(toast.getHistory()).toHaveLength(105);
    expect(toast.getToasts()).toHaveLength(105);
  });

  test("bounds history at 100, trimming the oldest DISMISSED entries one per new arrival", () => {
    const ids: Array<number | string> = [];
    for (let i = 0; i < 100; i++) ids.push(toast(`toast ${i}`));
    expect(toast.getHistory()).toHaveLength(100);

    // Dismissing doesn't shrink history by itself — trimHistory only runs
    // from a NEW creation (matches real Sonner's own addToast-only trim).
    for (let i = 0; i < 5; i++) toast.dismiss(ids[i] as number | string);
    expect(toast.getHistory()).toHaveLength(100);

    // Each further arrival trims exactly one dismissed entry off the front
    // to stay at the cap.
    for (let i = 0; i < 5; i++) ids.push(toast(`toast ${100 + i}`));
    const history = toast.getHistory();
    expect(history).toHaveLength(100);
    for (const id of ids.slice(0, 5)) {
      expect(history.some((t) => t.id === id)).toBe(false);
    }
    expect(toast.getToasts()).toHaveLength(100);
  });
});

describe("toast.promise", () => {
  test("shows loading immediately, then resolves to success in place (same id)", async () => {
    let resolvePromise!: (value: string) => void;
    const p = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });
    const id = toast.promise(p, {
      loading: "Saving…",
      success: (data) => `Saved: ${data}`,
      error: "Failed",
    });
    // `id` is Object.assign'd onto the primitive (boxed, real-Sonner quirk
    // parity — see the promise implementation) — unbox with Number() to
    // compare against the store's own plain primitive id.
    expect(_getSonnerSnapshotForTests()).toHaveLength(1);
    expect(_getSonnerSnapshotForTests()[0]).toMatchObject({
      id: Number(id),
      type: "loading",
      title: "Saving…",
    });

    resolvePromise("draft-1");
    await p;
    // .then/.finally run as microtasks after the awaited promise settles.
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ id: Number(id), type: "success", title: "Saved: draft-1" });
  });

  test("rejects to an error entry with the same id, and still runs finally", async () => {
    let finallyRan = false;
    const p = Promise.reject(new Error("nope"));
    const id = toast.promise(p, {
      loading: "Saving…",
      success: "Saved",
      error: (err) => `Failed: ${(err as Error).message}`,
      finally: () => {
        finallyRan = true;
      },
    });

    await p.catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    // One extra tick vs. before: the error branch now `await`s a function-form
    // `error` (real-Sonner parity), even a synchronous one.
    await Promise.resolve();

    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ id: Number(id), type: "error", title: "Failed: nope" });
    expect(finallyRan).toBe(true);
  });

  test("a resolved value shaped like a Fetch Response with ok:false routes to the error branch", async () => {
    const response = { ok: false, status: 404 } as Response;
    let receivedError: unknown;
    const id = toast.promise(Promise.resolve(response), {
      loading: "Loading…",
      success: "Loaded",
      error: (err) => {
        receivedError = err;
        return "Not found";
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot[0]).toMatchObject({ id: Number(id), type: "error", title: "Not found" });
    expect(receivedError).toBe("HTTP error! status: 404");
  });

  test("a promise that RESOLVES (not rejects) with an Error instance also routes to the error branch", async () => {
    const err = new Error("resolved-with-error");
    let receivedError: unknown;
    const id = toast.promise(Promise.resolve(err), {
      loading: "Loading…",
      success: "Loaded",
      error: (e) => {
        receivedError = e;
        return "Errored";
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot[0]).toMatchObject({ id: Number(id), type: "error", title: "Errored" });
    expect(receivedError).toBe(err);
  });

  test("async function-form success/error is awaited before the toast updates", async () => {
    const id = toast.promise(Promise.resolve("data"), {
      loading: "Loading…",
      success: async (data) => {
        await Promise.resolve();
        return `Resolved: ${data}`;
      },
      error: "Failed",
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot[0]).toMatchObject({ id: Number(id), type: "success", title: "Resolved: data" });
  });

  test(".unwrap() resolves with the settled success value", async () => {
    const id = toast.promise(Promise.resolve("payload"), {
      loading: "Loading…",
      success: "Done",
      error: "Failed",
    });
    await expect(id.unwrap()).resolves.toBe("payload");
  });

  test(".unwrap() rejects with the settled rejection reason", async () => {
    const reason = new Error("boom");
    const id = toast.promise(Promise.reject(reason), {
      loading: "Loading…",
      success: "Done",
      error: "Failed",
    });
    await expect(id.unwrap()).rejects.toBe(reason);
  });

  test(".unwrap() rejects with the Response on the Response-detection branch", async () => {
    const response = { ok: false, status: 500 } as Response;
    const id = toast.promise(Promise.resolve(response), {
      loading: "Loading…",
      success: "Done",
      error: "Failed",
    });
    await expect(id.unwrap()).rejects.toBe(response);
  });

  test(".unwrap() rejects with the Error instance on the resolved-with-Error branch", async () => {
    const err = new Error("resolved-with-error");
    const id = toast.promise(Promise.resolve(err), {
      loading: "Loading…",
      success: "Done",
      error: "Failed",
    });
    await expect(id.unwrap()).rejects.toBe(err);
  });

  test("(fix 8a) an extended-result object from success applies its extra fields, message becomes the title", async () => {
    const id = toast.promise(Promise.resolve("data"), {
      loading: "Loading…",
      success: (data) => ({
        message: `Done: ${data}`,
        description: "extra detail",
        classNames: { toast: "e2e-extended" },
      }),
      error: "Failed",
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot[0]).toMatchObject({
      id: Number(id),
      type: "success",
      title: "Done: data",
      description: "extra detail",
      classNames: { toast: "e2e-extended" },
    });
  });

  test("(fix 8a) an extended-result object from error applies its extra fields, message becomes the title", async () => {
    const p = Promise.reject(new Error("boom"));
    const id = toast.promise(p, {
      loading: "Loading…",
      success: "ok",
      error: () => ({ message: "Custom failure", description: "why it failed" }),
    });
    await p.catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot[0]).toMatchObject({
      id: Number(id),
      type: "error",
      title: "Custom failure",
      description: "why it failed",
    });
  });

  test("(fix 8b) a static description set at promise()-time carries through to the settled toast instead of being wiped", async () => {
    const id = toast.promise(Promise.resolve("data"), {
      loading: "Loading…",
      description: "stays the whole way",
      success: "Done",
      error: "Failed",
    });
    expect(_getSonnerSnapshotForTests()[0]).toMatchObject({
      type: "loading",
      description: "stays the whole way",
    });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot[0]).toMatchObject({
      id: Number(id),
      type: "success",
      title: "Done",
      description: "stays the whole way",
    });
  });

  test("(fix 8b) a function-form description resolves against the settle value", async () => {
    const id = toast.promise(Promise.resolve("draft-9"), {
      loading: "Loading…",
      description: (value) => `resolved with ${value}`,
      success: "Done",
      error: "Failed",
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot[0]).toMatchObject({ id: Number(id), description: "resolved with draft-9" });
  });

  test("(fix 8b) a function-form description resolves against the HTTP status string on the response-not-ok branch", async () => {
    const response = { ok: false, status: 503 } as Response;
    const id = toast.promise(Promise.resolve(response), {
      loading: "Loading…",
      description: (value) => `status: ${value}`,
      success: "ok",
      error: "Failed",
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot[0]).toMatchObject({
      id: Number(id),
      description: "status: HTTP error! status: 503",
    });
  });

  test("(fix 8a+8b) an extended-result's own description overrides the promise()-level static one", async () => {
    const id = toast.promise(Promise.resolve("x"), {
      loading: "Loading…",
      description: "outer",
      success: () => ({ message: "Done", description: "inner wins" }),
      error: "Failed",
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot[0]).toMatchObject({ id: Number(id), description: "inner wins" });
  });
});

describe("selectToasterToasts", () => {
  test("a toast with no toasterId only shows on the default (un-keyed) toaster", () => {
    toast("default queue");
    const all = _getSonnerSnapshotForTests();
    expect(selectToasterToasts(all, undefined)).toHaveLength(1);
    expect(selectToasterToasts(all, "secondary")).toHaveLength(0);
  });

  test("a toast with an explicit toasterId only shows on the matching toaster", () => {
    toast("routed", { toasterId: "secondary" });
    const all = _getSonnerSnapshotForTests();
    expect(selectToasterToasts(all, undefined)).toHaveLength(0);
    expect(selectToasterToasts(all, "secondary")).toHaveLength(1);
    expect(selectToasterToasts(all, "other")).toHaveLength(0);
  });
});

describe("selectPositionToasts", () => {
  function fixture(id: number, position?: ToastRecord["position"]): ToastRecord {
    return { id, type: "default", createdAt: id, dismissible: true, position };
  }

  test("an explicit position always wins, regardless of the group being asked about", () => {
    const all = [fixture(1, "top-left")];
    expect(selectPositionToasts(all, "top-left", "bottom-right")).toHaveLength(1);
    expect(selectPositionToasts(all, "bottom-right", "bottom-right")).toHaveLength(0);
  });

  test("a toast with no position of its own only shows in the Toaster's own default position group, never in every group", () => {
    const all = [fixture(1)];
    expect(selectPositionToasts(all, "bottom-right", "bottom-right")).toHaveLength(1);
    expect(selectPositionToasts(all, "top-left", "bottom-right")).toHaveLength(0);
  });

  test("mixed: each toast lands in exactly one group", () => {
    const all = [fixture(1, "top-left"), fixture(2), fixture(3, "top-left")];
    expect(selectPositionToasts(all, "top-left", "bottom-right").map((t) => t.id)).toEqual([1, 3]);
    expect(selectPositionToasts(all, "bottom-right", "bottom-right").map((t) => t.id)).toEqual([2]);
  });
});

describe("resolveVisibleToasts", () => {
  test("omitted defaults to 3", () => {
    expect(resolveVisibleToasts(undefined)).toBe(3);
  });

  test("clamps to a minimum of 1 and floors fractional values", () => {
    expect(resolveVisibleToasts(0)).toBe(1);
    expect(resolveVisibleToasts(-5)).toBe(1);
    expect(resolveVisibleToasts(2.9)).toBe(2);
  });
});

/**
 * Toaster's actual dialog markup is behind Content's client-only mount gate
 * (mounted starts false, only flips via an effect — renderToString never
 * runs effects), same as every Sheet.Content in vaul-compat.test.tsx's own
 * SSR tests. These prove the component tree renders without throwing across
 * its prop surface, not the resulting DOM.
 */
describe("Toaster SSR smoke", () => {
  afterEach(() => {
    _resetSonnerStoreForTests();
  });

  test("renders without throwing with no toasts queued", () => {
    expect(() => renderToString(<Toaster />)).not.toThrow();
  });

  test("renders without throwing with a queued toast", () => {
    toast("Hello from SSR");
    expect(() => renderToString(<Toaster />)).not.toThrow();
  });

  test("richColors/theme both warn once, not crash — every position is real now, no fallback warning left to fire", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() =>
        renderToString(<Toaster position="top-center" richColors theme="dark" />),
      ).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("toasterId scoping renders without throwing and doesn't pull in unrelated toasts", () => {
    toast("default queue toast");
    toast("routed toast", { toasterId: "secondary" });
    expect(() => renderToString(<Toaster toasterId="secondary" />)).not.toThrow();
  });

  test("id scoping (the non-deprecated prop) renders without throwing, same routing as toasterId", () => {
    toast("default queue toast");
    toast("routed toast", { toasterId: "secondary" });
    expect(() => renderToString(<Toaster id="secondary" />)).not.toThrow();
  });
});

describe("dismiss() sweeps by record identity — re-entrant toast() calls survive", () => {
  test("a toast created by an onDismiss callback during dismiss-all is kept", () => {
    toast("A", { onDismiss: () => void toast("created during the sweep") });
    toast("B");
    toast.dismiss();
    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.title).toBe("created during the sweep");
  });

  test("a toast re-added under its own id from its onDismiss survives dismiss(id)", () => {
    toast("first", {
      id: "fixed",
      onDismiss: () => void toast("second", { id: "fixed" }),
    });
    toast.dismiss("fixed");
    const snapshot = _getSonnerSnapshotForTests();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.title).toBe("second");
  });

  test("dismiss-all still clears everything when no callback re-enters", () => {
    toast("A");
    toast("B");
    toast.dismiss();
    expect(_getSonnerSnapshotForTests()).toHaveLength(0);
  });
});

describe("dismiss-all reentrancy — a sibling dismissed from a callback is not double-notified", () => {
  test("onDismiss calling toast.dismiss(otherId) mid-sweep fires the sibling's onDismiss once", () => {
    let bDismissals = 0;
    let bId: number | string = "";
    toast("A", { onDismiss: () => void toast.dismiss(bId) });
    bId = toast("B", { onDismiss: () => (bDismissals += 1) });
    toast.dismiss();
    expect(bDismissals).toBe(1);
    expect(_getSonnerSnapshotForTests()).toHaveLength(0);
  });
});
