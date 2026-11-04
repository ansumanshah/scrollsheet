import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

/**
 * The Toaster's Android back-gesture watcher: it re-arms after a close
 * (a CloseWatcher is one-shot) but must not exist while only
 * dismissible: false toasts remain, or every back gesture is swallowed.
 */

const live: FakeWatcher[] = [];
class FakeWatcher {
  onclose: (() => void) | null = null;
  oncancel: (() => void) | null = null;
  active = true;
  constructor() {
    live.push(this);
  }
  requestClose() {
    if (!this.active) return;
    this.onclose?.();
    this.destroy();
  }
  close() {
    this.requestClose();
  }
  destroy() {
    this.active = false;
    const i = live.indexOf(this);
    if (i >= 0) live.splice(i, 1);
  }
}
class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let Root: ReactDOMClient.Root;
let container: HTMLElement;

beforeAll(async () => {
  await GlobalRegistrator.register();
  const g = globalThis as Record<string, unknown>;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.ResizeObserver = FakeResizeObserver;
  g.CloseWatcher = FakeWatcher;
  (window as unknown as Record<string, unknown>).CloseWatcher = FakeWatcher;
  const mm = (q: string) => ({
    matches: q.includes("pointer: coarse"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  });
  g.matchMedia = mm;
  (window as unknown as Record<string, unknown>).matchMedia = mm;
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

afterEach(async () => {
  if (Root) await React.act(async () => Root.unmount());
  container?.remove();
});

test("back dismisses one toast at a time, re-arms, and stops watching once only locked toasts remain", async () => {
  const { ToasterShell } = await import("../../packages/scrollsheet/src/toast/shell/toaster-shell");
  const state = await import("../../packages/scrollsheet/src/toast/state");
  const { createRoot } = await import("react-dom/client");
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = createRoot(container);
  await React.act(async () => Root.render(<ToasterShell />));
  await React.act(async () => {
    state.toast("A", { duration: 60_000 });
    state.toast("B", { duration: 60_000 });
    state.toast("Locked", { duration: 60_000, dismissible: false });
  });
  expect(live).toHaveLength(1);

  await React.act(async () => live[0]?.requestClose());
  expect(live).toHaveLength(1); // re-armed: one dismissible toast is left

  await React.act(async () => live[0]?.requestClose());
  // Only the locked toast remains: nothing to dismiss, so no watcher may
  // hold the gesture away from the browser.
  expect(live).toHaveLength(0);
  state._resetSonnerStoreForTests();
});
