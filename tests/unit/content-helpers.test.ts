import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  geometryFor,
  recedeTransform,
  type Side,
} from "../../packages/scrollsheet/src/motion/geometry";
import {
  applyBackgroundEffect,
  applyFullHeightRadius,
  applyRecede,
  clearRecede,
  DEFAULT_RADIUS_PX,
  DRAG_CLICK_SUPPRESS_PX,
  DRAG_PROJECTION_MS,
  DRAG_VELOCITY_WINDOW_MS,
  FOCUS_SCROLL_DEBOUNCE_MS,
  FULL_HEIGHT_RADIUS_FLATTEN_PX,
  getVirtualKeyboardApi,
  jumpScroll,
  KEYBOARD_BASELINE_MAX_PX,
  KEYBOARD_RESIZE_THRESHOLD_PX,
  MAX_RELEASE_VELOCITY_AGE_MS,
  measureContentHeight,
  MIN_DISPLACEMENT_FOR_VELOCITY_PX,
  NO_DRAG_SELECTOR,
  OFFSCREEN_EXTRA_PX,
  offscreenTransform,
  resolveClosedBy,
  restoreFocusFallback,
  SETTLE_FALLBACK_MS,
  transformSide,
  TRAVEL_MS,
  willOpenKeyboard,
} from "../../packages/scrollsheet/src/internal/content-helpers";

const ALL_SIDES: Side[] = ["bottom", "top", "left", "right"];

/**
 * This file's test env has none of these globals by default (verified: bun's
 * `navigator` exists but `location`/`document`/`matchMedia`/`HTMLElement`/
 * `requestAnimationFrame` do not — same "no DOM globals" baseline
 * dialog-support.test.ts documents). Every describe block below installs
 * only what its own function under test reads, and this single afterEach
 * clears all of it — `delete` on an absent key is a no-op, so one cleanup
 * list is safe even though not every test in the file sets every key.
 */
afterEach(() => {
  delete (globalThis as Record<string, unknown>).HTMLElement;
  delete (globalThis as Record<string, unknown>).HTMLInputElement;
  delete (globalThis as Record<string, unknown>).HTMLTextAreaElement;
  delete (globalThis as Record<string, unknown>).location;
  delete (navigator as unknown as Record<string, unknown>).virtualKeyboard;
  delete (globalThis as Record<string, unknown>).matchMedia;
  delete (globalThis as Record<string, unknown>).getComputedStyle;
  delete (globalThis as Record<string, unknown>).document;
  delete (globalThis as Record<string, unknown>).requestAnimationFrame;
});

describe("documented constants", () => {
  test("motion/gesture timing constants match their documented values", () => {
    expect(SETTLE_FALLBACK_MS).toBe(120);
    expect(TRAVEL_MS).toBe(380);
    expect(FOCUS_SCROLL_DEBOUNCE_MS).toBe(250);
    expect(DRAG_VELOCITY_WINDOW_MS).toBe(100);
    expect(DRAG_PROJECTION_MS).toBe(160);
    expect(DRAG_CLICK_SUPPRESS_PX).toBe(4);
    expect(MAX_RELEASE_VELOCITY_AGE_MS).toBe(80);
    expect(MIN_DISPLACEMENT_FOR_VELOCITY_PX).toBe(24);
  });

  test("keyboard threshold constants keep the baseline cap strictly below the toolbar-resize threshold", () => {
    // A real mid-close keyboard resize is >= KEYBOARD_RESIZE_THRESHOLD_PX; if
    // KEYBOARD_BASELINE_MAX_PX ever grew to meet or exceed it, a genuine
    // keyboard toggle could get sampled as "toolbar" baseline instead.
    expect(KEYBOARD_RESIZE_THRESHOLD_PX).toBe(100);
    expect(KEYBOARD_BASELINE_MAX_PX).toBe(80);
    expect(KEYBOARD_BASELINE_MAX_PX).toBeLessThan(KEYBOARD_RESIZE_THRESHOLD_PX);
  });

  test("full-height radius constants", () => {
    expect(FULL_HEIGHT_RADIUS_FLATTEN_PX).toBe(48);
    expect(DEFAULT_RADIUS_PX).toBe(16);
  });

  test("OFFSCREEN_EXTRA_PX is the extra travel clearing the panel's own shadow on exit", () => {
    expect(OFFSCREEN_EXTRA_PX).toBe(32);
  });

  test("NO_DRAG_SELECTOR covers every interactive/opt-out element the drag engine must not hijack", () => {
    for (const part of [
      "button",
      "a",
      "input",
      "textarea",
      "select",
      "label",
      "[contenteditable]",
      "[data-scrollsheet-no-drag]",
    ]) {
      expect(NO_DRAG_SELECTOR).toContain(part);
    }
  });
});

