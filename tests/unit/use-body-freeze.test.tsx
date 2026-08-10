import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

/**
 * iOS body freeze: freeze pins the body at the current scroll offset,
 * unfreeze restores styles and scroll position. The restore must be
 * INSTANT even when the page ships `scroll-behavior: smooth` — a plain
 * two-arg scrollTo obeys that CSS, which on a real iPhone turned every
 * sheet close into a visible full-page scroll back to the reading spot.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;
let act: (cb: () => void) => Promise<void> | void;
let useBodyFreeze: (active: boolean) => void;

const realPlatform = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(globalThis.navigator ?? {}),
  "platform",
);

beforeAll(async () => {
  GlobalRegistrator.register();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(navigator, "platform", { value: "iPhone", configurable: true });
  const ReactDOM = await import("react-dom/client");
  ({ act } = await import("react"));
  ({ useBodyFreeze } = await import("../../packages/scrollsheet/src/internal/use-body-freeze"));
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = ReactDOM.createRoot(container);
});

afterEach(async () => {
  await act(() => Root.render(null));
});

afterAll(async () => {
  if (realPlatform) {
    Object.defineProperty(navigator, "platform", realPlatform);
  }
  await GlobalRegistrator.unregister();
});

function Freezer({ active }: { active: boolean }) {
  useBodyFreeze(active);
  return null;
}

describe("useBodyFreeze", () => {
  test("freezes the body at the scroll offset and restores it instantly, even under scroll-behavior: smooth", async () => {
    document.documentElement.style.scrollBehavior = "smooth";
    window.scrollTo(0, 420);

    const behaviorsAtScroll: string[] = [];
    const realScrollTo = window.scrollTo.bind(window);
    window.scrollTo = ((...args: unknown[]) => {
      behaviorsAtScroll.push(document.documentElement.style.scrollBehavior);
      return (realScrollTo as (...a: unknown[]) => void)(...args);
    }) as typeof window.scrollTo;

    await act(() => Root.render(<Freezer active />));
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-420px");

    await act(() => Root.render(<Freezer active={false} />));
    expect(document.body.style.position).toBe("");
    expect(window.scrollY).toBe(420);
    // the restore scroll ran with the smooth behavior suspended…
    expect(behaviorsAtScroll[behaviorsAtScroll.length - 1]).toBe("auto");
    // …and the page's own value came back afterwards
    expect(document.documentElement.style.scrollBehavior).toBe("smooth");

    window.scrollTo = realScrollTo;
    document.documentElement.style.scrollBehavior = "";
  });
});
