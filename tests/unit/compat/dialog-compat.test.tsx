import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import type * as ReactDOMClient from "react-dom/client";
import { Dialog, phaseToDataState } from "../../../packages/scrollsheet/src/dialog/index";
import { _resetWarnOnceForTests } from "../../../packages/scrollsheet/src/internal/dev-warn";

/**
 * The Radix Dialog compat layer (src/dialog) is a thin translation over the
 * same dialog engine src/index.ts exercises directly, exactly like the vaul
 * compat layer (src/drawer) — same split as vaul-compat.test.tsx: prop
 * mapping and warn-once-strip behavior are SSR-observable (renderToString)
 * wherever the component isn't behind Content's client-only mount gate, and
 * the data-state bridge (which needs a real DOM to observe attribute
 * mutations) gets its own happy-dom section below.
 */

/**
 * Radix's outside-interaction/focus props are Content-only, but Content's
 * actual dialog markup is behind a client-only mount gate (content.tsx:
 * `mounted` starts false and only flips via an effect, which never runs
 * under `renderToString`) — so the warnings themselves (fired during
 * render, before that gate) are still SSR-observable even though the
 * resulting DOM isn't, same reasoning as vaul-compat.test.tsx's own
 * Content-ignored-props tests.
 */
function ContentIgnoredPropsDialog() {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Content
        aria-label="content ignored props dialog"
        onPointerDownOutside={() => {}}
        onInteractOutside={() => {}}
        onEscapeKeyDown={() => {}}
        onOpenAutoFocus={() => {}}
        onCloseAutoFocus={() => {}}
        onFocusOutside={() => {}}
        forceMount
      />
    </Dialog.Root>
  );
}

function OutsidePointerOnlyDialog() {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Content aria-label="outside pointer only" onInteractOutside={() => {}} />
    </Dialog.Root>
  );
}

function EscapeOnlyDialog() {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Content aria-label="escape only" onEscapeKeyDown={() => {}} />
    </Dialog.Root>
  );
}

function FocusOnlyDialog() {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Content aria-label="focus only" onOpenAutoFocus={() => {}} />
    </Dialog.Root>
  );
}

function ForceMountOnlyDialog() {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Content aria-label="forceMount only" forceMount />
    </Dialog.Root>
  );
}

function NoIgnoredPropsDialog() {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Content aria-label="clean dialog">
        <Dialog.Title>Title</Dialog.Title>
        <Dialog.Description>Description</Dialog.Description>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** Title/Description/Close rendered directly under Root (not nested in Content, which never emits markup under SSR) — same SSR-observability trick vaul-compat.test.tsx uses for Handle. */
function TitleDescriptionAsChildDialog() {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Title asChild className="slot-title">
        <span className="child-title">Title</span>
      </Dialog.Title>
      <Dialog.Description asChild>
        <span className="child-description">Description</span>
      </Dialog.Description>
    </Dialog.Root>
  );
}

function SelfClosingCloseDialog() {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Close />
    </Dialog.Root>
  );
}

function ChildrenCloseDialog() {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Close>Dismiss</Dialog.Close>
    </Dialog.Root>
  );
}

function TriggerControlledDialog({ open }: { open: boolean }) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Trigger>Open</Dialog.Trigger>
    </Dialog.Root>
  );
}

const nativeActionsRef: { current: { open(): void; close(): void } | null } = { current: null };
function NativeForwardDialog() {
  return (
    <Dialog.Root
      defaultOpen
      backdropDismissible={false}
      escapeDismissible={false}
      onOpenChangeComplete={() => {}}
      actionsRef={nativeActionsRef}
    >
      <Dialog.Content aria-label="native forward dialog" />
    </Dialog.Root>
  );
}