describe("resolveClosedBy", () => {
  test("escapeDismissible true maps to closerequest, regardless of backdropDismissible", () => {
    expect(resolveClosedBy(true)).toBe("closerequest");
  });

  test("escapeDismissible false maps to none", () => {
    expect(resolveClosedBy(false)).toBe("none");
  });

  test("never returns 'any' for either input", () => {
    expect(resolveClosedBy(true)).not.toBe("any");
    expect(resolveClosedBy(false)).not.toBe("any");
  });
});

describe("willOpenKeyboard", () => {
  class FakeElement {
    isContentEditable = false;
  }
  class FakeTextArea extends FakeElement {}
  class FakeInput extends FakeElement {
    type: string;
    constructor(type = "text") {
      super();
      this.type = type;
    }
  }

  beforeEach(() => {
    (globalThis as Record<string, unknown>).HTMLElement = FakeElement;
    (globalThis as Record<string, unknown>).HTMLTextAreaElement = FakeTextArea;
    (globalThis as Record<string, unknown>).HTMLInputElement = FakeInput;
  });

  test("a textarea always opens the keyboard, regardless of isContentEditable", () => {
    const el = new FakeTextArea();
    expect(willOpenKeyboard(el as unknown as Element)).toBe(true);
  });

  test("a contentEditable element that is neither textarea nor input opens the keyboard", () => {
    const el = new FakeElement();
    el.isContentEditable = true;
    expect(willOpenKeyboard(el as unknown as Element)).toBe(true);
  });

  test("a plain, non-editable element never opens the keyboard", () => {
    const el = new FakeElement();
    expect(willOpenKeyboard(el as unknown as Element)).toBe(false);
  });

  test("text-like inputs open the keyboard across a representative sample of types", () => {
    for (const type of ["text", "email", "password", "search", "tel", "url", "number", "date"]) {
      expect(willOpenKeyboard(new FakeInput(type) as unknown as Element)).toBe(true);
    }
  });

  test("every NON_TEXT_INPUT_TYPES entry never opens the keyboard", () => {
    for (const type of [
      "checkbox",
      "radio",
      "range",
      "color",
      "file",
      "image",
      "button",
      "submit",
      "reset",
      "hidden",
    ]) {
      expect(willOpenKeyboard(new FakeInput(type) as unknown as Element)).toBe(false);
    }
  });

  test("isContentEditable on an input still wins over its own non-text type (check order: textarea, then contentEditable, then input type)", () => {
    const el = new FakeInput("checkbox");
    el.isContentEditable = true;
    expect(willOpenKeyboard(el as unknown as Element)).toBe(true);
  });

  test("an Element that is neither HTMLElement, textarea, nor input never opens the keyboard", () => {
    class FakeSvgElement {}
    expect(willOpenKeyboard(new FakeSvgElement() as unknown as Element)).toBe(false);
  });
});

describe("getVirtualKeyboardApi", () => {
  test("null when location is unavailable (this test env's own default, same as SSR)", () => {
    expect(typeof location).toBe("undefined");
    expect(getVirtualKeyboardApi()).toBeNull();
  });

  test("null on a non-secure, non-localhost origin, even when navigator.virtualKeyboard exists", () => {
    (globalThis as Record<string, unknown>).location = {
      protocol: "http:",
      hostname: "example.com",
    };
    (navigator as unknown as Record<string, unknown>).virtualKeyboard = { fake: true };
    expect(getVirtualKeyboardApi()).toBeNull();
  });

  test("null on https when navigator has no virtualKeyboard", () => {
    (globalThis as Record<string, unknown>).location = {
      protocol: "https:",
      hostname: "example.com",
    };
    expect(getVirtualKeyboardApi()).toBeNull();
  });

  test("returns navigator.virtualKeyboard on a secure (https) origin", () => {
    (globalThis as Record<string, unknown>).location = {
      protocol: "https:",
      hostname: "example.com",
    };
    const api = { overlaysContent: false };
    (navigator as unknown as Record<string, unknown>).virtualKeyboard = api;
    expect(getVirtualKeyboardApi()).toBe(api as never);
  });

  test("returns navigator.virtualKeyboard on http+localhost too (the dev-server allowance)", () => {
    (globalThis as Record<string, unknown>).location = {
      protocol: "http:",
      hostname: "localhost",
    };
    const api = { overlaysContent: true };
    (navigator as unknown as Record<string, unknown>).virtualKeyboard = api;
    expect(getVirtualKeyboardApi()).toBe(api as never);
  });
});

