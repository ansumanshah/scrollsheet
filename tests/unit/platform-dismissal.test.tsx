import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

/**
 * Component-level coverage for the v1.2 platform dismissal wiring:
 * `closedby` mirroring on the modal `<dialog>` (content.tsx) and
 * `useCloseWatcher` reached end-to-end through a real non-modal
 * `<Sheet.Root>`/`<Sheet.Content>` tree. Same real-DOM (happy-dom) pattern
 * as ref-forwarding.test.tsx — refs/attributes only resolve once React
 * commits to a real host instance.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;

class FakeCloseWatcher {
  static instances: FakeCloseWatcher[] = [];
  destroyed = false;
  onclose: (() => void) | null = null;
  constructor() {
    FakeCloseWatcher.instances.push(this);
  }
  close() {
    this.onclose?.();
  }
  destroy() {
    this.destroyed = true;
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
  // biome-ignore lint: test-only global cleanup
  delete (globalThis.window as Record<string, unknown>).CloseWatcher;
  FakeCloseWatcher.instances = [];
  if (realMatchMedia) {
    globalThis.window.matchMedia = realMatchMedia;
    realMatchMedia = null;
  }
});

let realMatchMedia: typeof window.matchMedia | null = null;

/** The watcher is gated to touch-primary devices; the hook only reads `.matches`. */
function stubTouchPrimary(matches: boolean) {
  realMatchMedia ??= globalThis.window.matchMedia;
  globalThis.window.matchMedia = ((query: string) => ({
    matches: query === "(hover: none) and (pointer: coarse)" ? matches : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

async function mount(element: React.ReactElement) {
  const { createRoot } = await import("react-dom/client");
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = createRoot(container);
  await React.act(async () => {
    Root.render(element);
  });
}

/** Same fake dialog every other suite (ref-forwarding, nested-handoff) mounts with — showModal/show/close only, no closedBy support. */
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

/** Adds a `closedBy` accessor to the prototype so hasClosedBySupport() reports true. */
class FakeDialogElementWithClosedBy extends FakeDialogElement {
  get closedBy() {
    return "closerequest";
  }
}

describe("closedby attribute — unsupported engine (this suite's default fake dialog)", () => {
  test("no closedby attribute is written at all — behavior unchanged from today", async () => {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    await mount(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
      ),
    );
    const dialog = document.querySelector("dialog");
    expect(dialog).not.toBeNull();
    expect(dialog?.hasAttribute("closedby")).toBe(false);
  });
});

describe("closedby attribute — engine with closedBy support, per escapeDismissible/backdropDismissible combo", () => {
  async function mountWith(escapeDismissible: boolean, backdropDismissible: boolean) {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElementWithClosedBy;
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    await mount(
      React.createElement(
        Sheet.Root,
        { defaultOpen: true, escapeDismissible, backdropDismissible },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
      ),
    );
    return document.querySelector("dialog");
  }

  test("escape + backdrop both dismissible -> closerequest, never any", async () => {
    const dialog = await mountWith(true, true);
    expect(dialog?.getAttribute("closedby")).toBe("closerequest");
  });

  test("escape only -> closerequest", async () => {
    const dialog = await mountWith(true, false);
    expect(dialog?.getAttribute("closedby")).toBe("closerequest");
  });

  test("backdrop only (no escape) -> none, not any — backdrop taps are the library's own click handler regardless", async () => {
    const dialog = await mountWith(false, true);
    expect(dialog?.getAttribute("closedby")).toBe("none");
  });

  test("neither dismissible -> none", async () => {
    const dialog = await mountWith(false, false);
    expect(dialog?.getAttribute("closedby")).toBe("none");
  });
});

describe("closedby attribute — non-modal sheets never get it (scoped to showModal())", () => {
  test("modal={false} popover path has no closedby attribute even with closedBy support mocked in", async () => {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElementWithClosedBy;
    const proto = HTMLElement.prototype as unknown as {
      showPopover?: () => void;
      hidePopover?: () => void;
    };
    const hadShowPopover = "showPopover" in proto;
    if (!hadShowPopover) {
      proto.showPopover = () => {};
      proto.hidePopover = () => {};
    }
    try {
      const { Sheet } = await import("../../packages/scrollsheet/src/index");
      await mount(
        React.createElement(
          Sheet.Root,
          { defaultOpen: true, modal: false },
          React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
        ),
      );
      // Popover path renders a <div popover>, not a <dialog> — closedby
      // cannot even apply there. Assert no <dialog> element exists at all.
      expect(document.querySelector("dialog")).toBeNull();
      const popoverDiv = document.querySelector("[data-scrollsheet-modal='false']");
      expect(popoverDiv).not.toBeNull();
      expect(popoverDiv?.hasAttribute("closedby")).toBe(false);
    } finally {
      if (!hadShowPopover) {
        delete proto.showPopover;
        delete proto.hidePopover;
      }
    }
  });
});

describe("non-modal sheet — static markup contract (backdrop absence, aria)", () => {
  // Demoted from tests/e2e/sides/non-modal.spec.ts's "no .scrollsheet-backdrop
  // element exists at all while open": backdrop-absence and the
  // role/aria-modal/data-scrollsheet-modal attributes are all static output
  // of the `modal` prop (content.tsx's popover branch), no gesture/animation
  // dependency — the one thing that still needs a real browser (the Popover
  // API actually showing the element) is proven by the e2e suite's other
  // non-modal tests, which all depend on the overlay being genuinely visible.
  test("no .scrollsheet-backdrop element exists, and role/aria-modal/data-scrollsheet-modal mirror the non-modal contract", async () => {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    const proto = HTMLElement.prototype as unknown as {
      showPopover?: () => void;
      hidePopover?: () => void;
    };
    const hadShowPopover = "showPopover" in proto;
    if (!hadShowPopover) {
      proto.showPopover = () => {};
      proto.hidePopover = () => {};
    }
    try {
      const { Sheet } = await import("../../packages/scrollsheet/src/index");
      await mount(
        React.createElement(
          Sheet.Root,
          { defaultOpen: true, modal: false },
          React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
        ),
      );
      expect(document.querySelector(".scrollsheet-backdrop")).toBeNull();
      const overlay = document.querySelector("[data-scrollsheet-modal='false']");
      expect(overlay).not.toBeNull();
      expect(overlay?.getAttribute("role")).toBe("dialog");
      expect(overlay?.getAttribute("aria-modal")).toBe("false");
    } finally {
      if (!hadShowPopover) {
        delete proto.showPopover;
        delete proto.hidePopover;
      }
    }
  });
});

describe("useCloseWatcher reached end-to-end through a non-modal Sheet.Root/Content", () => {
  test("a dismissible non-modal sheet creates a watcher on a touch-primary device, and its close event closes the sheet", async () => {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    (globalThis.window as Record<string, unknown>).CloseWatcher = FakeCloseWatcher;
    stubTouchPrimary(true);
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const onOpenChange = (open: boolean) => {
      lastOpen = open;
    };
    let lastOpen = true;
    await mount(
      React.createElement(
        Sheet.Root,
        { open: true, modal: false, onOpenChange },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
      ),
    );
    expect(FakeCloseWatcher.instances.length).toBe(1);

    await React.act(async () => {
      FakeCloseWatcher.instances[0]?.close();
    });
    expect(lastOpen).toBe(false);
  });

  test("a fine-pointer (desktop) device creates no watcher — Esc must stay focus-scoped there", async () => {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    (globalThis.window as Record<string, unknown>).CloseWatcher = FakeCloseWatcher;
    stubTouchPrimary(false);
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    await mount(
      React.createElement(
        Sheet.Root,
        { open: true, modal: false },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
      ),
    );
    expect(FakeCloseWatcher.instances.length).toBe(0);
  });

  test("a non-escape-dismissible non-modal sheet creates no watcher — must not consume Android back", async () => {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    (globalThis.window as Record<string, unknown>).CloseWatcher = FakeCloseWatcher;
    stubTouchPrimary(true);
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    await mount(
      React.createElement(
        Sheet.Root,
        { open: true, modal: false, escapeDismissible: false },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
      ),
    );
    expect(FakeCloseWatcher.instances.length).toBe(0);
  });

  test("a modal sheet never creates a watcher — closedby already owns that path", async () => {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    (globalThis.window as Record<string, unknown>).CloseWatcher = FakeCloseWatcher;
    stubTouchPrimary(true);
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    await mount(
      React.createElement(
        Sheet.Root,
        { open: true },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
      ),
    );
    expect(FakeCloseWatcher.instances.length).toBe(0);
  });
});

describe("native platform close (form method=dialog etc.) — lifecycle completion", () => {
  test("onOpenChangeComplete(false) fires from the native-close branch", async () => {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    const completes: boolean[] = [];
    let lastOpen = true;
    await mount(
      React.createElement(
        Sheet.Root,
        {
          defaultOpen: true,
          onOpenChange: (open: boolean) => {
            lastOpen = open;
          },
          onOpenChangeComplete: (open: boolean) => completes.push(open),
        },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
      ),
    );
    const dialog = document.querySelector("dialog");
    expect(dialog).not.toBeNull();
    await React.act(async () => {
      dialog?.dispatchEvent(new Event("close"));
    });
    expect(lastOpen).toBe(false);
    // The platform already removed the dialog, so no exit leg ever runs —
    // the close completion must come from the onClose handler itself.
    expect(completes.at(-1)).toBe(false);
  });
});

describe("nested non-modal sheets — Esc closes the topmost only", () => {
  test("Escape on the inner sheet leaves the outer sheet open", async () => {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    let outerOpen = true;
    let innerOpen = true;
    await mount(
      React.createElement(
        Sheet.Root,
        {
          open: true,
          modal: false,
          onOpenChange: (open: boolean) => {
            outerOpen = open;
          },
        },
        React.createElement(
          Sheet.Content,
          { "aria-label": "outer" },
          React.createElement(
            Sheet.Root,
            {
              open: true,
              modal: false,
              onOpenChange: (open: boolean) => {
                innerOpen = open;
              },
            },
            React.createElement(Sheet.Content, { "aria-label": "inner" }, "hi"),
          ),
        ),
      ),
    );
    const inner = document.querySelector('[aria-label="inner"]');
    expect(inner).not.toBeNull();
    await React.act(async () => {
      inner?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(innerOpen).toBe(false);
    // The keydown replays up the component tree through the portals — the
    // inner sheet's stopPropagation is what keeps the outer one up.
    expect(outerOpen).toBe(true);
  });
});

describe("non-modal Esc never blocks the page's own listeners", () => {
  test("a document-level Escape handler still fires when focus is inside a non-dismissible non-modal sheet", async () => {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    let sheetOpen = true;
    let globalEscapes = 0;
    const onDocKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") globalEscapes += 1;
    };
    document.addEventListener("keydown", onDocKeyDown);
    try {
      await mount(
        React.createElement(
          Sheet.Root,
          {
            open: true,
            modal: false,
            escapeDismissible: false,
            onOpenChange: (open: boolean) => {
              sheetOpen = open;
            },
          },
          React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
        ),
      );
      const panel = document.querySelector('[aria-label="panel"]');
      expect(panel).not.toBeNull();
      await React.act(async () => {
        panel?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      // The sheet claims Esc via a stamp on the native event, never by
      // stopping real DOM propagation — the page's own handler must see it.
      expect(globalEscapes).toBe(1);
      expect(sheetOpen).toBe(true);
    } finally {
      document.removeEventListener("keydown", onDocKeyDown);
    }
  });
});

describe("backdrop dismissal on a bare click (no preceding pointerdown)", () => {
  // iOS Safari can deliver a backdrop tap as a lone `click` with no
  // pointerdown at all. The track's dismissal deliberately keys on click so
  // those taps work; this pins the exact event sequence the design decision
  // exists for (a pointerdown-gated model would fail this test). Covers
  // Sheet directly and the Dialog compat layer through it.
  async function mountAndBareClick(element: React.ReactElement) {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    await mount(element);
    const track = document.querySelector(".scrollsheet-track");
    expect(track).not.toBeNull();
    await React.act(async () => {
      track!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }

  test("Sheet: a lone click targeting the track dismisses", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    let open = true;
    await mountAndBareClick(
      React.createElement(
        Sheet.Root,
        {
          defaultOpen: true,
          onOpenChange: (next: boolean) => {
            open = next;
          },
        },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
      ),
    );
    expect(open).toBe(false);
  });

  test("Dialog compat: the same lone click dismisses the centered dialog", async () => {
    const { Dialog } = await import("../../packages/scrollsheet/src/index");
    let open = true;
    await mountAndBareClick(
      React.createElement(
        Dialog.Root,
        {
          defaultOpen: true,
          onOpenChange: (next: boolean) => {
            open = next;
          },
        },
        React.createElement(
          Dialog.Content,
          { "aria-label": "dialog" },
          React.createElement(Dialog.Title, null, "t"),
        ),
      ),
    );
    expect(open).toBe(false);
  });

  test("backdropDismissible={false}: the lone click is ignored", async () => {
    const { Sheet } = await import("../../packages/scrollsheet/src/index");
    let open = true;
    await mountAndBareClick(
      React.createElement(
        Sheet.Root,
        {
          defaultOpen: true,
          backdropDismissible: false,
          onOpenChange: (next: boolean) => {
            open = next;
          },
        },
        React.createElement(Sheet.Content, { "aria-label": "panel" }, "hi"),
      ),
    );
    expect(open).toBe(true);
  });
});
