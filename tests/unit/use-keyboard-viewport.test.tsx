import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import * as React from "react";
import type * as ReactDOMClient from "react-dom/client";

import type { SheetContextValue } from "../../packages/scrollsheet/src/context";
import { jumpScroll } from "../../packages/scrollsheet/src/internal/content-helpers";
import type { DetentSpec, ResolvedDetent } from "../../packages/scrollsheet/src/internal/detents";
import { useKeyboardViewport } from "../../packages/scrollsheet/src/internal/use-keyboard-viewport";

/**
 * Pins the `keyboardExpands` promotion state machine directly against the
 * hook — the arm/promote/divergence/restore transitions are deterministic
 * and need no real keyboard, which e2e can only stub anyway. The e2e specs
 * (tests/e2e/regression/keyboard-gaps.spec.ts) own the DOM-visible
 * contract; this file owns the transitions they can't reach: unmount while
 * promoted, drag-away-and-back divergence, controlled-and-ignored.
 *
 * visualViewport is a fake EventTarget and requestAnimationFrame is
 * synchronous, so every relayout settles within the act() that caused it.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;

/**
 * Plain listener-map fake, NOT `extends EventTarget`: this module evaluates
 * before GlobalRegistrator.register(), so a class extending EventTarget
 * binds Bun's implementation while events dispatched inside tests are
 * happy-dom's — dispatchEvent then rejects them (ERR_INVALID_ARG_TYPE).
 */
function makeFakeVisualViewport() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    height: 800,
    offsetTop: 0,
    scale: 1,
    addEventListener(type: string, cb: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(cb);
    },
    removeEventListener(type: string, cb: () => void) {
      listeners.get(type)?.delete(cb);
    },
    dispatch(type: string) {
      for (const cb of listeners.get(type) ?? []) cb();
    },
  };
}
let vv: ReturnType<typeof makeFakeVisualViewport>;
let realRaf: typeof requestAnimationFrame;

beforeAll(async () => {
  await GlobalRegistrator.register();
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  await GlobalRegistrator.unregister();
});

beforeEach(() => {
  vv = makeFakeVisualViewport();
  vv.height = window.innerHeight;
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  realRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as typeof requestAnimationFrame;
});

afterEach(() => {
  if (Root) React.act(() => Root.unmount());
  container?.remove();
  window.requestAnimationFrame = realRaf;
  Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
});

const RESOLVED: ResolvedDetent[] = [
  { spec: 0.3, height: 240, index: 0 },
  { spec: 0.85, height: 680, index: 1 },
];

interface HarnessProps {
  activeDetent: DetentSpec;
  setActiveDetent: (detent: DetentSpec) => void;
  keyboardExpands?: boolean;
  resolved?: ResolvedDetent[];
}

function Harness({
  activeDetent,
  setActiveDetent,
  keyboardExpands = true,
  resolved = RESOLVED,
}: HarnessProps) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const ctx = { keyboardExpands, activeDetent, setActiveDetent } as SheetContextValue;
  const ctxRef = React.useRef(ctx);
  ctxRef.current = ctx;
  useKeyboardViewport({
    present: true,
    markProgrammaticScroll: () => {},
    jumpScroll,
    side: "bottom",
    activeDetent,
    dialogRef: dialogRef as React.RefObject<HTMLDivElement | null>,
    panelRef,
    trackRef,
    measure: () => {},
    resolveSpec: (spec) => resolved.find((r) => r.spec === spec),
    resolvedRef: { current: resolved },
    updateTravel: () => {},
    phaseRef: { current: "open" },
    ctxRef,
    animRef: { current: null },
  });
  return (
    <div ref={dialogRef}>
      <div ref={trackRef} />
      <div ref={panelRef}>
        <input aria-label="field" />
      </div>
    </div>
  );
}

async function mount(element: React.ReactElement) {
  const { createRoot } = await import("react-dom/client");
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = createRoot(container);
  await React.act(async () => {
    Root.render(element);
  });
}

/** A honored-controlled holder outside React state, so it survives unmount. */
function makeStore(initial: DetentSpec) {
  const calls: DetentSpec[] = [];
  const store = {
    active: initial,
    calls,
    set(detent: DetentSpec) {
      calls.push(detent);
      store.active = detent;
    },
  };
  return store;
}

const render = (store: ReturnType<typeof makeStore>, extra?: Partial<HarnessProps>) =>
  React.act(async () => {
    Root.render(<Harness activeDetent={store.active} setActiveDetent={store.set} {...extra} />);
  });

