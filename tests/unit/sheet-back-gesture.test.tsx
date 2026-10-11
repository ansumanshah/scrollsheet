import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

/**
 * A non-modal sheet's Android back watcher: armed while open, re-armed when
 * a controlled parent refuses the close, and absent during the exit leg,
 * where a live watcher would swallow the next back gesture.
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

let Root: ReactDOMClient.Root;
let container: HTMLElement;

beforeAll(async () => {
  await GlobalRegistrator.register();
  const g = globalThis as Record<string, unknown>;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.HTMLDialogElement = FakeDialogElement;
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
  delete (globalThis as Record<string, unknown>).HTMLDialogElement;
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

afterEach(async () => {
  if (Root) await React.act(async () => Root.unmount());
  container?.remove();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mountSheet(onOpenChange: (open: boolean) => void, controlled: boolean) {
  const { Sheet } = await import("../../packages/scrollsheet/src/index");
  const { createRoot } = await import("react-dom/client");
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = createRoot(container);
  const rootProps = controlled ? { open: true } : { defaultOpen: true };
  await React.act(async () =>
    Root.render(
      <Sheet.Root modal={false} onOpenChange={onOpenChange} {...rootProps}>
        <Sheet.Content aria-label="panel">hi</Sheet.Content>
      </Sheet.Root>,
    ),
  );
  await React.act(() => sleep(700));
}

test("a controlled parent that refuses the close still has a live watcher for the next back gesture", async () => {
  let closes = 0;
  await mountSheet(() => (closes += 1), true);
  expect(live).toHaveLength(1);
  await React.act(async () => live[0]?.requestClose());
  expect(closes).toBe(1);
  expect(live).toHaveLength(1);
  await React.act(async () => live[0]?.requestClose());
  expect(closes).toBe(2);
});

test("no watcher exists during the exit leg", async () => {
  // happy-dom has no WAAPI, so a leg finishes instantly. A stub whose
  // `finished` never settles holds the sheet in "closing" until the backstop.
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const hadAnimate = Object.getOwnPropertyDescriptor(proto, "animate");
  proto.animate = () => ({
    finished: new Promise(() => {}),
    cancel() {},
    commitStyles() {},
  });
  let closes = 0;
  try {
    await runExitLegCheck(() => (closes += 1));
  } finally {
    if (hadAnimate) Object.defineProperty(proto, "animate", hadAnimate);
    else delete proto.animate;
  }
  expect(closes).toBe(1);
});

async function runExitLegCheck(onOpenChange: (open: boolean) => void) {
  await mountSheet(onOpenChange, false);
  expect(live).toHaveLength(1);
  await React.act(async () => live[0]?.requestClose());
  expect(
    document.querySelector("[data-scrollsheet-state]")?.getAttribute("data-scrollsheet-state"),
  ).toBe("closing");
  expect(live).toHaveLength(0);
}
