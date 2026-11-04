import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

import { _resetWarnOnceForTests } from "../../packages/scrollsheet/src/internal/dev-warn";

/**
 * The missing-stylesheet dev warning must still fire when animationSpeed
 * writes --scrollsheet-dur inline on the dialog. The source entry injects
 * the stylesheet itself, so getComputedStyle is wrapped to resolve custom
 * properties from inline styles only: what a consumer who forgot the css
 * import (and so has no core rules) would see.
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

const restores: Array<() => void> = [];
let Root: ReactDOMClient.Root;
let container: HTMLElement;

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
  for (const undo of restores.splice(0)) undo();
  _resetWarnOnceForTests();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function openSheet(animationSpeed?: number) {
  _resetWarnOnceForTests();
  const real = window.getComputedStyle.bind(window);
  const inlineOnly = ((el: Element, pseudo?: string | null) => {
    const computed = real(el, pseudo);
    return new Proxy(computed, {
      get(target, prop) {
        if (prop === "getPropertyValue") {
          return (name: string) =>
            name.startsWith("--")
              ? ((el as HTMLElement).style.getPropertyValue(name) ?? "")
              : target.getPropertyValue(name);
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as typeof window.getComputedStyle;
  const restore = spyOn(window, "getComputedStyle").mockImplementation(inlineOnly);
  restores.push(() => restore.mockRestore());
  const { Sheet } = await import("../../packages/scrollsheet/src/index");
  const { createRoot } = await import("react-dom/client");
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = createRoot(container);
  await React.act(async () =>
    Root.render(
      <Sheet.Root defaultOpen animationSpeed={animationSpeed}>
        <Sheet.Content aria-label="panel">hi</Sheet.Content>
      </Sheet.Root>,
    ),
  );
  await React.act(() => sleep(700));
}

for (const speed of [undefined, 2]) {
  test(`warns about the missing stylesheet with animationSpeed=${speed}`, async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      await openSheet(speed);
      expect(warn.mock.calls.some((args) => String(args[0]).includes("styles.css"))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
}
