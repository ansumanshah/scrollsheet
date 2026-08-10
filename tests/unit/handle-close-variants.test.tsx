import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

/**
 * Handle variants (inside/floating/outside) and the self-closing
 * <Sheet.Close /> styled default. Same real-DOM mount pattern as
 * platform-dismissal.test.tsx — the outside variant's canvas portal only
 * resolves once React commits real host instances.
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
});

afterAll(async () => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

afterEach(() => {
  if (Root) React.act(() => Root.unmount());
  container?.remove();
  // biome-ignore lint: test-only global cleanup
  delete (globalThis as Record<string, unknown>).HTMLDialogElement;
});

async function importSheet() {
  (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
  return import("../../packages/scrollsheet/src/index");
}

async function mountSheet(
  Sheet: Awaited<ReturnType<typeof importSheet>>["Sheet"],
  content: React.ReactNode,
  rootProps: Record<string, unknown> = {},
) {
  const { createRoot } = await import("react-dom/client");
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = createRoot(container);
  await React.act(async () => {
    Root.render(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true, ...rootProps },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, content),
      ),
    );
  });
}

describe("Handle variants", () => {
  test("default (inside): no variant attribute, pill inside the panel", async () => {
    const { Sheet } = await importSheet();
    await mountSheet(Sheet, React.createElement(Sheet.Handle));
    const handle = document.querySelector("[data-scrollsheet-handle]");
    expect(handle).not.toBeNull();
    expect(handle?.hasAttribute("data-scrollsheet-handle-variant")).toBe(false);
    expect(handle?.closest(".scrollsheet-panel")).not.toBeNull();
  });

  test("floating: sets the variant attribute and stays inside the panel", async () => {
    const { Sheet } = await importSheet();
    await mountSheet(Sheet, React.createElement(Sheet.Handle, { variant: "floating" }));
    const handle = document.querySelector("[data-scrollsheet-handle]");
    expect(handle?.getAttribute("data-scrollsheet-handle-variant")).toBe("floating");
    expect(handle?.closest(".scrollsheet-panel")).not.toBeNull();
  });

  test("outside: portals the pill to the canvas layer, outside the panel", async () => {
    const { Sheet } = await importSheet();
    await mountSheet(Sheet, React.createElement(Sheet.Handle, { variant: "outside" }));
    const handle = document.querySelector("[data-scrollsheet-handle]");
    expect(handle?.getAttribute("data-scrollsheet-handle-variant")).toBe("outside");
    expect(handle?.closest(".scrollsheet-panel")).toBeNull();
    expect(handle?.parentElement?.classList.contains("scrollsheet-canvas")).toBe(true);
  });

  test("outside on a side sheet falls back to inside (geometry is bottom-only)", async () => {
    const { Sheet } = await importSheet();
    await mountSheet(Sheet, React.createElement(Sheet.Handle, { variant: "outside" }), {
      side: "right",
    });
    const handle = document.querySelector("[data-scrollsheet-handle]");
    expect(handle).not.toBeNull();
    expect(handle?.hasAttribute("data-scrollsheet-handle-variant")).toBe(false);
    expect(handle?.closest(".scrollsheet-panel")).not.toBeNull();
  });
});

describe("Handle slider semantics", () => {
  // Demoted from tests/e2e/core/aschild-handle-aria.spec.ts's "single-detent
  // Handle stays a plain button — no slider role, no value attributes":
  // handle.tsx's `multi` flag (specs.length >= 2) purely gates `sliderAria`
  // at render time — no drag, animation, or native dialog semantics
  // exercised. See test-shed-audit.md row 12. The multi-detent counterpart
  // (arrow-key/Home/End interaction) stays e2e — real keyboard interaction.
  test("single-detent (default detents=['content']): plain button, no slider role or value attributes", async () => {
    const { Sheet } = await importSheet();
    await mountSheet(Sheet, React.createElement(Sheet.Handle));
    const handle = document.querySelector("[data-scrollsheet-handle]");
    expect(handle).not.toBeNull();
    expect(handle?.tagName).toBe("BUTTON");
    expect(handle?.hasAttribute("role")).toBe(false);
    expect(handle?.hasAttribute("aria-valuenow")).toBe(false);
    expect(handle?.hasAttribute("aria-valuemin")).toBe(false);
    expect(handle?.hasAttribute("aria-valuemax")).toBe(false);
  });
});

describe("Sheet.Close styled default", () => {
  test("self-closing renders the ✕ default: class, aria-label, svg glyph", async () => {
    const { Sheet } = await importSheet();
    await mountSheet(Sheet, React.createElement(Sheet.Close));
    const close = document.querySelector("button.scrollsheet-close");
    expect(close).not.toBeNull();
    expect(close?.getAttribute("aria-label")).toBe("Close");
    expect(close?.querySelector("svg")).not.toBeNull();
  });

  test("a consumer aria-label wins over the default", async () => {
    const { Sheet } = await importSheet();
    await mountSheet(Sheet, React.createElement(Sheet.Close, { "aria-label": "Dismiss" }));
    const close = document.querySelector("button.scrollsheet-close");
    expect(close?.getAttribute("aria-label")).toBe("Dismiss");
  });

  test("with children: unstyled, exactly as before", async () => {
    const { Sheet } = await importSheet();
    await mountSheet(Sheet, React.createElement(Sheet.Close, null, "Done"));
    const styled = document.querySelector("button.scrollsheet-close");
    expect(styled).toBeNull();
    const buttons = Array.from(document.querySelectorAll("button"));
    expect(buttons.some((b) => b.textContent === "Done")).toBe(true);
  });
});

describe("review-fix regressions", () => {
  test("a forwarded aria-label holding undefined keeps the self-closing default", async () => {
    const { Sheet } = await importSheet();
    await mountSheet(Sheet, React.createElement(Sheet.Close, { "aria-label": undefined }));
    const close = document.querySelector("button.scrollsheet-close");
    expect(close?.getAttribute("aria-label")).toBe("Close");
  });

  test("self-closing Drawer.Close stays an unstyled empty button — vaul's own behavior", async () => {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    const { Drawer } = await import("../../packages/scrollsheet/src/index");
    const { createRoot } = await import("react-dom/client");
    container = document.createElement("div");
    document.body.appendChild(container);
    Root = createRoot(container);
    await React.act(async () => {
      Root.render(
        React.createElement(
          Drawer.Root,
          { defaultOpen: true },
          React.createElement(Drawer.Content, { "aria-label": "drawer" }, [
            React.createElement(Drawer.Close, { key: "c" }),
          ]),
        ),
      );
    });
    expect(document.querySelector("button.scrollsheet-close")).toBeNull();
    expect(document.querySelector("svg")).toBeNull();
  });

  test("outside variant falls back to inside when no canvas ever arrives (FallbackSheet path)", async () => {
    // No HTMLDialogElement at all: Content renders the FallbackSheet, which
    // never publishes a canvas element.
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const { createRoot } = await import("react-dom/client");
    container = document.createElement("div");
    document.body.appendChild(container);
    Root = createRoot(container);
    await React.act(async () => {
      Root.render(
        React.createElement(
          Sheet.Root,
          { defaultOpen: true },
          React.createElement(
            Sheet.Content,
            { "aria-label": "panel" },
            React.createElement(Sheet.Handle, { variant: "outside" }),
          ),
        ),
      );
    });
    // FallbackSheet is a code-split chunk: it mounts one import-resolution
    // microtask after the sheet's own render, so give the preload a few
    // task turns before asserting.
    for (let i = 0; i < 5 && !document.querySelector("[data-scrollsheet-handle]"); i++) {
      await React.act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    const handle = document.querySelector("[data-scrollsheet-handle]");
    expect(handle).not.toBeNull();
    expect(handle?.hasAttribute("data-scrollsheet-handle-variant")).toBe(false);
  });
});
