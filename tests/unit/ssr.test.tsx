import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import type * as ReactDOMClient from "react-dom/client";
import { Sheet } from "../../packages/scrollsheet/src/index";
import { Drawer } from "../../packages/scrollsheet/src/drawer/index";

/**
 * scrollsheet renders a real <dialog> only once JS runs on the client — the
 * open sequence (showModal, measuring detents, scroll-snap stops) all needs a
 * DOM, and the dialog is portaled to <body> behind a mount gate. On the server
 * that means: no dialog markup is emitted at all (open or closed), rendering
 * must never throw, and the package entry must be importable without touching
 * `window`/`document` at module scope. The dialog appears on client mount.
 */

function ClosedSheet() {
  return (
    <Sheet.Root>
      <Sheet.Trigger>Open</Sheet.Trigger>
      <Sheet.Content aria-label="SSR sheet">
        <Sheet.Handle />
        <Sheet.Title>Title</Sheet.Title>
        <Sheet.Description>Description</Sheet.Description>
        <Sheet.Close>Close</Sheet.Close>
      </Sheet.Content>
    </Sheet.Root>
  );
}

function DefaultOpenSheet() {
  return (
    <Sheet.Root defaultOpen>
      <Sheet.Trigger>Open</Sheet.Trigger>
      <Sheet.Content aria-label="SSR sheet">
        <Sheet.Handle />
        <Sheet.Title>Title</Sheet.Title>
        <Sheet.Description>Description</Sheet.Description>
        <Sheet.Close>Close</Sheet.Close>
      </Sheet.Content>
    </Sheet.Root>
  );
}

describe("SSR", () => {
  test("a closed sheet renders no dialog markup", () => {
    const html = renderToString(<ClosedSheet />);
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain("scrollsheet-dialog");
    // The trigger button itself still renders.
    expect(html).toContain("Open");
  });

  test("a defaultOpen sheet renders without throwing and emits no dialog on the server", () => {
    let html = "";
    expect(() => {
      html = renderToString(<DefaultOpenSheet />);
    }).not.toThrow();

    // The dialog is portaled behind a mount gate, so nothing dialog-ish is
    // emitted server-side; it mounts on the client. The trigger still renders.
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain("scrollsheet-dialog");
    expect(html).toContain("Open");
  });
});

/**
 * Drawer ships from the same entry as Sheet, in its own dist chunk with its
 * own "use client", over the exact same dialog engine the root SSR suite
 * above already proves is server-safe — these tests exist so that fact is
 * actually checked for the compat layer, not assumed by association.
 */
function ClosedDrawer() {
  return (
    <Drawer.Root>
      <Drawer.Trigger>Open</Drawer.Trigger>
      <Drawer.Content aria-label="SSR drawer">
        <Drawer.Handle />
        <Drawer.Title>Title</Drawer.Title>
        <Drawer.Description>Description</Drawer.Description>
        <Drawer.Close>Close</Drawer.Close>
      </Drawer.Content>
    </Drawer.Root>
  );
}

function DefaultOpenDrawer() {
  return (
    <Drawer.Root defaultOpen>
      <Drawer.Trigger>Open</Drawer.Trigger>
      <Drawer.Content aria-label="SSR drawer">
        <Drawer.Handle />
        <Drawer.Title>Title</Drawer.Title>
        <Drawer.Description>Description</Drawer.Description>
        <Drawer.Close>Close</Drawer.Close>
      </Drawer.Content>
    </Drawer.Root>
  );
}

describe("SSR — Drawer (vaul compat)", () => {
  test("a closed drawer renders no dialog markup", () => {
    const html = renderToString(<ClosedDrawer />);
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain("scrollsheet-dialog");
    expect(html).toContain("Open");
  });

  test("a defaultOpen drawer renders without throwing and emits no dialog on the server", () => {
    let html = "";
    expect(() => {
      html = renderToString(<DefaultOpenDrawer />);
    }).not.toThrow();
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain("scrollsheet-dialog");
    expect(html).toContain("Open");
  });
});

