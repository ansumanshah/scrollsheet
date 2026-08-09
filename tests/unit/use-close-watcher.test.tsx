import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

import {
  useCloseWatcher,
  type UseCloseWatcherInput,
} from "../../packages/scrollsheet/src/internal/use-close-watcher";

/**
 * Exercises `useCloseWatcher` directly (the sole file this hook lives in),
 * same pattern as use-background-effect.test.tsx: real DOM (happy-dom) for
 * real mount/unmount effect ordering, `window.CloseWatcher` stubbed in per
 * describe block so the default (unsupported) environment is provable too.
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
  // biome-ignore lint: test-only global cleanup
  delete (globalThis.window as Record<string, unknown>).CloseWatcher;
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

class FakeCloseWatcher {
  static instances: FakeCloseWatcher[] = [];
  destroyed = false;
  onclose: (() => void) | null = null;
  oncancel: (() => void) | null = null;
  constructor() {
    FakeCloseWatcher.instances.push(this);
  }
  close() {
    this.onclose?.();
  }
  requestClose() {
    this.oncancel?.();
    this.onclose?.();
  }
  destroy() {
    this.destroyed = true;
  }
}

function Harness(props: UseCloseWatcherInput) {
  useCloseWatcher(props);
  return null;
}

describe("useCloseWatcher — unsupported environment", () => {
  test("no-ops when CloseWatcher is not on window (this test environment's default)", async () => {
    let closed = false;
    await mount(<Harness present nonModal escapeDismissible onClose={() => (closed = true)} />);
    expect(FakeCloseWatcher.instances.length).toBe(0);
    expect(closed).toBe(false);
  });
});

describe("useCloseWatcher — CloseWatcher stubbed in", () => {
  // The hook is gated to touch-primary devices (it only reads `.matches`);
  // this suite runs as one, the dedicated test below flips it off.
  let realMatchMedia: typeof window.matchMedia;
  function stubPointer(coarse: boolean) {
    globalThis.window.matchMedia = ((query: string) => ({
      matches: query === "(hover: none) and (pointer: coarse)" ? coarse : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
  }
  beforeEach(() => {
    realMatchMedia = globalThis.window.matchMedia;
    stubPointer(true);
  });
  afterEach(() => {
    globalThis.window.matchMedia = realMatchMedia;
    FakeCloseWatcher.instances = [];
  });

  test("does not create a watcher on a fine-pointer (desktop) device — Esc stays focus-scoped there", async () => {
    (globalThis.window as Record<string, unknown>).CloseWatcher = FakeCloseWatcher;
    stubPointer(false);
    await mount(<Harness present nonModal escapeDismissible onClose={() => {}} />);
    expect(FakeCloseWatcher.instances.length).toBe(0);
  });

  test("creates a watcher for an open, non-modal, dismissible sheet", async () => {
    (globalThis.window as Record<string, unknown>).CloseWatcher = FakeCloseWatcher;
    await mount(<Harness present nonModal escapeDismissible onClose={() => {}} />);
    expect(FakeCloseWatcher.instances.length).toBe(1);
    expect(FakeCloseWatcher.instances[0]?.destroyed).toBe(false);
  });

  test("does not create a watcher for a modal sheet — closedby already owns that path", async () => {
    (globalThis.window as Record<string, unknown>).CloseWatcher = FakeCloseWatcher;
    await mount(<Harness present nonModal={false} escapeDismissible onClose={() => {}} />);
    expect(FakeCloseWatcher.instances.length).toBe(0);
  });

  test("does not create a watcher for a non-dismissible sheet — must not consume the back gesture", async () => {
    (globalThis.window as Record<string, unknown>).CloseWatcher = FakeCloseWatcher;
    await mount(<Harness present nonModal escapeDismissible={false} onClose={() => {}} />);
    expect(FakeCloseWatcher.instances.length).toBe(0);
  });

  test("the watcher's close event calls the latest onClose, even after a prop-only re-render", async () => {
    (globalThis.window as Record<string, unknown>).CloseWatcher = FakeCloseWatcher;
    let calls = 0;
    const onCloseA = () => {
      calls += 1;
    };
    const onCloseB = () => {
      calls += 100;
    };
    await mount(<Harness present nonModal escapeDismissible onClose={onCloseA} />);
    // Re-render with a new onClose identity but the same dependency values —
    // the effect should NOT tear down/recreate the watcher (latest-ref
    // pattern, same as FallbackSheet's dismissRef), but the callback fired
    // must still be the newest one.
    await React.act(async () => {
      Root.render(<Harness present nonModal escapeDismissible onClose={onCloseB} />);
    });
    expect(FakeCloseWatcher.instances.length).toBe(1);
    FakeCloseWatcher.instances[0]?.close();
    expect(calls).toBe(100);
  });

  test("destroys the watcher on unmount", async () => {
    (globalThis.window as Record<string, unknown>).CloseWatcher = FakeCloseWatcher;
    await mount(<Harness present nonModal escapeDismissible onClose={() => {}} />);
    const watcher = FakeCloseWatcher.instances[0];
    expect(watcher?.destroyed).toBe(false);
    await React.act(() => Root.unmount());
    expect(watcher?.destroyed).toBe(true);
  });

  test("destroys and recreates the watcher when escapeDismissible flips off then on", async () => {
    (globalThis.window as Record<string, unknown>).CloseWatcher = FakeCloseWatcher;
    await mount(<Harness present nonModal escapeDismissible onClose={() => {}} />);
    const first = FakeCloseWatcher.instances[0];
    await React.act(async () => {
      Root.render(<Harness present nonModal escapeDismissible={false} onClose={() => {}} />);
    });
    expect(first?.destroyed).toBe(true);
    expect(FakeCloseWatcher.instances.length).toBe(1); // no second watcher while off

    await React.act(async () => {
      Root.render(<Harness present nonModal escapeDismissible onClose={() => {}} />);
    });
    expect(FakeCloseWatcher.instances.length).toBe(2);
    expect(FakeCloseWatcher.instances[1]?.destroyed).toBe(false);
  });
});
