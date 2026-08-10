import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import type * as ReactDOMClient from "react-dom/client";
import { Sheet } from "../../packages/scrollsheet/src/index";
import { _resetWarnOnceForTests } from "../../packages/scrollsheet/src/internal/dev-warn";

/**
 * desktopSide/desktopBreakpoint resolve `side` through a matchMedia
 * subscription (root.tsx's useDesktopBreakpoint) — this suite pins the
 * resolution logic itself (base below the breakpoint, override at/above
 * it, inert when desktopSide is unset), the two safety properties root.tsx
 * documents (SSR never touches `window`; the state resolves after mount,
 * not during render), and the dev-only misconfiguration warning. The live
 * viewport-crossing-while-open case is e2e territory (a real resize event
 * against a real layout) — see tests/e2e/center/responsive-profiles.spec.ts.
 *
 * The SSR describe below runs with no DOM registered at all (same as
 * ssr.test.tsx's top-level "SSR" block) — GlobalRegistrator is scoped to
 * the "DOM" describe that needs it, not the whole file, or happy-dom's own
 * matchMedia implementation would already be a global by the time the SSR
 * test ran and the "resolves without touching window" claim would be
 * untestable.
 */

type ResolvedSide = "bottom" | "top" | "left" | "right" | "center";

function ResponsiveSheet(props: {
  side?: ResolvedSide;
  desktopSide?: ResolvedSide;
  desktopBreakpoint?: number;
}) {
  return (
    <Sheet.Root defaultOpen {...props}>
      <Sheet.Trigger>Open</Sheet.Trigger>
      <Sheet.Content aria-label="panel">hi</Sheet.Content>
    </Sheet.Root>
  );
}

describe("responsive profiles — SSR", () => {
  test("renderToString never touches matchMedia and resolves to the base side", () => {
    expect(typeof (globalThis as Record<string, unknown>).matchMedia).toBe("undefined");
    let html = "";
    expect(() => {
      html = renderToString(<ResponsiveSheet side="bottom" desktopSide="center" />);
    }).not.toThrow();
    // The dialog is behind a client-only mount gate — server output never
    // includes it (open or closed), same contract ssr.test.tsx pins for
    // every other prop combination. If resolution read `window` during
    // render instead of through state, this would throw in this exact
    // environment (no matchMedia global at all).
    expect(html).not.toContain("scrollsheet-dialog");
    expect(html).toContain("Open");
  });
});

describe("responsive profiles — DOM", () => {
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

  afterEach(async () => {
    if (Root) await React.act(async () => Root.unmount());
    container?.remove();
    _resetWarnOnceForTests();
    restoreMatchMedia();
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

  function dialogSide(): string | null {
    return (
      document.querySelector("dialog.scrollsheet-dialog")?.getAttribute("data-scrollsheet-side") ?? null
    );
  }

  // Static matchMedia stub — `matches` is fixed for the test's lifetime, no
  // live "change" firing (that's the e2e spec's job: a real viewport
  // resize). Every query seen is recorded, not just the breakpoint's own —
  // other engine paths (reduced-motion) also call matchMedia during mount.
  let previousMatchMedia: typeof window.matchMedia | undefined;
  let queries: string[] = [];
  function mockMatchMedia(matches: boolean): void {
    previousMatchMedia = (globalThis as unknown as { matchMedia?: typeof window.matchMedia }).matchMedia;
    (globalThis as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = ((query: string) => {
      queries.push(query);
      return {
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
  }
  function restoreMatchMedia(): void {
    if (previousMatchMedia) {
      (globalThis as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = previousMatchMedia;
    } else {
      delete (globalThis as Record<string, unknown>).matchMedia;
    }
    previousMatchMedia = undefined;
    queries = [];
  }

  describe("resolution", () => {
    test("below the breakpoint, side applies even with desktopSide set", async () => {
      mockMatchMedia(false);
      await mount(<ResponsiveSheet side="bottom" desktopSide="center" />);
      expect(dialogSide()).toBe("bottom");
    });

    test("at/above the breakpoint, desktopSide overrides side", async () => {
      mockMatchMedia(true);
      await mount(<ResponsiveSheet side="bottom" desktopSide="center" />);
      expect(dialogSide()).toBe("center");
    });

    test("unset desktopSide is inert even when matchMedia matches", async () => {
      mockMatchMedia(true);
      await mount(<ResponsiveSheet side="left" />);
      expect(dialogSide()).toBe("left");
    });

    test("desktopBreakpoint is passed through to the matchMedia query", async () => {
      mockMatchMedia(true);
      await mount(<ResponsiveSheet side="bottom" desktopSide="right" desktopBreakpoint={1024} />);
      expect(queries).toContain("(min-width: 1024px)");
      expect(dialogSide()).toBe("right");
    });

    test("desktopBreakpoint defaults to 768", async () => {
      mockMatchMedia(true);
      await mount(<ResponsiveSheet side="bottom" desktopSide="center" />);
      expect(queries).toContain("(min-width: 768px)");
    });
  });

  describe("dev warning", () => {
    test("desktopBreakpoint without desktopSide warns once", async () => {
      mockMatchMedia(false);
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
      await mount(<ResponsiveSheet desktopBreakpoint={1024} />);
      expect(
        warnSpy.mock.calls.some((args) =>
          String(args[0]).includes("desktopBreakpoint is set without desktopSide"),
        ),
      ).toBe(true);
      warnSpy.mockRestore();
    });

    test("desktopBreakpoint paired with desktopSide does not warn", async () => {
      mockMatchMedia(false);
      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
      await mount(<ResponsiveSheet desktopSide="center" desktopBreakpoint={1024} />);
      expect(
        warnSpy.mock.calls.some((args) =>
          String(args[0]).includes("desktopBreakpoint is set without desktopSide"),
        ),
      ).toBe(false);
      warnSpy.mockRestore();
    });
  });
});
