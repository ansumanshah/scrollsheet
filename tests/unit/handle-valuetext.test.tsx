import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

/**
 * Handle's slider value text for numeric px detents: numbers above 1
 * resolve as pixels (internal/detents.ts), so they must not read as a
 * percentage. Same happy-dom mount as dom-shape.test.tsx.
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

test("a numeric px detent reads as px in aria-valuetext, not as a percentage", async () => {
  const { Sheet } = await import("../../packages/scrollsheet/src/index");
  await mount(
    React.createElement(
      Sheet.Root,
      { defaultOpen: true, detents: [320, 0.9], activeDetent: 320 },
      React.createElement(
        Sheet.Content,
        { "aria-label": "panel" },
        React.createElement(Sheet.Handle),
      ),
    ),
  );
  const handle = document.querySelector('[role="slider"]');
  expect(handle?.getAttribute("aria-valuetext")).toBe("320px");
});