/**
 * Toaster/toast's own SSR proof used to live here too (its own chunk, same
 * "doesn't touch window/document at import or render time" concern as
 * Sheet/Drawer above) — deleted at the sonner cutover per the test-shed
 * audit's own flagged note (`.claude/test-shed-audit.md` row 26): now that
 * the shell (`shell/toaster-shell.tsx`) IS the public `Toaster`, this block
 * duplicated `compat/toast-shell.test.tsx`'s own "SSR safety" describe,
 * which proves the stronger claim anyway — the shell's client-only mount
 * gate means `renderToString` emits nothing at all (`toBe("")`), not just
 * "no dialog markup" — against the exact component this file's old copy was
 * standing in for.
 */

/**
 * The actual hydration-mismatch proof the module doc comment above reasons
 * about: `renderToString`-only tests (the suites above) can't catch a real
 * client/server markup divergence — React only warns about those against
 * `hydrateRoot`, which needs a real DOM. Scoped tightly to this describe
 * block (register in beforeAll, unregister in afterAll — same pattern as
 * ref-forwarding.test.tsx) so it doesn't leak a global `document` into the
 * "plain server context" tests above, which depend on there being none.
 */
describe("Hydration continuity — defaultOpen sheet against its own SSR output", () => {
  beforeAll(async () => {
    await GlobalRegistrator.register();
    // happy-dom's <dialog> has no showModal/show — same fake dialog-support.test.ts
    // and ref-forwarding.test.tsx use, so Content takes the real top-layer
    // path (dialogOk === true) instead of degrading to FallbackSheet, which
    // is what makes the "dialog appears after the mount effect" half of this
    // test meaningful.
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

  test("first client paint matches the server markup — no dialog, no hydration-mismatch warning", async () => {
    const { hydrateRoot } = await import("react-dom/client");
    const serverHtml = renderToString(<DefaultOpenSheet />);

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    // Act-wrapped so hydration and the mount effect complete inside this
    // call, on both peer React versions. An earlier shape of this test
    // hydrated OUTSIDE act to observe the pre-effect instant — that root's
    // pending scheduler task leaked past the file boundary and, because
    // React's act bookkeeping is process-global, poisoned act() for every
    // suite after this one under React 18 ("Should not already be
    // working"). The pre-effect instant is React's own guarantee (a
    // `useEffect` never runs during the commit it was scheduled in), not a
    // scrollsheet behavior, so it isn't worth that leak; the server-markup
    // shape is asserted directly on renderToString output above.
    let root: ReactDOMClient.Root | undefined;
    await React.act(async () => {
      root = hydrateRoot(container, <DefaultOpenSheet />);
    });

    // React never logged a hydration mismatch — proves the two trees agreed.
    // This is the actual hydration-mismatch-proof assertion: renderToString
    // tests alone can't catch a real client/server divergence, only
    // hydrateRoot warns about those, and it didn't.
    const hydrationWarnings = errorSpy.mock.calls.filter((args) =>
      String(args[0]).toLowerCase().includes("hydrat"),
    );
    expect(hydrationWarnings).toEqual([]);
    errorSpy.mockRestore();

    React.act(() => {
      root?.unmount();
    });
    container.remove();
  });

  test("the dialog appears once the mount effect has actually flushed", async () => {
    const { hydrateRoot } = await import("react-dom/client");
    const serverHtml = renderToString(<DefaultOpenSheet />);

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);

    // Act-wrapped from the very first commit (unlike the test above) so the
    // whole hydrate-then-mount-effect sequence resolves synchronously and
    // deterministically within this one call, with nothing left pending
    // across the test boundary.
    let root: ReactDOMClient.Root | undefined;
    React.act(() => {
      root = hydrateRoot(container, <DefaultOpenSheet />);
    });

    // `mounted` is now true; `dialogOk` was true from the very first render
    // (FakeDialogElement is a synchronous typeof check, not effect-gated),
    // so `present` flips and the dialog renders — proving the fork the
    // audit above reasons about is real, not just "always false in tests".
    // The dialog is a `createPortal(..., document.body)`, a sibling of
    // `container`, not a descendant — checked on `document.body`, matching
    // where content.tsx actually portals it.
    expect(document.body.innerHTML).toContain("scrollsheet-dialog");

    React.act(() => {
      root?.unmount();
    });
    container.remove();
  });
});