describe("jumpScroll", () => {
  test("axis 'y' calls scrollTo with instant behavior and only 'top' set", () => {
    const calls: ScrollToOptions[] = [];
    const el = { scrollTo: (opts: ScrollToOptions) => calls.push(opts) } as unknown as HTMLElement;
    jumpScroll(el, "y", 120);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ behavior: "instant", top: 120 });
    expect(Object.hasOwn(calls[0] as object, "left")).toBe(false);
  });

  test("axis 'x' calls scrollTo with instant behavior and only 'left' set", () => {
    const calls: ScrollToOptions[] = [];
    const el = { scrollTo: (opts: ScrollToOptions) => calls.push(opts) } as unknown as HTMLElement;
    jumpScroll(el, "x", -40);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ behavior: "instant", left: -40 });
    expect(Object.hasOwn(calls[0] as object, "top")).toBe(false);
  });

  test("uses el.scrollTo, never a direct scrollTop/scrollLeft assignment (the WebKit snap-revert workaround)", () => {
    let scrollToCalled = false;
    let directAssignCalled = false;
    const el = {
      scrollTo: () => {
        scrollToCalled = true;
      },
      set scrollTop(_v: number) {
        directAssignCalled = true;
      },
      set scrollLeft(_v: number) {
        directAssignCalled = true;
      },
    } as unknown as HTMLElement;
    jumpScroll(el, "y", 50);
    expect(scrollToCalled).toBe(true);
    expect(directAssignCalled).toBe(false);
  });
});

describe("transformSide", () => {
  test("non-bottom sides are always returned unchanged, even detached with a desktop-matching matchMedia", () => {
    (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: true });
    expect(transformSide("top", true)).toBe("top");
    expect(transformSide("left", true)).toBe("left");
    expect(transformSide("right", true)).toBe("right");
  });

  test("bottom + not detached stays 'bottom' regardless of matchMedia", () => {
    (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: true });
    expect(transformSide("bottom", false)).toBe("bottom");
  });

  test("bottom + detached, but no matchMedia available (SSR / this test env's default) stays 'bottom'", () => {
    expect(typeof matchMedia).toBe("undefined");
    expect(transformSide("bottom", true)).toBe("bottom");
  });

  test("bottom + detached + narrow viewport (matches: false) stays 'bottom'", () => {
    (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: false });
    expect(transformSide("bottom", true)).toBe("bottom");
  });

  test("bottom + detached + desktop viewport (matches: true) becomes 'right' — the dock-as-drawer flip", () => {
    let queried: string | undefined;
    (globalThis as Record<string, unknown>).matchMedia = (q: string) => {
      queried = q;
      return { matches: true };
    };
    expect(transformSide("bottom", true)).toBe("right");
    expect(queried).toBe("(min-width: 768px)");
  });

  test("desktop drawer + rtl computed direction becomes 'left' — travel follows the inline-end dock", () => {
    (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: true });
    let styled: unknown;
    (globalThis as Record<string, unknown>).getComputedStyle = (el: unknown) => {
      styled = el;
      return { direction: "rtl" };
    };
    const panel = {} as Element;
    expect(transformSide("bottom", true, panel)).toBe("left");
    expect(styled).toBe(panel);
  });

  test("desktop drawer + ltr computed direction stays 'right', with or without a panel to read", () => {
    (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: true });
    (globalThis as Record<string, unknown>).getComputedStyle = () => ({ direction: "ltr" });
    expect(transformSide("bottom", true, {} as Element)).toBe("right");
    expect(transformSide("bottom", true, null)).toBe("right");
    expect(transformSide("bottom", true)).toBe("right");
  });

  test("a panel but no getComputedStyle global (SSR-ish) still resolves 'right', not a crash", () => {
    (globalThis as Record<string, unknown>).matchMedia = () => ({ matches: true });
    expect(typeof getComputedStyle).toBe("undefined");
    expect(transformSide("bottom", true, {} as Element)).toBe("right");
  });
});

