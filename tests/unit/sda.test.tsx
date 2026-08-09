import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

import { sdaOwnsBackdrop } from "../../packages/scrollsheet/src/content";
import { Sheet } from "../../packages/scrollsheet/src/index";
import { _resetEnvForTests } from "../../packages/scrollsheet/src/internal/env";

/**
 * happy-dom's global `CSS` is a getter-only accessor (matches real browsers:
 * the global `CSS` namespace object is unforgeable) — `globalThis.CSS = x`
 * throws "Attempted to assign to readonly property" once
 * GlobalRegistrator.register() has installed it. Object.defineProperty
 * redefines the (configurable) property outright instead of going through
 * that missing setter.
 */
function stubCssSupports(supports: (condition: string) => boolean): void {
  Object.defineProperty(globalThis, "CSS", {
    value: { supports },
    configurable: true,
    writable: true,
  });
}

describe("sdaOwnsBackdrop", () => {
  test("false whenever SDA isn't supported, regardless of phase", () => {
    expect(sdaOwnsBackdrop(false, "pre")).toBe(false);
    expect(sdaOwnsBackdrop(false, "opening")).toBe(false);
    expect(sdaOwnsBackdrop(false, "open")).toBe(false);
    expect(sdaOwnsBackdrop(false, "closing")).toBe(false);
  });

  test("true only once phase is 'open' AND SDA is supported", () => {
    expect(sdaOwnsBackdrop(true, "open")).toBe(true);
  });

  test("false during 'pre'/'opening'/'closing' even with SDA supported — the track's scroll position is already at rest during those phases (a WAAPI leg animates the panel's transform instead), so JS keeps writing the entrance/exit snapshot on every engine", () => {
    expect(sdaOwnsBackdrop(true, "pre")).toBe(false);
    expect(sdaOwnsBackdrop(true, "opening")).toBe(false);
    expect(sdaOwnsBackdrop(true, "closing")).toBe(false);
  });
});

/**
 * data-scrollsheet-sda stamping + the "JS still writes the pre-open
 * snapshot" half of the gating, exercised against a real mounted
 * <Sheet.Content> — happy-dom can't run a real scroll-driven animation, so
 * this stops short of proving the compositor takes over; that half is
 * `sdaOwnsBackdrop`'s own unit coverage above plus core.css's
 * `@supports`/`[data-scrollsheet-sda]`-gated rules. Harness copied from
 * nested-handoff.test.tsx's own doc comment: a real DOM + reconciler is
 * required because refs/effects never fire under renderToString.
 */
describe("data-scrollsheet-sda stamping", () => {
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

  // env() memoizes for the whole process, and bun:test runs every file in
  // one shared process — an earlier file's happy-dom render can leave the
  // cache populated before this describe's first test even runs.
  beforeEach(() => {
    _resetEnvForTests();
  });

  afterEach(() => {
    if (Root) React.act(() => Root.unmount());
    container?.remove();
    // biome-ignore lint: test-only global cleanup
    delete (globalThis as Record<string, unknown>).CSS;
    _resetEnvForTests();
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
        <Sheet.Content aria-label="sda fixture">
          <div>content</div>
        </Sheet.Content>
      </Sheet.Root>
    );
  }

  test("absent when the engine reports no animation-timeline: scroll() support", async () => {
    // happy-dom's own CSS.supports stub returns true unconditionally for any
    // syntactically valid condition (verified directly), so the "no support"
    // case has to be mocked in explicitly rather than relying on an ambient
    // default — same reasoning as the HTMLDialogElement fake above.
    stubCssSupports(() => false);
    await mount(<Fixture />);
    const dialog = document.querySelector(".scrollsheet-dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.hasAttribute("data-scrollsheet-sda")).toBe(false);
  });

  test("present once CSS.supports reports animation-timeline: scroll()", async () => {
    stubCssSupports((condition) => condition === "animation-timeline: scroll()");
    await mount(<Fixture />);
    const dialog = document.querySelector(".scrollsheet-dialog");
    expect(dialog?.hasAttribute("data-scrollsheet-sda")).toBe(true);
  });

  test("the pre-open snapshot still writes --scrollsheet-progress/-dim on the backdrop with SDA active — phase is 'pre' at that point, not yet 'open', so sdaOwnsBackdrop hasn't started skipping the write", async () => {
    stubCssSupports((condition) => condition === "animation-timeline: scroll()");
    await mount(<Fixture />);
    const backdrop = document.querySelector(".scrollsheet-backdrop") as HTMLElement | null;
    expect(backdrop).not.toBeNull();
    expect(backdrop?.style.getPropertyValue("--scrollsheet-progress")).not.toBe("");
    expect(backdrop?.style.getPropertyValue("--scrollsheet-dim")).not.toBe("");
  });
});