async function focusField() {
  await React.act(async () => {
    const input = document.querySelector("input");
    // Real focus, not just a synthetic event: the hook's late-attach
    // reconcile re-arms from document.activeElement whenever its effect
    // re-runs, and a synthetic-only focus would read as a falling edge.
    input?.focus();
    input?.dispatchEvent(new Event("focusin", { bubbles: true }));
  });
}

async function setKeyboard(px: number) {
  await React.act(async () => {
    vv.height = window.innerHeight - px;
    vv.dispatch("resize");
  });
}

describe("keyboardExpands state machine", () => {
  test("rising edge promotes to the tallest detent; focus alone never does", async () => {
    const store = makeStore(0.3);
    await mount(<Harness activeDetent={store.active} setActiveDetent={store.set} />);

    await focusField();
    expect(store.calls).toEqual([]);

    await setKeyboard(300);
    expect(store.calls).toEqual([0.85]);
  });

  test("falling edge restores the pre-promotion detent when nothing moved", async () => {
    const store = makeStore(0.3);
    await mount(<Harness activeDetent={store.active} setActiveDetent={store.set} />);
    await focusField();
    await setKeyboard(300);
    await render(store);

    await setKeyboard(0);
    expect(store.calls).toEqual([0.85, 0.3]);
  });

  test("moving away and back to the tallest detent cancels the restore — the user owns the position", async () => {
    const store = makeStore(0.3);
    await mount(<Harness activeDetent={store.active} setActiveDetent={store.set} />);
    await focusField();
    await setKeyboard(300);
    await render(store);

    // A drag settles the sheet at 0.3, then a second gesture back at 0.85 —
    // both land as ordinary activeDetent changes.
    store.set(0.3);
    await render(store);
    store.set(0.85);
    await render(store);

    await setKeyboard(0);
    // No restore call: the last transition is the user's own move to 0.85.
    expect(store.calls).toEqual([0.85, 0.3, 0.85]);
    expect(store.active).toBe(0.85);
  });

  test("a stray vv tick after divergence never re-promotes — one promotion per keyboard session", async () => {
    const store = makeStore(0.3);
    await mount(<Harness activeDetent={store.active} setActiveDetent={store.set} />);
    await focusField();
    await setKeyboard(300);
    await render(store);
    expect(store.active).toBe(0.85);

    // The user drags down to the peek detent while the keyboard stays up.
    store.set(0.3);
    await render(store);

    // iOS emits offsetTop-only vv scroll ticks with no height change.
    await React.act(async () => {
      vv.dispatch("scroll");
    });
    expect(store.active).toBe(0.3);
    expect(store.calls).toEqual([0.85, 0.3]);
  });

  test("unmounting while promoted restores first — the promoted detent must not leak into the next open", async () => {
    const store = makeStore(0.3);
    await mount(<Harness activeDetent={store.active} setActiveDetent={store.set} />);
    await focusField();
    await setKeyboard(300);
    await render(store);
    expect(store.active).toBe(0.85);

    await React.act(async () => {
      Root.unmount();
    });
    expect(store.active).toBe(0.3);
  });

  test("a single-detent sheet never arms", async () => {
    const store = makeStore(0.5);
    await mount(
      <Harness
        activeDetent={store.active}
        setActiveDetent={store.set}
        resolved={[{ spec: 0.5, height: 400, index: 0 }]}
      />,
    );
    await focusField();
    await setKeyboard(300);
    expect(store.calls).toEqual([]);
  });

  test("keyboardExpands off: the inset registers, the detent never moves", async () => {
    const store = makeStore(0.3);
    await mount(
      <Harness activeDetent={store.active} setActiveDetent={store.set} keyboardExpands={false} />,
    );
    await focusField();
    await setKeyboard(300);
    expect(store.calls).toEqual([]);
  });

  test("controlled-and-ignored: promotion attempt is a silent no-op, no phantom restore later", async () => {
    const ignoredCalls: DetentSpec[] = [];
    // The consumer never applies onActiveDetentChange back: activeDetent
    // stays 0.3 no matter what the hook asks for.
    await mount(<Harness activeDetent={0.3} setActiveDetent={(d) => ignoredCalls.push(d)} />);
    await focusField();
    await setKeyboard(300);
    expect(ignoredCalls).toEqual([0.85]);

    await setKeyboard(0);
    // The divergence effect saw activeDetent never reach the promoted spec
    // and disarmed — the falling edge must not fire a restore.
    expect(ignoredCalls).toEqual([0.85]);
  });
});
