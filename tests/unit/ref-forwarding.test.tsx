import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

import { _resetContentAsChildInvalidChildWarningForTests } from "../../packages/scrollsheet/src/internal/env";
import { composeRefs } from "../../packages/scrollsheet/src/internal/slot";

/**
 * Every other test/ file deliberately avoids a real DOM (see
 * theme-color.test.ts and ssr.test.tsx's own doc comments) because
 * `renderToStaticMarkup`/`renderToString` never invoke refs at all — React
 * only attaches a ref once it commits to a real host instance. Proving a
 * ref actually reaches the DOM node (the whole point of the React 18 floor:
 * every public component must accept one on both 18 and 19, not just
 * typecheck) needs a real reconciler + real elements, which is exactly what
 * happy-dom is for. Scoped tightly to this file (register in beforeAll,
 * unregister in afterAll) since `bun test` runs every file in one shared
 * process — a leaked global would break dialog-support.test.ts's assumption
 * that no DOM globals exist by default.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;

beforeAll(async () => {
  await GlobalRegistrator.register();
  // happy-dom's <dialog> has no showModal/show — same fake the rest of the
  // suite uses (see dialog-support.test.ts) so Content takes the real
  // top-layer path instead of degrading to FallbackSheet.
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
  _resetContentAsChildInvalidChildWarningForTests();
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

describe("composeRefs", () => {
  test("writes to every object ref given the same node", () => {
    const a = React.createRef<string>();
    const b = React.createRef<string>();
    const callback = composeRefs(a, b);
    callback("node");
    expect(a.current).toBe("node");
    expect(b.current).toBe("node");
  });

  test("calls every function ref, and calls their cleanups on teardown", () => {
    const calls: string[] = [];
    const refA = (node: string | null) => {
      calls.push(`a:${node}`);
      return () => {
        calls.push("a:cleanup");
      };
    };
    const refB = (node: string | null) => {
      calls.push(`b:${node}`);
    };
    const callback = composeRefs(refA, refB);
    const teardown = callback("node");
    expect(calls).toEqual(["a:node", "b:node"]);
    expect(typeof teardown).toBe("function");
    (teardown as () => void)();
    expect(calls).toEqual(["a:node", "b:node", "a:cleanup"]);
  });

  test("skips null/undefined refs without throwing", () => {
    const a = React.createRef<string>();
    const callback = composeRefs(a, null, undefined);
    expect(() => callback("node")).not.toThrow();
    expect(a.current).toBe("node");
  });

  test("returns no cleanup function when no composed ref returned one", () => {
    const a = React.createRef<string>();
    const callback = composeRefs(a, (_node) => {
      /* no cleanup */
    });
    expect(callback("node")).toBeUndefined();
  });
});

