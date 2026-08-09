import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";
import { Sheet } from "../../packages/scrollsheet/src/index";
import { CORE_CSS } from "../../packages/scrollsheet/src/internal/styles";

/**
 * use-nested-scrollbars.ts, exercised against a real mounted <Sheet.Content>
 * — same real-DOM requirement and happy-dom scoping as nested-handoff.test.tsx.
 * happy-dom does no layout, so clientHeight/scrollHeight default to 0 (no
 * overflow); the ref callback below overrides both via defineProperty before
 * the hook's discovery effect runs (ref callbacks fire during commit, ahead
 * of passive effects), simulating overflowing vs. non-overflowing content.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;

beforeAll(async () => {
  await GlobalRegistrator.register();
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

function Fixture({
  scrollbar = "overlay",
  overflow = true,
}: {
  scrollbar?: "overlay" | "hidden" | "native";
  overflow?: boolean;
}) {
  return (
    <Sheet.Root defaultOpen scrollbar={scrollbar}>
      <Sheet.Content aria-label="nested scrollbar fixture">
        <div
          data-scrollsheet-nested-scroll
          ref={(el) => {
            if (!el) return;
            Object.defineProperty(el, "clientHeight", { value: 100, configurable: true });
            Object.defineProperty(el, "scrollHeight", {
              value: overflow ? 400 : 100,
              configurable: true,
            });
          }}
        >
          list content
        </div>
      </Sheet.Content>
    </Sheet.Root>
  );
}

function dialogAndNested() {
  const dialog = document.querySelector(".scrollsheet-dialog");
  const nested = document.querySelector("[data-scrollsheet-nested-scroll]");
  if (!(dialog instanceof HTMLElement) || !(nested instanceof HTMLElement)) {
    throw new Error("fixture did not render a dialog with a marked nested scroller");
  }
  return { dialog, nested };
}

function thumbOf(nested: HTMLElement): HTMLElement | null {
  return nested.querySelector<HTMLElement>("[data-scrollsheet-scrollbar]");
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

describe("nested scrollbars — use-nested-scrollbars.ts", () => {
  test("creates a thumb for a marked scroller with overflow under scrollbar='overlay' (the default)", async () => {
    await mount(<Fixture />);
    const { nested } = dialogAndNested();
    const thumb = thumbOf(nested);
    expect(thumb).not.toBeNull();
    expect(thumb?.className).toBe("scrollsheet-scrollbar");
    expect(thumb?.getAttribute("aria-hidden")).toBe("true");
    expect(thumb?.parentElement).toBe(nested);
  });

  test("creates no thumb when scrollbar='native'", async () => {
    await mount(<Fixture scrollbar="native" />);
    const { nested } = dialogAndNested();
    expect(thumbOf(nested)).toBeNull();
  });

  test("creates no thumb when the scroller has no overflow", async () => {
    await mount(<Fixture overflow={false} />);
    const { nested } = dialogAndNested();
    expect(thumbOf(nested)).toBeNull();
  });

  test("scrollbar='hidden' hides the native scrollbar (CORE_CSS) but creates no managed thumb", async () => {
    expect(CORE_CSS).toContain("[data-scrollsheet-nested-scroll]");
    await mount(<Fixture scrollbar="hidden" />);
    const { nested } = dialogAndNested();
    expect(thumbOf(nested)).toBeNull();
  });

  test("removing the scroller (MutationObserver path) sweeps its state and detaches its injected thumb", async () => {
    // happy-dom v20.11.1 wraps its MutationObserver report callback in a
    // WeakRef with nothing else keeping it alive, so Bun's GC can silently
    // stop it firing — same environment gap nested-handoff.test.tsx patches
    // around; a real browser's MutationObserver has no such GC-eligibility.
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
      const { nested } = dialogAndNested();
      const thumb = thumbOf(nested);
      expect(thumb).not.toBeNull();

      let removeCalled = false;
      const originalRemove = thumb!.remove.bind(thumb);
      thumb!.remove = () => {
        removeCalled = true;
        originalRemove();
      };

      // Not wrapped in React.act: an arbitrary DOM mutation (a morph), not a
      // React state update.
      nested.remove();

      const swept = await waitFor(() => removeCalled);
      expect(swept).toBe(true);
    } finally {
      (globalThis as { WeakRef: unknown }).WeakRef = OriginalWeakRef;
    }
  });

  test("a consumer wipe that removes only the injected thumb gets a fresh thumb re-adopted", async () => {
    // Same happy-dom WeakRef patch as the sweep test above.
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
      const { nested } = dialogAndNested();
      const first = thumbOf(nested);
      expect(first).not.toBeNull();

      // A consumer re-render replacing el's children takes the injected
      // thumb with it while el itself stays mounted — the orphaned state
      // must be released and the scroller re-adopted, not tracked forever
      // against a detached node.
      first!.remove();

      const readopted = await waitFor(() => {
        const current = thumbOf(nested);
        return current !== null && current !== first;
      });
      expect(readopted).toBe(true);
    } finally {
      (globalThis as { WeakRef: unknown }).WeakRef = OriginalWeakRef;
    }
  });
});