function OverlayPortalDialog() {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Portal container={null}>
        <Dialog.Overlay className="my-overlay" />
        <Dialog.Content aria-label="overlay dialog" />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

describe("Radix Dialog compat — SSR-observable prop mapping and warnings", () => {
  test("Root maps open/defaultOpen/onOpenChange/modal without throwing", () => {
    expect(() => renderToString(<TriggerControlledDialog open={false} />)).not.toThrow();
  });

  test("controlled open reflects onto Trigger's aria-expanded (fully SSR-observable, unlike Content)", () => {
    const openHtml = renderToString(<TriggerControlledDialog open={true} />);
    expect(openHtml).toContain('aria-expanded="true"');
    const closedHtml = renderToString(<TriggerControlledDialog open={false} />);
    expect(closedHtml).toContain('aria-expanded="false"');
  });

  test("scrollsheet-native Root passthrough props (actionsRef/backdropDismissible/escapeDismissible/onOpenChangeComplete) never warn", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetWarnOnceForTests();
      expect(() => renderToString(<NativeForwardDialog />)).not.toThrow();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("Content's outside-pointer pair warns once with the backdropDismissible recipe", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetWarnOnceForTests();
      renderToString(<OutsidePointerOnlyDialog />);
      renderToString(<OutsidePointerOnlyDialog />);
      const messages = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) => m.includes("<Dialog.Content>"));
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("onInteractOutside");
      expect(messages[0]).toContain("backdropDismissible={false}");
      expect(messages[0]).toContain("<Dialog.Root>");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("Content's onEscapeKeyDown warns once with the escapeDismissible recipe, on its own key", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetWarnOnceForTests();
      renderToString(<EscapeOnlyDialog />);
      renderToString(<EscapeOnlyDialog />);
      const messages = warnSpy.mock.calls.map((call) => String(call[0]));
      const escapeMessages = messages.filter((m) => m.includes("onEscapeKeyDown"));
      expect(escapeMessages).toHaveLength(1);
      expect(escapeMessages[0]).toContain("escapeDismissible={false}");
      // A separate key from the outside-pointer group — never bundled together.
      expect(escapeMessages[0]).not.toContain("onInteractOutside");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("Content's focus-management props (onOpenAutoFocus/onCloseAutoFocus/onFocusOutside) warn once as their own group, no recipe claimed", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetWarnOnceForTests();
      renderToString(<FocusOnlyDialog />);
      renderToString(<FocusOnlyDialog />);
      const messages = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) => m.includes("onOpenAutoFocus"));
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("native <dialog> manages focus itself");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("Content's forceMount warns once on its own key", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetWarnOnceForTests();
      renderToString(<ForceMountOnlyDialog />);
      renderToString(<ForceMountOnlyDialog />);
      const messages = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) => m.includes("forceMount"));
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("phase machine");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("all four Content warning groups fire independently in the same render (one warning each)", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetWarnOnceForTests();
      renderToString(<ContentIgnoredPropsDialog />);
      const messages = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) => m.includes("<Dialog.Content"));
      expect(messages).toHaveLength(4);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("Content without any Radix-only props doesn't warn", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetWarnOnceForTests();
      expect(() => renderToString(<NoIgnoredPropsDialog />)).not.toThrow();
      const messages = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) => m.includes("<Dialog.Content"));
      expect(messages).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("Portal's container prop is a documented no-op, warned about once; Overlay renders nothing and warns once", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetWarnOnceForTests();
      const html = renderToString(<OverlayPortalDialog />);
      expect(html).not.toContain("my-overlay");
      const messages = warnSpy.mock.calls.map((call) => String(call[0]));
      expect(messages.some((m) => m.includes("Dialog.Portal container"))).toBe(true);
      expect(messages.some((m) => m.includes("Dialog.Overlay"))).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("Title/Description asChild render the child element with merged props", () => {
    const html = renderToString(<TitleDescriptionAsChildDialog />);
    expect(html).toContain('class="slot-title child-title"');
    expect(html).toContain("child-description");
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("<p ");
  });

  // Real Radix <Dialog.Close /> renders an empty, unstyled button — a
  // migrated consumer must not get scrollsheet's own styled ✕ default from
  // a version swap. Mirrors the same fix vaul's DrawerClose needed.
  test("Close with no children stays an unstyled empty button, not scrollsheet's styled ✕ default", () => {
    const html = renderToString(<SelfClosingCloseDialog />);
    expect(html).not.toContain("scrollsheet-close");
    expect(html).not.toContain("<svg");
  });

  test("Close with children renders them, unstyled, exactly as given", () => {
    const html = renderToString(<ChildrenCloseDialog />);
    expect(html).toContain("Dismiss");
    expect(html).not.toContain("scrollsheet-close");
  });
});

/**
 * phaseToDataState is the exact mapping Content's data-state bridge is built
 * on: "opening"/"open" -> "open", everything else (including "pre" and a
 * missing/unrecognized value) -> "closed". Tested directly as a pure
 * function, mirroring vaul-compat.test.tsx's own resolveFadeFromIndex/
 * resolveCloseThreshold/hasMultipleSnapPoints tests — the live DOM bridge
 * around it (the MutationObserver wiring) gets its own happy-dom section
 * below, since that part genuinely needs a real DOM to observe attribute
 * mutations.
 */
describe("phaseToDataState", () => {
  test('opening and open map to "open"', () => {
    expect(phaseToDataState("opening")).toBe("open");
    expect(phaseToDataState("open")).toBe("open");
  });

  test('closing and pre map to "closed"', () => {
    expect(phaseToDataState("closing")).toBe("closed");
    expect(phaseToDataState("pre")).toBe("closed");
  });

  test('null (no host attribute at all) maps to "closed"', () => {
    expect(phaseToDataState(null)).toBe("closed");
  });

  test('an unrecognized string maps to "closed", not thrown', () => {
    expect(phaseToDataState("something-else")).toBe("closed");
  });
});

