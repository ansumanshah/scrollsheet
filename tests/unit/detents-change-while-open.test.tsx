import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, expect, test } from "bun:test";

import * as React from "react";

/**
 * A detents list swapped while the sheet is open must rebuild the snap
 * stops. measure() used to run only on open, resize, keyboard, and morph,
 * so the engine kept the old stops. Layout is stubbed to an 800px box so
 * fractions resolve to known heights.
 */

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

const SIZE_PROPS = ["clientHeight", "offsetHeight", "scrollHeight"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

beforeAll(async () => {
  await GlobalRegistrator.register();
  (globalThis as Record<string, unknown>).HTMLDialogElement = FakeDialogElement;
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  for (const prop of SIZE_PROPS) {
    saved.set(prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop));
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => 800 });
  }
});

afterAll(async () => {
  for (const prop of SIZE_PROPS) {
    const descriptor = saved.get(prop);
    if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor);
  }
  delete (globalThis as Record<string, unknown>).HTMLDialogElement;
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const snaps = () =>
  [...document.querySelectorAll<HTMLElement>(".scrollsheet-snap")].map((el) => el.style.top);

test("swapping detents while open rebuilds the snap stops", async () => {
  const { Sheet } = await import("../../packages/scrollsheet/src/index");
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const App = ({ detents }: { detents: number[] }) => (
    <Sheet.Root defaultOpen detents={detents} activeDetent={detents[0]}>
      <Sheet.Content aria-label="panel">hi</Sheet.Content>
    </Sheet.Root>
  );

  await React.act(async () => root.render(<App detents={[0.5]} />));
  await React.act(() => sleep(600));
  expect(snaps()).toEqual(["0px", "400px"]);

  await React.act(async () => root.render(<App detents={[0.25, 0.5]} />));
  await React.act(() => sleep(600));
  expect(snaps()).toEqual(["0px", "200px", "400px"]);

  await React.act(async () => root.unmount());
  container.remove();
});
