import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

/**
 * Demoted from tests/e2e/regression/regressions.spec.ts's "MUI#5237: no
 * tabindex-0 sentinel elements exist anywhere in the open sheet's DOM, on
 * any engine": a pure DOM-attribute-absence query, no gesture/animation/
 * dialog-open dependency an RTL-style component mount + querySelectorAll
 * proves at ~100x less cost than a full e2e run across every project. See
 * test-shed-audit.md row 10. Same real-DOM (happy-dom) mount pattern as
 * ref-forwarding.test.tsx and platform-dismissal.test.tsx.
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

describe("MUI #5237/#4845 — nameless focus-guard sentinels", () => {
  test("an open sheet has no tabindex-0 sentinel elements anywhere in its DOM", async () => {
    // scrollsheet implements no hand-rolled focus-trap sentinels at all
    // (focus containment is the native <dialog>'s own job) — the bug class
    // requires such sentinels to exist in the first place, so this is a
    // static shape check, not an engine-specific a11y-tree probe.
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
    const sentinelCount = dialog?.querySelectorAll(
      '[tabindex="0"][role="button"]:not([aria-label])',
    ).length;
    expect(sentinelCount).toBe(0);
  });
});