describe("offscreenTransform", () => {
  test("adds the panel's resting inset to the exit travel", () => {
    // A detached card sits its inset away from the edge it leaves through,
    // so 100% + the shadow clearance alone parks it short of offscreen.
    expect(offscreenTransform("bottom", 1, 150)).toBe(
      `translate3d(0, calc(100.000% + ${(OFFSCREEN_EXTRA_PX + 150).toFixed(3)}px), 0)`,
    );
    expect(offscreenTransform("top", 1, 150)).toBe(
      `translate3d(0, calc(-100.000% + -${(OFFSCREEN_EXTRA_PX + 150).toFixed(3)}px), 0)`,
    );
    expect(offscreenTransform("left", 1, 24)).toBe(
      `translate3d(calc(-100.000% + -${(OFFSCREEN_EXTRA_PX + 24).toFixed(3)}px), 0, 0)`,
    );
  });

  test("a negative inset never shortens the default travel", () => {
    expect(offscreenTransform("bottom", 1, -500)).toBe(
      `translate3d(0, calc(100.000% + ${OFFSCREEN_EXTRA_PX.toFixed(3)}px), 0)`,
    );
  });


  test("v=0 (fully open) collapses to a zero calc() on every side", () => {
    for (const side of ALL_SIDES) {
      expect(offscreenTransform(side, 0)).toContain("calc(0.000% + 0.000px)");
    }
  });

  test("bottom/right (dir +1) translate positively along their own axis at v=1", () => {
    const extra = OFFSCREEN_EXTRA_PX.toFixed(3);
    expect(offscreenTransform("bottom", 1)).toBe(`translate3d(0, calc(100.000% + ${extra}px), 0)`);
    expect(offscreenTransform("right", 1)).toBe(`translate3d(calc(100.000% + ${extra}px), 0, 0)`);
  });

  test("top/left (dir -1) translate negatively along their own axis at v=1", () => {
    const extra = OFFSCREEN_EXTRA_PX.toFixed(3);
    expect(offscreenTransform("top", 1)).toBe(`translate3d(0, calc(-100.000% + -${extra}px), 0)`);
    expect(offscreenTransform("left", 1)).toBe(`translate3d(calc(-100.000% + -${extra}px), 0, 0)`);
  });

  test("y-axis sides (bottom/top) only ever move on y; x-axis sides (left/right) only ever move on x", () => {
    expect(offscreenTransform("bottom", 0.5)).toMatch(/^translate3d\(0, /);
    expect(offscreenTransform("top", 0.5)).toMatch(/^translate3d\(0, /);
    expect(offscreenTransform("left", 0.5)).toMatch(/, 0, 0\)$/);
    expect(offscreenTransform("right", 0.5)).toMatch(/, 0, 0\)$/);
  });

  test("intermediate v scales both the percent and px terms proportionally", () => {
    expect(offscreenTransform("bottom", 0.25)).toBe("translate3d(0, calc(25.000% + 8.000px), 0)");
  });
});

