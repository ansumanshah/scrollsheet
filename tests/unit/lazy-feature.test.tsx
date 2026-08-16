import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

/**
 * The feature-chunk loader: fetch fires only when active, exactly once per
 * loader across consumers, resolves modules into state, degrades to null on
 * failure, and the critical-chunk registry gates opens only while a load is
 * genuinely in flight.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;
let act: (cb: () => void | Promise<void>) => Promise<void>;
let lazyFeature: typeof import("../../packages/scrollsheet/src/internal/lazy-feature");

beforeAll(async () => {
  GlobalRegistrator.register();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const ReactDOM = await import("react-dom/client");
  ({ act } = (await import("react")) as unknown as { act: typeof act });
  lazyFeature = await import("../../packages/scrollsheet/src/internal/lazy-feature");
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = ReactDOM.createRoot(container);
});

afterEach(async () => {
  await act(() => Root.render(null));
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

interface FakeModule {
  name: string;
}

function makeProbe(loader: ReturnType<typeof lazyFeature.createFeatureLoader<FakeModule>>) {
  const seen: Array<FakeModule | null> = [];
  function Probe({ active }: { active: boolean }) {
    seen.push(loader.useFeature(active));
    return null;
  }
  return { Probe, seen };
}

describe("createFeatureLoader", () => {
  test("inactive never fires the importer", async () => {
    let calls = 0;
    const loader = lazyFeature.createFeatureLoader<FakeModule>(async () => {
      calls += 1;
      return { name: "kb" };
    });
    const { Probe, seen } = makeProbe(loader);
    await act(async () => {
      Root.render(<Probe active={false} />);
    });
    expect(calls).toBe(0);
    expect(seen.every((m) => m === null)).toBe(true);
  });

  test("active loads once, resolves into state, and re-renders with the module", async () => {
    let calls = 0;
    const mod = { name: "kb" };
    const loader = lazyFeature.createFeatureLoader<FakeModule>(async () => {
      calls += 1;
      return mod;
    });
    const { Probe, seen } = makeProbe(loader);
    await act(async () => {
      Root.render(<Probe active />);
    });
    expect(calls).toBe(1);
    expect(seen.at(-1)).toBe(mod);
    // A second consumer joins the same promise — no second fetch.
    const second = makeProbe(loader);
    await act(async () => {
      Root.render(<second.Probe active />);
    });
    expect(calls).toBe(1);
    expect(second.seen.at(-1)).toBe(mod);
  });

  test("a failed import degrades to null and never rejects", async () => {
    const loader = lazyFeature.createFeatureLoader<FakeModule>(async () => {
      throw new Error("offline");
    });
    const { Probe, seen } = makeProbe(loader);
    await act(async () => {
      Root.render(<Probe active />);
    });
    expect(seen.at(-1)).toBe(null);
    await expect(loader.preload()).resolves.toBe(null);
  });
});

describe("ensureFeatures", () => {
  test("null when nothing is pending — the open path stays synchronous", () => {
    expect(lazyFeature.ensureFeatures()).toBe(null);
  });

  test("resolves after tracked critical loads settle, success or failure", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    lazyFeature.trackCritical(gate.then(() => ({ name: "morph" })));
    lazyFeature.trackCritical(gate.then(() => Promise.reject(new Error("dead chunk"))).catch(() => null));
    const ensured = lazyFeature.ensureFeatures();
    expect(ensured).not.toBe(null);
    let settled = false;
    void ensured!.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await ensured;
    expect(settled).toBe(true);
    // Registry drained: later opens are synchronous again.
    expect(lazyFeature.ensureFeatures()).toBe(null);
  });
});
