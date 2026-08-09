import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";
import { Sheet } from "../../packages/scrollsheet/src/index";

/**
 * Nested-scroll handoff's delegated touch-identifier tracking in
 * content.tsx, exercised against a real mounted <Sheet.Content> — refs and
 * effects never fire under renderToString/renderToStaticMarkup (see
 * ref-forwarding.test.tsx's own note), so this needs a real DOM + real
 * reconciler, scoped to this file the same way ref-forwarding.test.tsx and
 * ssr.test.tsx scope their own happy-dom registration.
 *
 * happy-dom (checked: no Touch/TouchEvent source anywhere under
 * node_modules/happy-dom) implements neither `Touch` nor `TouchEvent` at
 * all, so real `new TouchEvent(...)` construction is unavailable here.
 * content.tsx's handlers only ever read `event.changedTouches` and (on
 * touchstart, for stale-identifier reconciliation) `event.touches`, both
 * iterated via `Array.from`, never indexed by TouchList-specific methods —
 * so a plain `Event` with those arrays bolted on via `defineProperty` is a
 * faithful double for what the source code actually touches — dispatched
 * through the real DOM so happy-dom's own capture/target/bubble propagation
 * (verified against its EventTarget source: the capturing phase always runs
 * down the composedPath regardless of the event's `bubbles` flag, matching
 * spec) drives content.tsx's delegated dialog-level listeners exactly as a
 * real touch would.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;

beforeAll(async () => {
  await GlobalRegistrator.register();
  // happy-dom's <dialog> has no showModal/show — same fake the rest of the
  // suite uses so Content takes the real top-layer path instead of
  // degrading to FallbackSheet (which doesn't run this effect at all).
  class FakeDialogElement {
    open = false;
    showModal() {
      this.open = true;
    }
    show() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
  }
  (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete (globalThis as Record<string, unknown>).HTMLDialogElement;
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

afterEach(() => {
  if (Root) React.act(() => Root.unmount());
  container?.remove();
});

async function mount(element: React.ReactElement) {
  const { createRoot } = await import("react-dom/client");
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = createRoot(container);
  await React.act(async () => {
    Root.render(element);
  });
}

function Fixture() {
  return (
    <Sheet.Root defaultOpen>
      <Sheet.Content aria-label="nested handoff fixture">
        <div data-scrollsheet-nested-scroll>list content</div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

/** Minimal Touch double — see the file doc comment for why. */
function fakeTouch(identifier: number, target: EventTarget) {
  return { identifier, target };
}

function touchEvent(
  type: "touchstart" | "touchend" | "touchcancel",
  changed: ReturnType<typeof fakeTouch>[],
  // `touches` = every touch still on the surface at event time. Defaults to
  // `changed` (single-touch case); multi-touch tests pass it explicitly.
  live: ReturnType<typeof fakeTouch>[] = changed,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "changedTouches", { value: changed, configurable: true });
  Object.defineProperty(event, "touches", { value: live, configurable: true });
  return event;
}

/** Polls until `predicate` is true or `timeoutMs` elapses; resolves to whether it succeeded. */
async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 200, stepMs = 5 }: { timeoutMs?: number; stepMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return true;
}

function dialogAndNested() {
  const dialog = document.querySelector(".scrollsheet-dialog");
  const nested = document.querySelector("[data-scrollsheet-nested-scroll]");
  if (!(dialog instanceof HTMLElement) || !(nested instanceof HTMLElement)) {
    throw new Error("fixture did not render a dialog with a marked nested scroller");
  }
  return { dialog, nested };
}