describe("restoreFocusFallback", () => {
  interface FocusCall {
    preventScroll?: boolean;
  }

  function makeFocusable(): HTMLElement & { focusCalls: FocusCall[] } {
    const focusCalls: FocusCall[] = [];
    return {
      focusCalls,
      focus(opts?: FocusCall) {
        focusCalls.push(opts ?? {});
      },
    } as unknown as HTMLElement & { focusCalls: FocusCall[] };
  }

  function installFakeDocument(initiallyAttached: boolean) {
    let attached = initiallyAttached;
    const body = { contains: (_el: unknown) => attached };
    const documentElement = {};
    const doc = { body, documentElement, activeElement: null as unknown };
    (globalThis as Record<string, unknown>).document = doc;
    return {
      doc,
      setAttached: (v: boolean) => {
        attached = v;
      },
    };
  }

  function installFakeRaf() {
    const queue: Array<() => void> = [];
    (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: () => void) => {
      queue.push(cb);
      return queue.length;
    };
    return {
      // restoreFocusFallback nests exactly two rAF calls — draining to empty
      // runs both frames deterministically without a real animation loop.
      flush: () => {
        while (queue.length) {
          const cb = queue.shift();
          cb?.();
        }
      },
    };
  }

  test("no-ops synchronously for a null previous — no rAF is even scheduled", () => {
    let rafCalls = 0;
    (globalThis as Record<string, unknown>).requestAnimationFrame = () => {
      rafCalls++;
      return 0;
    };
    restoreFocusFallback(null);
    expect(rafCalls).toBe(0);
  });

  test("no-ops when previous is not attached to the document at call time", () => {
    installFakeDocument(false);
    let rafCalls = 0;
    (globalThis as Record<string, unknown>).requestAnimationFrame = () => {
      rafCalls++;
      return 0;
    };
    restoreFocusFallback(makeFocusable());
    expect(rafCalls).toBe(0);
  });

  test("skips focus() when previous is already the active element after both frames", () => {
    const { doc } = installFakeDocument(true);
    const raf = installFakeRaf();
    const previous = makeFocusable();
    doc.activeElement = previous;
    restoreFocusFallback(previous);
    raf.flush();
    expect(previous.focusCalls).toHaveLength(0);
  });

  test("skips focus() when something else already holds focus (a consumer's own focus management wins)", () => {
    const { doc } = installFakeDocument(true);
    const raf = installFakeRaf();
    const previous = makeFocusable();
    doc.activeElement = { unrelated: true };
    restoreFocusFallback(previous);
    raf.flush();
    expect(previous.focusCalls).toHaveLength(0);
  });

  test("re-checks attachment inside the rAF — previous detaching before the frames run is skipped", () => {
    const { doc, setAttached } = installFakeDocument(true);
    const raf = installFakeRaf();
    const previous = makeFocusable();
    doc.activeElement = doc.body;
    restoreFocusFallback(previous);
    setAttached(false);
    raf.flush();
    expect(previous.focusCalls).toHaveLength(0);
  });

  test("restores focus with preventScroll when focus is stuck on <body>", () => {
    const { doc } = installFakeDocument(true);
    const raf = installFakeRaf();
    const previous = makeFocusable();
    doc.activeElement = doc.body;
    restoreFocusFallback(previous);
    raf.flush();
    expect(previous.focusCalls).toEqual([{ preventScroll: true }]);
  });

  test("restores focus when focus is stuck on <html> (documentElement)", () => {
    const { doc } = installFakeDocument(true);
    const raf = installFakeRaf();
    const previous = makeFocusable();
    doc.activeElement = doc.documentElement;
    restoreFocusFallback(previous);
    raf.flush();
    expect(previous.focusCalls).toEqual([{ preventScroll: true }]);
  });

  test("restores focus when activeElement is null (nowhere)", () => {
    const { doc } = installFakeDocument(true);
    const raf = installFakeRaf();
    const previous = makeFocusable();
    doc.activeElement = null;
    restoreFocusFallback(previous);
    raf.flush();
    expect(previous.focusCalls).toEqual([{ preventScroll: true }]);
  });
});

class FakeStyle {
  transform = "";
  transition = "";
  transformOrigin = "";
  borderRadius = "";
  private custom = new Map<string, string>();
  removedProps: string[] = [];
  setProperty(name: string, value: string) {
    this.custom.set(name, value);
  }
  removeProperty(name: string) {
    this.custom.delete(name);
    this.removedProps.push(name);
  }
  getCustom(name: string): string | undefined {
    return this.custom.get(name);
  }
}

function makePanel(): HTMLElement & { style: FakeStyle } {
  return { style: new FakeStyle() } as unknown as HTMLElement & { style: FakeStyle };
}

