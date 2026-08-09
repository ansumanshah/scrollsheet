import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";
import { ToasterShell as Toaster } from "../../../packages/scrollsheet/src/toast/shell/toaster-shell";
import { _resetSonnerStoreForTests, toast } from "../../../packages/scrollsheet/src/toast/state";

/**
 * DOM-level proof for two of the original three review findings against the
 * sonner work (onDismiss double-fire; the crossfade a11y finding, rewritten
 * below as its shell-era equivalent — an exit-holding row must be inert)
 * — the pure-function coverage for the hide-not-evict window itself lives
 * in ../sonner-queue.test.ts. Same happy-dom + react-dom/client + React.act
 * pattern as ssr.test.tsx's hydration block: a real reconciler + real DOM is
 * required here because these bugs are about what actually lands in
 * rendered markup (double-fired callbacks, missing inert/aria-hidden), not
 * pure logic.
 *
 * Finding 2 (non-dismissible-saturation window leak) doesn't carry over: the
 * queueing/protection mechanism it guarded is deleted outright at the
 * cutover (state.ts's selectToastWindow has no evict/queued concept left —
 * see its own doc comment), so there's no window leak left to prove absent.
 * `sonner-queue.test.ts`'s "dismissible: false earns no protection" case
 * covers the pure-function side of that same architectural change.
 *
 * The shell portals to document.body, a SIBLING of the mount container, not
 * a descendant — every query below is document-scoped, not container-scoped,
 * for that reason.
 */

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

afterEach(async () => {
  if (Root) await React.act(async () => Root.unmount());
  container?.remove();
  _resetSonnerStoreForTests();
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toasterRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".scrollsheet-toast"));
}

describe("review finding 1 — onDismiss must not double-fire", () => {
  test("close button click", async () => {
    let calls = 0;
    await mount(<Toaster closeButton visibleToasts={3} />);
    await React.act(async () => {
      toast("Hello", { duration: 60_000, onDismiss: () => calls++ });
    });
    const closeBtn = document.querySelector<HTMLButtonElement>(".scrollsheet-toast-close");
    expect(closeBtn).not.toBeNull();
    await React.act(async () => {
      closeBtn?.click();
    });
    expect(calls).toBe(1);
  });

  test("auto-dismiss timer fires onAutoClose exactly once — and never onDismiss (fix 2 corrected this: a natural expiry and a user dismissal are now observably different events, matching real Sonner)", async () => {
    let autoCloseCalls = 0;
    let dismissCalls = 0;
    await mount(<Toaster visibleToasts={3} />);
    await React.act(async () => {
      toast("Quick", {
        duration: 20,
        onAutoClose: () => autoCloseCalls++,
        onDismiss: () => dismissCalls++,
      });
    });
    await React.act(async () => {
      await sleep(80);
    });
    expect(autoCloseCalls).toBe(1);
    expect(dismissCalls).toBe(0);
  });

  test("overflowing visibleToasts never fires onDismiss — hide-not-evict, not eviction (this test used to prove a single eviction-triggered onDismiss; the eviction mechanism it exercised is deleted at the cutover, not migrated — see selectToastWindow's own doc comment)", async () => {
    let calls = 0;
    await mount(<Toaster visibleToasts={1} />);
    await React.act(async () => {
      toast("First", { duration: 60_000, onDismiss: () => calls++ });
    });
    // Second toast overflows the cap=1 window — "First" becomes hidden
    // (data-visible="false"), a real DOM node still ticking, never dismissed.
    await React.act(async () => {
      toast("Second", { duration: 60_000 });
    });
    expect(calls).toBe(0);
    const rows = toasterRows();
    expect(rows).toHaveLength(2);
    const firstRow = rows.find((el) => el.textContent?.includes("First"));
    expect(firstRow?.getAttribute("data-visible")).toBe("false");
  });
});

/**
 * Finding 2 (non-dismissible-saturation window leak) doesn't get a shell-era
 * replacement here: the queueing/protection mechanism it guarded is deleted
 * outright, not migrated (state.ts's own selectToastWindow doc comment), and
 * the resulting hide-not-evict contract already has direct coverage —
 * sonner-queue.test.ts's "dismissible: false earns no protection" case (pure
 * function) and toast-shell.test.tsx's "hide-not-evicted rendering" describe
 * block (DOM-level, persistent nodes + still-ticking timers). Nothing left
 * here would do more than duplicate those.
 */
describe("review finding 3 (shell era) — an exit-holding row is inert and hidden from the a11y tree, with no duplicate node", () => {
  test("dismissing a toast marks its still-mounted exit-hold row inert + aria-hidden; it's the SAME node throughout, never a second copy", async () => {
    await mount(<Toaster visibleToasts={3} closeButton />);
    await React.act(async () => {
      toast("Alpha", { duration: 60_000 });
      toast("Beta", { duration: 60_000 });
    });
    expect(toasterRows()).toHaveLength(2);

    const betaRow = toasterRows().find((el) => el.textContent?.includes("Beta"));
    expect(betaRow).toBeDefined();
    expect(betaRow?.hasAttribute("inert")).toBe(false);
    const closeBtn = betaRow?.querySelector<HTMLButtonElement>(".scrollsheet-toast-close");
    await React.act(async () => {
      closeBtn?.click();
    });

    // Dropped from the live store immediately, but per-toast persistent DOM
    // (the whole point of the hide-not-evict port) means the SAME node keeps
    // rendering for its own EXIT_MS hold (use-toast-exit.ts) — never a
    // second copy, unlike the old collapsed/expanded crossfade this finding
    // originally guarded against.
    const betaRowsNow = toasterRows().filter((el) => el.textContent?.includes("Beta"));
    expect(betaRowsNow).toHaveLength(1);
    const exitingRow = betaRowsNow[0] as HTMLElement;
    expect(exitingRow).toBe(betaRow);
    expect(exitingRow.hasAttribute("data-removed")).toBe(true);
    expect(exitingRow.hasAttribute("inert")).toBe(true);
    expect(exitingRow.getAttribute("aria-hidden")).toBe("true");

    // "Alpha" (never dismissed) stays fully interactive throughout — the
    // exit-hold never touches a sibling.
    const alphaRow = toasterRows().find((el) => el.textContent?.includes("Alpha"));
    expect(alphaRow?.hasAttribute("inert")).toBe(false);
    expect(alphaRow?.getAttribute("aria-hidden")).not.toBe("true");

    await React.act(async () => {
      await sleep(260);
    });
    expect(document.body.textContent).not.toContain("Beta");
  });
});
