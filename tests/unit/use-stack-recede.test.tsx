import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

import type { SheetContextValue, StackContextValue } from "../../packages/scrollsheet/src/context";
import type { Phase } from "../../packages/scrollsheet/src/internal/content-helpers";
import { useStackRecede } from "../../packages/scrollsheet/src/internal/use-stack-recede";

/**
 * The parent's recede is keyed per child: with two children open at once,
 * closing one must leave the parent held back by the sibling that is still
 * up — the old unkeyed cleanup zeroed the whole recede unconditionally.
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

afterEach(() => {
  if (Root) React.act(() => Root.unmount());
  container?.remove();
});

interface ParentApi {
  stackValue: StackContextValue;
  childCount: number;
}

/** A parent sheet reduced to the hook's inputs: settled open, real panel element. */
async function mountParent(): Promise<ParentApi> {
  const api = {} as ParentApi;
  function Parent() {
    const phaseRef = React.useRef<Phase>("open");
    const panelRef = React.useRef<HTMLDivElement | null>(null);
    const ctxRef = React.useRef({ side: "bottom" } as SheetContextValue);
    const childCountRef = React.useRef(0);
    const childProgressRef = React.useRef(0);
    const [childCount, setChildCount] = React.useState(0);
    const { stackValue } = useStackRecede({
      parentStack: null,
      present: true,
      phase: "open",
      phaseRef,
      panelRef,
      ctxRef,
      childCountRef,
      childProgressRef,
      setChildCount,
    });
    api.stackValue = stackValue;
    api.childCount = childCount;
    return <div ref={panelRef} />;
  }
  const { createRoot } = await import("react-dom/client");
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = createRoot(container);
  await React.act(async () => {
    Root.render(<Parent />);
  });
  return api;
}

function stackProgress(): string {
  const panel = container.querySelector("div");
  if (!panel) throw new Error("panel not mounted");
  return panel.style.getPropertyValue("--scrollsheet-stack-progress");
}

describe("useStackRecede — per-child registry", () => {
  test("closing one of two open children keeps the parent receded for the sibling", async () => {
    const api = await mountParent();
    const childA = {};
    const childB = {};
    await React.act(async () => {
      api.stackValue.setChildOpen(true, childA);
      api.stackValue.setChildProgress(1, false, childA);
      api.stackValue.setChildOpen(true, childB);
      api.stackValue.setChildProgress(1, false, childB);
    });
    expect(stackProgress()).toBe("1");

    await React.act(async () => {
      api.stackValue.setChildOpen(false, childA);
    });
    // Child B is still up — the parent must stay fully receded.
    expect(stackProgress()).toBe("1");
    expect(api.childCount).toBe(1);

    await React.act(async () => {
      api.stackValue.setChildOpen(false, childB);
    });
    expect(stackProgress()).toBe("0");
    expect(api.childCount).toBe(0);
  });

  test("the applied recede is the max across children, not the last write", async () => {
    const api = await mountParent();
    const childA = {};
    const childB = {};
    await React.act(async () => {
      api.stackValue.setChildOpen(true, childA);
      api.stackValue.setChildProgress(1, false, childA);
      api.stackValue.setChildOpen(true, childB);
      // B dragging at 0.4 must not pull the parent below A's settled 1.
      api.stackValue.setChildProgress(0.4, true, childB);
    });
    expect(stackProgress()).toBe("1");
  });

  test("a progress write for an unregistered child is ignored", async () => {
    const api = await mountParent();
    const stranger = {};
    await React.act(async () => {
      api.stackValue.setChildProgress(1, false, stranger);
    });
    expect(stackProgress()).toBe("");
  });

  test("single child open/close round-trips exactly as before", async () => {
    const api = await mountParent();
    const child = {};
    await React.act(async () => {
      api.stackValue.setChildOpen(true, child);
      api.stackValue.setChildProgress(1, false, child);
    });
    expect(stackProgress()).toBe("1");
    await React.act(async () => {
      api.stackValue.setChildOpen(false, child);
    });
    expect(stackProgress()).toBe("0");
  });
});