/**
 * The data-state bridge (Content's MutationObserver watching the dialog
 * host's data-scrollsheet-state attribute) needs a real DOM to observe real
 * attribute mutations — SSR can't reach it (Content's actual dialog markup
 * is behind the client-only mount gate). Same real-DOM (happy-dom) pattern
 * as handle-close-variants.test.tsx / platform-dismissal.test.tsx.
 *
 * The mutations are driven DIRECTLY on the host element rather than through
 * a real open/close cycle: scrollsheet's own phase machine advances via
 * requestAnimationFrame/setTimeout (the "open sequence" effect in
 * content.tsx) and the WAAPI enter/exit leg's `finished` promise — real
 * timing this environment doesn't reproduce deterministically, and isn't
 * this layer's claim to re-prove (content.tsx's own suites already cover
 * it). What IS this layer's own code, and what these tests pin down, is the
 * bridge itself: given data-scrollsheet-state flips on the host, does the
 * rendered panel's data-state track it correctly. The full real-timing
 * open/close cycle (data-state="open" while open, "closed" stamped mid exit
 * animation) is covered end-to-end in tests/e2e/compat/dialog.spec.ts.
 */
describe("Content's data-state bridge (live DOM)", () => {
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

  async function mountDialog() {
    (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
    const { createRoot } = await import("react-dom/client");
    container = document.createElement("div");
    document.body.appendChild(container);
    Root = createRoot(container);
    await React.act(async () => {
      Root.render(
        React.createElement(
          Dialog.Root,
          { defaultOpen: true },
          React.createElement(Dialog.Content, { "aria-label": "bridge dialog" }),
        ),
      );
    });
  }

  // Real end-to-end proof (not the synthetic host-mutation tests below): a
  // real mounted-and-opened dialog settles on data-state="open" once
  // content.tsx's own phase machine (its own timing, not this layer's
  // concern) reaches "opening"/"open" — phaseToDataState's mapping, reached
  // through the real bridge, not asserted directly.
  test('a real mount+open settles on data-state="open"', async () => {
    await mountDialog();
    const panel = document.querySelector("[data-scrollsheet-panel]");
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("data-state")).toBe("open");
  });

  test("tracks the host's data-scrollsheet-state through a full opening -> open -> closing -> pre cycle", async () => {
    await mountDialog();
    const panel = document.querySelector("[data-scrollsheet-panel]");
    const host = panel?.closest("[data-scrollsheet-state]");
    expect(host).not.toBeNull();
    if (!host) throw new Error("host not found");

    await React.act(async () => {
      host.setAttribute("data-scrollsheet-state", "opening");
    });
    expect(panel?.getAttribute("data-state")).toBe("open");

    await React.act(async () => {
      host.setAttribute("data-scrollsheet-state", "open");
    });
    expect(panel?.getAttribute("data-state")).toBe("open");

    await React.act(async () => {
      host.setAttribute("data-scrollsheet-state", "closing");
    });
    expect(panel?.getAttribute("data-state")).toBe("closed");
    // Still mounted mid-exit — the bridge flips the attribute without
    // waiting for (or requiring) the panel to unmount.
    expect(document.querySelector("[data-scrollsheet-panel]")).not.toBeNull();

    await React.act(async () => {
      host.setAttribute("data-scrollsheet-state", "pre");
    });
    expect(panel?.getAttribute("data-state")).toBe("closed");
  });
});

/**
 * Controlled open/onOpenChange through a real click — the one piece of the
 * controlled-open contract that genuinely needs a live DOM (SSR already
 * covers the static open->aria-expanded mapping above).
 */
describe("controlled open/onOpenChange (live DOM)", () => {
  let Root: ReactDOMClient.Root;
  let container: HTMLElement;

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
  });

  test("clicking Trigger fires onOpenChange(true) exactly once, without flipping open itself (fully controlled)", async () => {
    const calls: boolean[] = [];
    const { createRoot } = await import("react-dom/client");
    container = document.createElement("div");
    document.body.appendChild(container);
    Root = createRoot(container);
    await React.act(async () => {
      Root.render(
        React.createElement(
          Dialog.Root,
          { open: false, onOpenChange: (next: boolean) => calls.push(next) },
          React.createElement(Dialog.Trigger, null, "Open"),
        ),
      );
    });
    const trigger = document.querySelector("button");
    expect(trigger).not.toBeNull();
    await React.act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(calls).toEqual([true]);
    // Controlled: the prop never changed, so aria-expanded stays false.
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  });
});