describe("clearRecede", () => {
  test("no-ops (does not throw) for a null panel", () => {
    expect(() => clearRecede(null)).not.toThrow();
  });

  test("resets every direct style write and removes both custom properties", () => {
    const panel = makePanel();
    panel.style.transform = "scale(0.9)";
    panel.style.transition = "transform 1s";
    panel.style.transformOrigin = "50% 0%";
    panel.style.setProperty("--scrollsheet-recede-dim", "0.1");
    panel.style.setProperty("--scrollsheet-stack-progress", "0.7");

    clearRecede(panel);

    expect(panel.style.transform).toBe("");
    expect(panel.style.transition).toBe("");
    expect(panel.style.transformOrigin).toBe("");
    expect(panel.style.removedProps).toEqual([
      "--scrollsheet-recede-dim",
      "--scrollsheet-stack-progress",
    ]);
  });
});

describe("applyRecede", () => {
  // Mirror the private constants in content-helpers.ts (1 -> 0.94 scale, 0.14 max dim).
  const RECEDE_SCALE_DELTA = 0.06;
  const RECEDE_DIM_MAX = 0.14;

  test("no-ops (does not throw) for a null panel", () => {
    expect(() => applyRecede(null, "bottom", 0.5, false)).not.toThrow();
  });

  test("clamps progress below 0 up to 0", () => {
    const panel = makePanel();
    applyRecede(panel, "bottom", -3, false);
    expect(panel.style.transform).toBe(recedeTransform(geometryFor("bottom"), 0, 1));
    expect(panel.style.getCustom("--scrollsheet-stack-progress")).toBe("0");
  });

  test("clamps progress above 1 down to 1", () => {
    const panel = makePanel();
    applyRecede(panel, "bottom", 3, false);
    expect(panel.style.transform).toBe(
      recedeTransform(geometryFor("bottom"), 1, 1 - RECEDE_SCALE_DELTA),
    );
    expect(panel.style.getCustom("--scrollsheet-stack-progress")).toBe("1");
  });

  test("live=true disables the transition; live=false uses the transform+ease transition", () => {
    const live = makePanel();
    applyRecede(live, "bottom", 0.5, true);
    expect(live.style.transition).toBe("none");

    const eased = makePanel();
    applyRecede(eased, "bottom", 0.5, false);
    expect(eased.style.transition).toBe("transform var(--scrollsheet-dur) var(--scrollsheet-ease)");
  });

  test("writes the side's own recede transform, origin, dim, and stack-progress custom properties", () => {
    const panel = makePanel();
    applyRecede(panel, "left", 0.5, false);
    const g = geometryFor("left");
    expect(panel.style.transform).toBe(recedeTransform(g, 0.5, 1 - 0.5 * RECEDE_SCALE_DELTA));
    expect(panel.style.transformOrigin).toBe(g.recedeOrigin);
    expect(panel.style.getCustom("--scrollsheet-recede-dim")).toBe(String(0.5 * RECEDE_DIM_MAX));
    expect(panel.style.getCustom("--scrollsheet-stack-progress")).toBe("0.5");
  });
});

