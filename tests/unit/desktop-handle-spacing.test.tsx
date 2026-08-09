import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

import { injectStyles } from "../../packages/scrollsheet/src/internal/styles";

/**
 * Two demoted-from-e2e static-CSS checks, sharing one happy-dom +
 * injectStyles() harness (real core CSS parsed and cascaded, not stubbed):
 *
 * - Demoted from tests/e2e/desktop/handle-spacing.spec.ts: a pure
 *   getComputedStyle(...).paddingTop check against a static
 *   compound-attribute CSS rule (core.css's
 *   `.scrollsheet-dialog[data-scrollsheet-side="bottom"]
 *   [data-scrollsheet-has-handle] :where(.scrollsheet-body)`), no drag or
 *   native-dialog behavior exercised. Exercises the `@media (min-width:
 *   768px)` desktop gate — happy-dom's default window is 1024x768, already
 *   inside that breakpoint. One e2e smoke test stays in handle-spacing.spec.ts
 *   as a backstop: happy-dom's CSS engine isn't a full cascade
 *   implementation, so a real-browser check is still worth keeping. See
 *   test-shed-audit.md row 13.
 * - Demoted from tests/e2e/desktop/drag.spec.ts: the panel's
 *   `scrollbar-width: none` is an ungated `:where(.scrollsheet-panel)` rule
 *   (no drag mechanics involved despite living in the drag file). See
 *   test-shed-audit.md row 14.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;

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

beforeAll(async () => {
  await GlobalRegistrator.register();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
  injectStyles();
});

afterAll(async () => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  delete (globalThis as Record<string, unknown>).HTMLDialogElement;
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

function bodyPaddingTop(dialog: Element): string {
  const body = dialog.querySelector(".scrollsheet-body");
  return body ? getComputedStyle(body as HTMLElement).paddingTop : "";
}

// happy-dom resolves an unset computed property to "" rather than the
// initial value "0px" (a real cascade-fidelity gap, not a scrollsheet
// behavior) — both mean "no rule matched, no compensation applied".
const NO_COMPENSATION = new Set(["", "0px"]);

describe("desktop handle spacing compensation", () => {
  test("a sheet WITH a handle gets the in-flow pill's spacing back on the body", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    await mount(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true },
        React.createElement(
          Sheet.Content,
          { "aria-label": "panel" },
          React.createElement(Sheet.Handle),
        ),
      ),
    );
    const dialog = document.querySelector("dialog.scrollsheet-dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.hasAttribute("data-scrollsheet-has-handle")).toBe(true);
    expect(bodyPaddingTop(dialog as Element)).toBe("18px");
  });

  test("a sheet with NO handle gets no compensation — nothing was taken out of flow", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    await mount(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
      ),
    );
    const dialog = document.querySelector("dialog.scrollsheet-dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.hasAttribute("data-scrollsheet-has-handle")).toBe(false);
    expect(NO_COMPENSATION.has(bodyPaddingTop(dialog as Element))).toBe(true);
  });

  test("the compensation is bottom-side only — side sheets keep their own layout", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    await mount(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true, side: "left" },
        React.createElement(
          Sheet.Content,
          { "aria-label": "panel" },
          React.createElement(Sheet.Handle),
        ),
      ),
    );
    const dialog = document.querySelector("dialog.scrollsheet-dialog");
    expect(dialog).not.toBeNull();
    // A left sheet's handle stays in flow (not re-presented as a desktop
    // drawer), so it never gets the has-handle bottom-only compensation.
    expect(NO_COMPENSATION.has(bodyPaddingTop(dialog as Element))).toBe(true);
  });
});

describe("panel scrollbar is hidden (static CSS)", () => {
  test("computed scrollbar-width is none on .scrollsheet-panel", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    await mount(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
      ),
    );
    const panel = document.querySelector(".scrollsheet-panel");
    expect(panel).not.toBeNull();
    // happy-dom's CSSStyleDeclaration doesn't expose the camelCase
    // `.scrollbarWidth` accessor for this property — read it via the DOM-spec
    // getPropertyValue instead, which it does support.
    expect(getComputedStyle(panel as Element).getPropertyValue("scrollbar-width")).toBe("none");
  });
});