describe("ref forwarding — real DOM (happy-dom)", () => {
  test("Sheet.Content forwards to the panel element", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const ref = React.createRef<HTMLDivElement>();
    await mount(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true },
        React.createElement(Sheet.Content, { ref, "aria-label": "panel" }, "hi"),
      ),
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("DIV");
    expect(ref.current?.className).toContain("scrollsheet-panel");
  });

  test("Sheet.Content asChild merges the child into the panel instead of nesting it", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const ref = React.createRef<HTMLElement>();
    await mount(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true },
        React.createElement(
          Sheet.Content,
          {
            ref: ref as unknown as React.Ref<HTMLDivElement>,
            asChild: true,
            "aria-label": "panel",
          },
          React.createElement("section", { className: "my-panel" }, "hi"),
        ),
      ),
    );
    expect(ref.current).not.toBeNull();
    // The consumer's <section> IS the panel — merged, not wrapped in an
    // extra scrollsheet-owned <div>.
    expect(ref.current?.tagName).toBe("SECTION");
    expect(ref.current?.className).toContain("scrollsheet-panel");
    expect(ref.current?.hasAttribute("data-scrollsheet-panel")).toBe(true);
    expect(ref.current?.querySelector("div")).not.toBeNull();
    // No nested scrollsheet-panel/section pair — exactly one panel-marked
    // element in the whole document (Content portals to document.body, not
    // `container`), proving replacement, not nesting.
    expect(document.querySelectorAll("[data-scrollsheet-panel]").length).toBe(1);
    // The consumer's own children (hoisted into the body wrapper) still render.
    expect(ref.current?.textContent).toBe("hi");
  });

  test("Sheet.Content asChild with multiple children warns once and degrades to the default panel <div>", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const ref = React.createRef<HTMLElement>();
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      await mount(
        React.createElement(
          Sheet.Root,
          { defaultOpen: true },
          React.createElement(
            Sheet.Content,
            {
              ref: ref as unknown as React.Ref<HTMLDivElement>,
              asChild: true,
              "aria-label": "panel",
            },
            // Two element children — not a single valid element, so
            // React.isValidElement(children) is false (children is an array).
            React.createElement("span", { key: "a" }, "one"),
            React.createElement("span", { key: "b" }, "two"),
          ),
        ),
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("asChild expects children");
      // asChild is ignored for this render — the default panel <div>, not
      // either consumer <span>, is what the ref and role/tabIndex land on.
      expect(ref.current).not.toBeNull();
      expect(ref.current?.tagName).toBe("DIV");
      expect(ref.current?.className).toContain("scrollsheet-panel");
      expect(ref.current?.hasAttribute("data-scrollsheet-panel")).toBe(true);
      expect(ref.current?.getAttribute("role")).toBe("document");
      expect(ref.current?.getAttribute("tabindex")).toBe("-1");
      // The children themselves still render — just inside the default
      // panel wrapper, not merged onto a consumer element.
      expect(ref.current?.textContent).toBe("onetwo");
      expect(document.querySelectorAll("[data-scrollsheet-panel]").length).toBe(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("Sheet.Content asChild with a literal Fragment child warns once, degrades to the default panel <div>, and never hands Slot the Fragment", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const ref = React.createRef<HTMLElement>();
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      await mount(
        React.createElement(
          Sheet.Root,
          { defaultOpen: true },
          React.createElement(
            Sheet.Content,
            {
              ref: ref as unknown as React.Ref<HTMLDivElement>,
              asChild: true,
              "aria-label": "panel",
            },
            // <Sheet.Content asChild><>{<section/>}</></Sheet.Content> — a
            // Fragment is React.isValidElement === true (its .type is the
            // Fragment symbol, not a real tag/component), so this must be
            // excluded explicitly rather than relying on isValidElement alone.
            React.createElement(
              React.Fragment,
              null,
              React.createElement("section", { className: "my-panel" }, "hi"),
            ),
          ),
        ),
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("asChild expects children");
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("non-Fragment");
      // Slot never received the Fragment to cloneElement, so React never
      // logged an invalid-DOM-attribute error for role/tabIndex/data-* being
      // merged onto it.
      expect(errorSpy).not.toHaveBeenCalled();
      // asChild is ignored for this render — the default panel <div>, not
      // the Fragment (or its <section>), is what the ref lands on.
      expect(ref.current).not.toBeNull();
      expect(ref.current?.tagName).toBe("DIV");
      expect(ref.current?.className).toContain("scrollsheet-panel");
      expect(ref.current?.hasAttribute("data-scrollsheet-panel")).toBe(true);
      expect(ref.current?.textContent).toBe("hi");
      expect(document.querySelectorAll("[data-scrollsheet-panel]").length).toBe(1);
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test("Sheet.Trigger forwards to the button element", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const ref = React.createRef<HTMLButtonElement>();
    await mount(
      React.createElement(Sheet.Root, null, React.createElement(Sheet.Trigger, { ref }, "Open")),
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("BUTTON");
    expect(ref.current?.textContent).toBe("Open");
  });

  test("Sheet.Handle forwards to the button element", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const ref = React.createRef<HTMLButtonElement>();
    await mount(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, [
          React.createElement(Sheet.Handle, { ref, key: "h" }),
        ]),
      ),
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("BUTTON");
    expect(ref.current?.hasAttribute("data-scrollsheet-handle")).toBe(true);
  });

  test("Sheet.Title forwards to the h2 element", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const ref = React.createRef<HTMLHeadingElement>();
    await mount(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, [
          React.createElement(Sheet.Title, { ref, key: "t" }, "Title"),
        ]),
      ),
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("H2");
  });

  test("Sheet.Description forwards to the p element", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const ref = React.createRef<HTMLParagraphElement>();
    await mount(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, [
          React.createElement(Sheet.Description, { ref, key: "d" }, "Desc"),
        ]),
      ),
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("P");
  });

  test("Sheet.Close forwards to the button element", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const ref = React.createRef<HTMLButtonElement>();
    await mount(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, [
          React.createElement(Sheet.Close, { ref, key: "c" }, "Close"),
        ]),
      ),
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("BUTTON");
  });

  test("asChild composes the outer ref (Slot's own) and the child's own ref onto the same node", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const outerRef = React.createRef<HTMLAnchorElement>();
    const innerRef = React.createRef<HTMLAnchorElement>();
    await mount(
      React.createElement(
        Sheet.Root,
        null,
        React.createElement(
          Sheet.Trigger,
          // Trigger's declared ref type is HTMLButtonElement (its default,
          // non-asChild element) — asChild swaps in whatever the consumer
          // renders instead, which is exactly what this test exercises, so
          // the cast is the test asserting the real (wider) runtime contract.
          { ref: outerRef as unknown as React.Ref<HTMLButtonElement>, asChild: true },
          React.createElement("a", { ref: innerRef, href: "#open" }, "Open"),
        ),
      ),
    );
    expect(outerRef.current).not.toBeNull();
    expect(outerRef.current?.tagName).toBe("A");
    // Both refs must land on the exact same element — that's the composition,
    // not just "one of the two happens to work".
    expect(outerRef.current).toBe(innerRef.current);
  });

  test("vaul compat: Drawer.Content and Drawer.Handle forward refs too", async () => {
    const { Drawer } = await import("../../packages/scrollsheet/src/drawer/index");
    const contentRef = React.createRef<HTMLDivElement>();
    const handleRef = React.createRef<HTMLButtonElement>();
    await mount(
      React.createElement(
        Drawer.Root,
        { open: true },
        React.createElement(Drawer.Content, { ref: contentRef, "aria-label": "panel" }, [
          React.createElement(Drawer.Handle, { ref: handleRef, key: "h" }),
        ]),
      ),
    );
    expect(contentRef.current).not.toBeNull();
    expect(contentRef.current?.hasAttribute("data-vaul-drawer")).toBe(true);
    expect(handleRef.current).not.toBeNull();
    expect(handleRef.current?.hasAttribute("data-vaul-handle")).toBe(true);
  });

  test("vaul compat: Drawer.Content asChild passes through to the same panel-merge behavior", async () => {
    const { Drawer } = await import("../../packages/scrollsheet/src/drawer/index");
    const ref = React.createRef<HTMLElement>();
    await mount(
      React.createElement(
        Drawer.Root,
        { open: true },
        React.createElement(
          Drawer.Content,
          {
            ref: ref as unknown as React.Ref<HTMLDivElement>,
            asChild: true,
            "aria-label": "panel",
          },
          React.createElement("article", null, "vaul asChild"),
        ),
      ),
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("ARTICLE");
    expect(ref.current?.hasAttribute("data-vaul-drawer")).toBe(true);
    expect(ref.current?.hasAttribute("data-scrollsheet-panel")).toBe(true);
    expect(document.querySelectorAll("[data-scrollsheet-panel]").length).toBe(1);
  });
});
