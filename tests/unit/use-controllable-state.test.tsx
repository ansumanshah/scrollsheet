import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

import { useControllableState } from "../../packages/scrollsheet/src/internal/use-controllable-state";

/**
 * The hook's no-op guard reads a ref the insertion effect syncs AFTER
 * render — so two setValue calls in the same synchronous tick each need the
 * guard to see the other's write, or the second transition is silently
 * dropped (open-then-close before React re-renders ended stuck open).
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

interface HookApi {
  value: boolean;
  setValue: (next: boolean) => void;
}

async function mountHook(props: {
  prop?: boolean;
  onChange?: (value: boolean) => void;
}): Promise<HookApi> {
  const api = {} as HookApi;
  function Probe() {
    const [value, setValue] = useControllableState<boolean>({
      prop: props.prop,
      defaultProp: false,
      onChange: props.onChange,
    });
    api.value = value;
    api.setValue = setValue;
    return null;
  }
  const { createRoot } = await import("react-dom/client");
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = createRoot(container);
  await React.act(async () => {
    Root.render(<Probe />);
  });
  return api;
}

describe("useControllableState", () => {
  test("two transitions in the same tick both land — open then close ends closed", async () => {
    const fired: boolean[] = [];
    const api = await mountHook({ onChange: (v) => fired.push(v) });
    await React.act(async () => {
      api.setValue(true);
      api.setValue(false);
    });
    expect(fired).toEqual([true, false]);
    expect(api.value).toBe(false);
  });

  test("the same value twice in one tick still no-ops the second call", async () => {
    const fired: boolean[] = [];
    const api = await mountHook({ onChange: (v) => fired.push(v) });
    await React.act(async () => {
      api.setValue(true);
      api.setValue(true);
    });
    expect(fired).toEqual([true]);
    expect(api.value).toBe(true);
  });

  test("a repeat call across renders still no-ops (the original guard's job)", async () => {
    const fired: boolean[] = [];
    const api = await mountHook({ onChange: (v) => fired.push(v) });
    await React.act(async () => {
      api.setValue(true);
    });
    await React.act(async () => {
      api.setValue(true);
    });
    expect(fired).toEqual([true]);
  });

  test("controlled: the value tracks the prop and setValue only reports", async () => {
    const fired: boolean[] = [];
    const api = await mountHook({ prop: false, onChange: (v) => fired.push(v) });
    await React.act(async () => {
      api.setValue(true);
    });
    expect(fired).toEqual([true]);
    // The parent never applied it — the rendered value stays the prop.
    expect(api.value).toBe(false);
  });

  test("controlled: a parent that rejects a change is asked again by the next identical call", async () => {
    const fired: boolean[] = [];
    const api = await mountHook({ prop: false, onChange: (v) => fired.push(v) });
    await React.act(async () => {
      api.setValue(true);
    });
    // No re-render happened (the parent ignored the change) — a later
    // identical request must still notify, not get no-op'd against a ref
    // pinned to the rejected value.
    await React.act(async () => {
      api.setValue(true);
    });
    expect(fired).toEqual([true, true]);
  });
});