describe("applyBackgroundEffect", () => {
  // Mirror the private constants in content-helpers.ts.
  const BACKGROUND_SCALE_DELTA = 0.06;
  const BACKGROUND_RADIUS_MAX_PX = 12;
  const BACKGROUND_PARALLAX_PX = 24;

  test("'scale' at full progress applies max scale-down, full radius, and a safe-area-aware translateY", () => {
    const el = makePanel();
    applyBackgroundEffect(el, "scale", 1, false);
    expect(el.style.transformOrigin).toBe("50% 0%");
    expect(el.style.borderRadius).toBe(`${BACKGROUND_RADIUS_MAX_PX}px`);
    expect(el.style.transform).toBe(
      `translate3d(0, calc(env(safe-area-inset-top, 0px) * 1), 0) scale(${1 - BACKGROUND_SCALE_DELTA})`,
    );
  });

  test("'scale' at progress 0 is a no-op transform (scale 1, radius 0)", () => {
    const el = makePanel();
    applyBackgroundEffect(el, "scale", 0, false);
    expect(el.style.borderRadius).toBe("0px");
    expect(el.style.transform).toBe(
      "translate3d(0, calc(env(safe-area-inset-top, 0px) * 0), 0) scale(1)",
    );
  });

  test("'scale' rounds the radius to the nearest px at a fractional progress", () => {
    const el = makePanel();
    applyBackgroundEffect(el, "scale", 0.5, false);
    expect(el.style.borderRadius).toBe(`${Math.round(0.5 * BACKGROUND_RADIUS_MAX_PX)}px`);
  });

  test("'parallax' translates Y only, and never touches transformOrigin/borderRadius", () => {
    const el = makePanel();
    applyBackgroundEffect(el, "parallax", 1, false);
    expect(el.style.transform).toBe(`translate3d(0, ${-BACKGROUND_PARALLAX_PX}px, 0)`);
    expect(el.style.transformOrigin).toBe("");
    expect(el.style.borderRadius).toBe("");
  });

  test("'parallax' at progress 0 is a zero translate", () => {
    const el = makePanel();
    applyBackgroundEffect(el, "parallax", 0, false);
    expect(el.style.transform).toBe("translate3d(0, 0px, 0)");
  });

  test("clamps out-of-range progress the same way for both effects", () => {
    const over = makePanel();
    applyBackgroundEffect(over, "parallax", 5, false);
    expect(over.style.transform).toBe(`translate3d(0, ${-BACKGROUND_PARALLAX_PX}px, 0)`);

    const under = makePanel();
    applyBackgroundEffect(under, "parallax", -5, false);
    expect(under.style.transform).toBe("translate3d(0, 0px, 0)");
  });

  test("live=true disables the transition; live=false uses the transform+border-radius transition", () => {
    const live = makePanel();
    applyBackgroundEffect(live, "scale", 0.5, true);
    expect(live.style.transition).toBe("none");

    const eased = makePanel();
    applyBackgroundEffect(eased, "scale", 0.5, false);
    expect(eased.style.transition).toBe(
      "transform var(--scrollsheet-dur) var(--scrollsheet-ease), border-radius var(--scrollsheet-dur) var(--scrollsheet-ease)",
    );
  });
});

describe("applyFullHeightRadius", () => {
  test("bottom rounds only the top two corners (its lead edge)", () => {
    const panel = makePanel();
    applyFullHeightRadius(panel, "bottom", 8);
    expect(panel.style.borderRadius).toBe("8px 8px 0 0");
  });

  test("top rounds only the bottom two corners (its lead edge)", () => {
    const panel = makePanel();
    applyFullHeightRadius(panel, "top", 8);
    expect(panel.style.borderRadius).toBe("0 0 8px 8px");
  });

  test("left rounds only the right two corners (its free edge)", () => {
    const panel = makePanel();
    applyFullHeightRadius(panel, "left", 8);
    expect(panel.style.borderRadius).toBe("0 8px 8px 0");
  });

  test("right rounds only the left two corners (its free edge)", () => {
    const panel = makePanel();
    applyFullHeightRadius(panel, "right", 8);
    expect(panel.style.borderRadius).toBe("8px 0 0 8px");
  });

  test("clamps a negative radius to 0, never emitting a negative border-radius", () => {
    const panel = makePanel();
    applyFullHeightRadius(panel, "bottom", -12);
    expect(panel.style.borderRadius).toBe("0px 0px 0 0");
  });

  test("does not round a fractional radius (unlike applyBackgroundEffect's rounded radius)", () => {
    const panel = makePanel();
    applyFullHeightRadius(panel, "bottom", 12.5);
    expect(panel.style.borderRadius).toBe("12.5px 12.5px 0 0");
  });
});

function makeBody(offsetHeight: number, firstChildOffsetHeight?: number) {
  return {
    offsetHeight,
    offsetWidth: offsetHeight,
    firstElementChild:
      firstChildOffsetHeight === undefined
        ? null
        : { offsetHeight: firstChildOffsetHeight, offsetWidth: firstChildOffsetHeight },
  } as unknown as HTMLElement;
}

/**
 * A fill-mode body: stretched to the panel until the measurement's
 * neutralizing style write lands, natural-sized while it holds. The getters
 * model the real layout dependency so the neutralize-measure-restore order
 * is what the assertions actually exercise.
 */