describe("nested-scroll handoff — delegated touch-identifier tracking", () => {
  test("the attribute is never set with no touch, even though the nested scroller rests at scrollTop 0", async () => {
    await mount(<Fixture />);
    const { dialog, nested } = dialogAndNested();
    expect(nested.scrollTop).toBe(0);
    expect(dialog.hasAttribute("data-scrollsheet-at-nested-boundary")).toBe(false);
  });

  test("a touchstart inside the marked element opens its gesture window", async () => {
    await mount(<Fixture />);
    const { dialog, nested } = dialogAndNested();

    await React.act(async () => {
      dialog.dispatchEvent(touchEvent("touchstart", [fakeTouch(1, nested)]));
    });

    expect(dialog.hasAttribute("data-scrollsheet-at-nested-boundary")).toBe(true);
  });

  test("an unrelated concurrent touch's end does not close another element's still-open window", async () => {
    await mount(<Fixture />);
    const { dialog, nested } = dialogAndNested();

    await React.act(async () => {
      dialog.dispatchEvent(touchEvent("touchstart", [fakeTouch(1, nested)]));
    });
    expect(dialog.hasAttribute("data-scrollsheet-at-nested-boundary")).toBe(true);

    // A second finger touches down somewhere that isn't the marked element
    // (a simultaneous handle drag, say) and lifts again. Touch 1 is still on
    // the surface, so it appears in both events' live `touches` list.
    await React.act(async () => {
      dialog.dispatchEvent(
        touchEvent(
          "touchstart",
          [fakeTouch(2, dialog)],
          [fakeTouch(1, nested), fakeTouch(2, dialog)],
        ),
      );
    });
    await React.act(async () => {
      dialog.dispatchEvent(touchEvent("touchend", [fakeTouch(2, dialog)], [fakeTouch(1, nested)]));
    });

    // Touch 1 never ended — its window, and the attribute it opened, must
    // still be open. (This is the 3-touch exploit the round-3 review found
    // in the prior global-touch-count gate: an unrelated touch's own end
    // must never close a DIFFERENT element's still-live window.)
    expect(dialog.hasAttribute("data-scrollsheet-at-nested-boundary")).toBe(true);
  });

  test("the marked element's own touch ending closes its window", async () => {
    await mount(<Fixture />);
    const { dialog, nested } = dialogAndNested();

    await React.act(async () => {
      dialog.dispatchEvent(touchEvent("touchstart", [fakeTouch(1, nested)]));
    });
    expect(dialog.hasAttribute("data-scrollsheet-at-nested-boundary")).toBe(true);

    await React.act(async () => {
      dialog.dispatchEvent(touchEvent("touchend", [fakeTouch(1, nested)]));
    });

    expect(dialog.hasAttribute("data-scrollsheet-at-nested-boundary")).toBe(false);
  });

  test("a touchend the browser never delivered is reconciled away on the next touchstart", async () => {
    await mount(<Fixture />);
    const { dialog, nested } = dialogAndNested();

    await React.act(async () => {
      dialog.dispatchEvent(touchEvent("touchstart", [fakeTouch(1, nested)]));
    });
    expect(dialog.hasAttribute("data-scrollsheet-at-nested-boundary")).toBe(true);

    // Touch 1's touchend is never delivered (WebKit drops touch events whose
    // target was removed; same class of gap the MutationObserver test below
    // covers from the DOM side). The next gesture starts with only touch 2
    // live — touch 1's stale window must be swept, and touch 2 landed
    // outside the marked element, so the attribute must clear.
    await React.act(async () => {
      dialog.dispatchEvent(
        touchEvent("touchstart", [fakeTouch(2, dialog)], [fakeTouch(2, dialog)]),
      );
    });

    expect(dialog.hasAttribute("data-scrollsheet-at-nested-boundary")).toBe(false);
  });

  test("a morph removing the element mid-gesture clears the attribute without any further touch/scroll event (MutationObserver path)", async () => {
    // happy-dom v20.11.1's MutationObserver wraps its internal report
    // callback in `new WeakRef(...)` with nothing else holding a strong
    // reference to that exact closure (see
    // node_modules/happy-dom/lib/mutation-observer/MutationObserverListener.js).
    // Confirmed by direct repro (an independently-created MutationObserver
    // on the same node, in the same test, stops firing too once a GC runs):
    // Bun's JavaScriptCore engine can and does collect that closure, which
    // silently breaks the observer with no error — an environment gap, not
    // a scrollsheet defect. A real browser's MutationObserver has no such
    // GC-eligibility; this is a happy-dom implementation detail. Patching
    // `WeakRef` to a strong double for the lifetime of this test only is
    // the same shape as this file's existing FakeDialogElement double for
    // another missing/incomplete happy-dom API — scoped tightly so it can't
    // mask a real GC-eligibility bug anywhere else in the suite.
    class StrongRef<T extends WeakKey> {
      #value: T;
      constructor(value: T) {
        this.#value = value;
      }
      deref(): T | undefined {
        return this.#value;
      }
    }
    const OriginalWeakRef = globalThis.WeakRef;
    (globalThis as { WeakRef: unknown }).WeakRef = StrongRef;

    try {
      await mount(<Fixture />);
      const { dialog, nested } = dialogAndNested();

      await React.act(async () => {
        dialog.dispatchEvent(touchEvent("touchstart", [fakeTouch(1, nested)]));
      });
      expect(dialog.hasAttribute("data-scrollsheet-at-nested-boundary")).toBe(true);

      // A morph rips the marked element out of the tree without ever firing
      // its touchend — touch events have no spec'd retargeting for a
      // detached target (unlike pointer events), and WebKit has
      // historically dropped them outright. Deliberately not wrapped in
      // React.act: this simulates an arbitrary DOM mutation, not a React
      // state update.
      nested.remove();

      // MutationObserver callbacks land on a microtask, not synchronously
      // on removal — polled rather than a single fixed-tick wait since
      // exactly how many micro/macrotask hops happy-dom's own internal
      // scheduling takes isn't a contract this test should pin to; the
      // assertion that matters is "eventually clears with zero further
      // touch/scroll events dispatched", not the tick count.
      const cleared = await waitFor(
        () => !dialog.hasAttribute("data-scrollsheet-at-nested-boundary"),
      );

      expect(cleared).toBe(true);
    } finally {
      (globalThis as { WeakRef: unknown }).WeakRef = OriginalWeakRef;
    }
  });
});
