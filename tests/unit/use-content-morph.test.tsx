import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

import type { SheetContextValue } from "../../packages/scrollsheet/src/context";
import { jumpScroll } from "../../packages/scrollsheet/src/internal/content-helpers";
import type { ResolvedDetent } from "../../packages/scrollsheet/src/internal/detents";
import { geometryFor, mapScroll } from "../../packages/scrollsheet/src/motion/geometry";
import { type UseContentMorphInput, useContentMorph } from "../../packages/scrollsheet/src/internal/use-content-morph";
import type { ScrollAnimation } from "../../packages/scrollsheet/src/motion/scroll-animator";

/**
 * `useContentMorph`'s reduced-motion gate: the resize observer's own
 * rAF-batched work is exercised directly (not through a real
 * ResizeObserver firing, or a real animation frame — both mocked below for
 * determinism) by capturing the observer callback and invoking it, the same
 * way the browser would once content resizes past the previous max detent.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;
let roCallback: (() => void) | null = null;

class FakeResizeObserver {
  constructor(cb: () => void) {
    roCallback = cb;
  }
  observe() {}
  disconnect() {
    roCallback = null;
  }
}

beforeAll(async () => {
  await GlobalRegistrator.register();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: typeof FakeResizeObserver }).ResizeObserver =
    FakeResizeObserver;
  // Synchronous rAF so the observer callback's deferred work runs inline,
  // instead of the test racing a real animation frame.
  (
    globalThis as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }
  ).requestAnimationFrame = (cb) => {
    cb(0);
    return 0;
  };
  (globalThis as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame =
    () => {};
});

afterEach(() => {
  if (Root) React.act(() => Root.unmount());
  container?.remove();
  roCallback = null;
  delete (globalThis as Record<string, unknown>).matchMedia;
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

function refObject<T>(current: T): React.RefObject<T> {
  return { current };
}

function mockMatchMedia(reduced: boolean) {
  (globalThis as unknown as { matchMedia: (query: string) => MediaQueryList }).matchMedia = (
    query: string,
  ) =>
    ({
      matches: reduced,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
}

function Harness(props: UseContentMorphInput) {
  useContentMorph(props);
  return null;
}

/** A fresh set of morph-engine collaborators; each test overrides what it needs to assert on. */
function buildProps(overrides: Partial<UseContentMorphInput> = {}): UseContentMorphInput {
  const body = document.createElement("div");
  const track = document.createElement("div");
  return {
    phase: "open",
    phaseRef: refObject<UseContentMorphInput["phase"]>("open"),
    bodyRef: refObject<HTMLDivElement | null>(body),
    trackRef: refObject<HTMLDivElement | null>(track),
    ctxRef: refObject<SheetContextValue>({
      side: "bottom",
      activeDetent: "content",
    } as unknown as SheetContextValue),
    fill: false,
    maxDetentRef: refObject(300),
    animRef: refObject<ScrollAnimation | null>(null),
    measure: () => {},
    resolveSpec: () => undefined,
    syncSnapStops: () => {},
    startTween: () => ({ cancel: () => {}, finished: Promise.resolve(true) }),
    geometryFor,
    mapScroll,
    jumpScroll,
    ...overrides,
  };
}

describe("useContentMorph — reduced motion", () => {
  test("prefers-reduced-motion: jumps the track instantly, calls syncSnapStops, never starts a tween", async () => {
    mockMatchMedia(true);
    const syncCalls: number[] = [];
    const startTweenCalls: unknown[] = [];
    const scrollToCalls: ScrollToOptions[] = [];

    const props = buildProps({
      maxDetentRef: refObject(300),
      measure: () => {
        props.maxDetentRef.current = 500; // content grew past the old max detent
      },
      resolveSpec: () => ({ spec: "content", height: 500, index: 0 }) as ResolvedDetent,
      syncSnapStops: () => syncCalls.push(1),
      startTween: (...args) => {
        startTweenCalls.push(args);
        return { cancel: () => {}, finished: Promise.resolve(true) };
      },
    });
    (props.trackRef.current as HTMLDivElement).scrollTo = (opts: ScrollToOptions) => {
      scrollToCalls.push(opts);
    };

    await mount(<Harness {...props} />);
    expect(roCallback).not.toBeNull();
    await React.act(() => {
      roCallback?.();
    });

    expect(startTweenCalls).toHaveLength(0);
    expect(scrollToCalls).toEqual([{ behavior: "instant", top: 500 }]);
    expect(syncCalls).toHaveLength(1);
  });

  test("motion allowed: starts an animated tween instead of jumping", async () => {
    mockMatchMedia(false);
    const startTweenCalls: unknown[] = [];
    const scrollToCalls: ScrollToOptions[] = [];

    const props = buildProps({
      maxDetentRef: refObject(300),
      measure: () => {
        props.maxDetentRef.current = 500;
      },
      resolveSpec: () => ({ spec: "content", height: 500, index: 0 }) as ResolvedDetent,
      startTween: (track, target, axis, suspendSnap) => {
        startTweenCalls.push([target, axis, suspendSnap]);
        return { cancel: () => {}, finished: Promise.resolve(true) };
      },
    });
    (props.trackRef.current as HTMLDivElement).scrollTo = (opts: ScrollToOptions) => {
      scrollToCalls.push(opts);
    };

    await mount(<Harness {...props} />);
    await React.act(() => {
      roCallback?.();
    });

    expect(scrollToCalls).toHaveLength(0);
    expect(startTweenCalls).toEqual([[500, "y", true]]);
  });
});