function makeFillBody(
  stretched: number,
  natural: number,
  prevInline: { flex?: string; alignSelf?: string } = {},
) {
  const style = { flex: prevInline.flex ?? "", alignSelf: prevInline.alignSelf ?? "" };
  return {
    style,
    get offsetHeight() {
      return style.flex === "0 0 auto" ? natural : stretched;
    },
    get offsetWidth() {
      return style.alignSelf === "flex-start" ? natural : stretched;
    },
  } as unknown as HTMLElement;
}

function makePanelStyle(overrides: Partial<CSSStyleDeclaration> = {}): CSSStyleDeclaration {
  return {
    boxSizing: "content-box",
    paddingTop: "0px",
    paddingBottom: "0px",
    paddingLeft: "0px",
    paddingRight: "0px",
    borderTopWidth: "0px",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
    borderRightWidth: "0px",
    ...overrides,
  } as unknown as CSSStyleDeclaration;
}

describe("measureContentHeight", () => {
  test("fill=false always reads the body's own offset size, even with children", () => {
    const body = makeBody(100, 40);
    expect(measureContentHeight(body, "offsetHeight", false, makePanelStyle(), "y")).toBe(100);
  });

  test("fill=true neutralizes the main-axis stretch and measures the body's natural size", () => {
    const body = makeFillBody(300, 120);
    expect(measureContentHeight(body, "offsetHeight", true, makePanelStyle(), "y")).toBe(120);
    expect(body.style.flex).toBe("");
  });

  test("fill=true restores a consumer's own inline flex value after measuring", () => {
    const body = makeFillBody(300, 120, { flex: "2 0 auto" });
    expect(measureContentHeight(body, "offsetHeight", true, makePanelStyle(), "y")).toBe(120);
    expect(body.style.flex).toBe("2 0 auto");
  });

  test("x axis (left/right sides): neutralizes the cross-axis stretch via align-self, then restores it", () => {
    const body = makeFillBody(300, 40);
    expect(measureContentHeight(body, "offsetWidth", true, makePanelStyle(), "x")).toBe(40);
    expect(body.style.alignSelf).toBe("");
  });

  test("zero padding/border leaves the measured size unchanged even under border-box", () => {
    const body = makeBody(171);
    const panelStyle = makePanelStyle({ boxSizing: "border-box" });
    expect(measureContentHeight(body, "offsetHeight", false, panelStyle, "y")).toBe(171);
  });

  test("content-box panel: padding/border are excluded from `height` already, so they're never added", () => {
    const body = makeBody(171);
    const panelStyle = makePanelStyle({
      boxSizing: "content-box",
      paddingTop: "8px",
      paddingBottom: "34px",
      borderTopWidth: "1px",
    });
    expect(measureContentHeight(body, "offsetHeight", false, panelStyle, "y")).toBe(171);
  });

  test("border-box panel on the y axis: adds padding-top/-bottom and border-top/-bottom, ignores x-axis padding", () => {
    const body = makeBody(171);
    const panelStyle = makePanelStyle({
      boxSizing: "border-box",
      paddingTop: "8px",
      paddingBottom: "34px",
      borderTopWidth: "1px",
      borderBottomWidth: "2px",
      paddingLeft: "100px",
      paddingRight: "100px",
    });
    // 171 (body) + 8 + 34 (padding) + 1 + 2 (border) = 216 — x-axis padding
    // must not leak into the y-axis measurement (or vice versa: a left/right
    // sheet with safe-area padding on both axes would double-count).
    expect(measureContentHeight(body, "offsetHeight", false, panelStyle, "y")).toBe(216);
  });

  test("border-box panel on the x axis: adds padding-left/-right and border-left/-right, ignores y-axis padding", () => {
    const body = makeBody(171);
    const panelStyle = makePanelStyle({
      boxSizing: "border-box",
      paddingLeft: "8px",
      paddingRight: "34px",
      borderLeftWidth: "1px",
      borderRightWidth: "2px",
      paddingTop: "100px",
      paddingBottom: "100px",
    });
    expect(measureContentHeight(body, "offsetWidth", false, panelStyle, "x")).toBe(216);
  });

  test("border-box + fill=true: padding/border are added on top of the natural measurement", () => {
    const body = makeFillBody(300, 40);
    const panelStyle = makePanelStyle({ boxSizing: "border-box", paddingTop: "8px" });
    expect(measureContentHeight(body, "offsetHeight", true, panelStyle, "y")).toBe(48);
  });
});
