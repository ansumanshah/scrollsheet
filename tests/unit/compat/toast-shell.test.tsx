import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import type * as ReactDOMClient from "react-dom/client";
import { _resetWarnOnceForTests } from "../../../packages/scrollsheet/src/internal/dev-warn";
import { _resetSonnerStoreForTests, toast } from "../../../packages/scrollsheet/src/toast/state";
import { ToasterShell } from "../../../packages/scrollsheet/src/toast/shell/toaster-shell";

/**
 * DOM-level smoke test for the new sonner-architecture shell — not exported
 * from the package yet (see toaster-shell.tsx's own doc comment), so it's
 * imported straight from its own file path, same as every other new-shell
 * unit test in this batch. Same happy-dom + react-dom/client + React.act
 * mount pattern as sonner-drop-in-parity.test.tsx; no <dialog> mock needed
 * here — the shell never touches Sheet.Root/Content, it portals a bare
 * <section>/<ol> straight to document.body.
 */

let Root: ReactDOMClient.Root;
let container: HTMLElement;

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  cb: () => void;
  target: Element | null = null;
  constructor(cb: () => void) {
    this.cb = cb;
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.target = el;
  }
  disconnect() {
    this.target = null;
  }
  fire() {
    this.cb();
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

afterEach(async () => {
  if (Root) await React.act(async () => Root.unmount());
  container?.remove();
  _resetSonnerStoreForTests();
  _resetWarnOnceForTests();
  FakeResizeObserver.instances = [];
});

async function mount(element: React.ReactElement) {
  (globalThis as unknown as { ResizeObserver: typeof FakeResizeObserver }).ResizeObserver =
    FakeResizeObserver;
  const { createRoot } = await import("react-dom/client");
  container = document.createElement("div");
  document.body.appendChild(container);
  Root = createRoot(container);
  await React.act(async () => {
    Root.render(element);
  });
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".scrollsheet-toast")];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Always act()-wrapped: pointerdown/pointerup bubble past the row into the
// owning <ol>'s own delegated onPointerDown/onPointerUp (toaster-shell.tsx's
// PositionGroup), which is a REAL setInteracting() state update on every
// dispatch — not just on the ones that end up dismissing something.
async function firePointer(el: Element, type: string, x: number, y: number) {
  await React.act(async () => {
    el.dispatchEvent(
      new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }),
    );
  });
}

function mockReducedMotion(): () => void {
  const previous = (globalThis as unknown as { matchMedia?: typeof window.matchMedia }).matchMedia;
  (globalThis as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = ((
    query: string,
  ) =>
    ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
  return () => {
    if (previous) {
      (globalThis as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = previous;
    } else {
      delete (globalThis as Record<string, unknown>).matchMedia;
    }
  };
}

describe("SSR safety", () => {
  test("renderToString never throws and renders nothing (client-only mount gate)", () => {
    expect(() => renderToString(<ToasterShell />)).not.toThrow();
    expect(renderToString(<ToasterShell />)).toBe("");
  });
});

describe("portal shape", () => {
  test("mounts a <section data-react-aria-top-layer> even with zero toasts, and no <ol> until a toast exists", async () => {
    await mount(<ToasterShell />);
    const section = document.querySelector("[data-react-aria-top-layer]");
    expect(section?.tagName).toBe("SECTION");
    expect(document.querySelector("[data-scrollsheet-toaster]")).toBeNull();
    expect(document.querySelector("[data-sonner-toaster]")).toBeNull();
  });

  test("a toast renders inside a per-position <ol data-scrollsheet-toaster data-y-position data-x-position>, with data-sonner-toaster alongside it for compat", async () => {
    await mount(<ToasterShell />);
    await React.act(async () => {
      toast("Hello", { duration: 60_000 });
    });
    const ol = document.querySelector("[data-scrollsheet-toaster]");
    expect(ol?.tagName).toBe("OL");
    expect(ol?.getAttribute("data-y-position")).toBe("bottom");
    expect(ol?.getAttribute("data-x-position")).toBe("right");
    expect(ol?.hasAttribute("data-sonner-toaster")).toBe(true);
    expect(rows()).toHaveLength(1);
    expect(document.body.textContent).toContain("Hello");
  });

  test("each row carries both the neutral (primary) and real-Sonner-style class/attribute names", async () => {
    await mount(<ToasterShell />);
    await React.act(async () => {
      toast("Only one", { duration: 60_000 });
    });
    const el = rows()[0];
    expect(el).toBeDefined();
    expect(el?.getAttribute("data-front")).toBe("true");
    expect(el?.getAttribute("data-visible")).toBe("true");
    expect(el?.getAttribute("data-index")).toBe("0");
    expect(el?.getAttribute("data-y-position")).toBe("bottom");
    expect(el?.getAttribute("data-x-position")).toBe("right");
    // Dual naming (his directive): fresh users style .scrollsheet-toast /
    // [data-scrollsheet-toast] and never need to know "sonner" exists; a
    // migrant's existing .sonner-toast / [data-sonner-toast] CSS keeps
    // matching because the compat name is stamped on the same element too.
    expect(el?.classList.contains("scrollsheet-toast")).toBe(true);
    expect(el?.classList.contains("sonner-toast")).toBe(true);
    expect(el?.hasAttribute("data-scrollsheet-toast")).toBe(true);
    expect(el?.hasAttribute("data-sonner-toast")).toBe(true);
  });
});

describe("6-position matrix", () => {
  test("a per-toast position override gets its own <ol>, alongside the Toaster's own default position", async () => {
    await mount(<ToasterShell position="bottom-right" />);
    await React.act(async () => {
      toast("default corner", { duration: 60_000 });
      toast("top-left corner", { position: "top-left", duration: 60_000 });
    });
    const lists = [...document.querySelectorAll<HTMLElement>("[data-scrollsheet-toaster]")];
    expect(lists).toHaveLength(2);
    const positions = lists.map((el) => [
      el.getAttribute("data-y-position"),
      el.getAttribute("data-x-position"),
    ]);
    expect(positions).toContainEqual(["bottom", "right"]);
    expect(positions).toContainEqual(["top", "left"]);
  });
});

describe("hide-not-evicted rendering", () => {
  test("every live toast is a real, persistent row — none are evicted past visibleToasts", async () => {
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      for (let i = 0; i < 5; i += 1) toast(`toast ${i}`, { duration: 60_000 });
    });
    expect(rows()).toHaveLength(5);
    const visible = rows().filter((el) => el.getAttribute("data-visible") === "true");
    const hidden = rows().filter((el) => el.getAttribute("data-visible") === "false");
    expect(visible).toHaveLength(3);
    expect(hidden).toHaveLength(2);
  });

  test("a hidden toast's timer keeps running (not withheld until it becomes visible)", async () => {
    let autoClosed = 0;
    await mount(<ToasterShell visibleToasts={1} />);
    // "hidden" is created FIRST (older, pushed out of the visibleToasts=1
    // window by "front" arriving after it — store order is oldest-first).
    await React.act(async () => {
      toast("hidden", {
        duration: 40,
        onAutoClose: () => {
          autoClosed += 1;
        },
      });
      toast("front", { duration: 60_000 });
    });
    expect(
      rows()
        .find((el) => el.textContent?.includes("hidden"))
        ?.getAttribute("data-visible"),
    ).toBe("false");
    await React.act(async () => {
      await sleep(90);
    });
    expect(autoClosed).toBe(1);
  });
});

describe("front-promote without remount", () => {
  test("dismissing the front toast promotes the next one onto the SAME already-mounted DOM node", async () => {
    await mount(<ToasterShell visibleToasts={3} />);
    let secondId: number | string = 0;
    await React.act(async () => {
      toast("first", { duration: 60_000 });
      secondId = toast("second", { duration: 60_000 });
    });
    // "second" was created last, so it's newest/front — dismissing IT
    // promotes "first" onto its own already-mounted node instead.
    const soonToBeFront = rows().find((el) => el.textContent?.includes("first"));
    expect(soonToBeFront).toBeDefined();
    // Stamp the live DOM node directly (bypassing React) — this survives a
    // prop update but is wiped by a remount, so it's a clean identity check.
    (soonToBeFront as HTMLElement).dataset.identityMarker = "same-node";

    await React.act(async () => {
      toast.dismiss(secondId);
    });

    const nowFront = rows().find((el) => el.getAttribute("data-front") === "true");
    expect(nowFront?.dataset.identityMarker).toBe("same-node");
    expect(nowFront?.textContent).toContain("first");
  });

  test("promoting a HIDDEN row into the visible window reuses its own DOM node too", async () => {
    await mount(<ToasterShell visibleToasts={1} />);
    let frontId: number | string = 0;
    // "waiting" created first (older, hidden once "front" arrives after it).
    await React.act(async () => {
      toast("waiting", { duration: 60_000 });
      frontId = toast("front", { duration: 60_000 });
    });
    const waitingRow = rows().find((el) => el.textContent?.includes("waiting"));
    expect(waitingRow?.getAttribute("data-visible")).toBe("false");
    (waitingRow as HTMLElement).dataset.identityMarker = "promoted-node";

    await React.act(async () => {
      toast.dismiss(frontId);
    });

    const promoted = rows().find((el) => el.textContent?.includes("waiting"));
    expect(promoted?.dataset.identityMarker).toBe("promoted-node");
    expect(promoted?.getAttribute("data-visible")).toBe("true");
    expect(promoted?.getAttribute("data-front")).toBe("true");
  });
});

describe("expand/collapse", () => {
  test("hovering the <ol> sets data-expanded=true on every row; leaving collapses it back", async () => {
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast("a", { duration: 60_000 });
      toast("b", { duration: 60_000 });
    });
    expect(rows().every((el) => el.getAttribute("data-expanded") === "false")).toBe(true);

    // React's synthetic onMouseEnter/onMouseLeave are derived from the real,
    // BUBBLING mouseover/mouseout events (native mouseenter/mouseleave don't
    // bubble, so React's delegated root listener never sees them directly).
    const ol = document.querySelector("[data-scrollsheet-toaster]") as HTMLElement;
    await React.act(async () => {
      ol.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(rows().every((el) => el.getAttribute("data-expanded") === "true")).toBe(true);

    await React.act(async () => {
      ol.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(rows().every((el) => el.getAttribute("data-expanded") === "false")).toBe(true);
  });

  test("hovering ONE position's stack expands every position (Toaster-wide expanded)", async () => {
    await mount(<ToasterShell position="bottom-right" />);
    await React.act(async () => {
      toast("default corner", { duration: 60_000 });
      toast("other corner", { position: "top-left", duration: 60_000 });
    });
    const lists = [...document.querySelectorAll<HTMLElement>("[data-scrollsheet-toaster]")];
    const bottomRight = lists.find((el) => el.getAttribute("data-x-position") === "right");
    await React.act(async () => {
      bottomRight?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(rows().every((el) => el.getAttribute("data-expanded") === "true")).toBe(true);
  });
});

describe("hotkey + focus-scoped Escape", () => {
  test("the default hotkey (Alt+T) expands the stack and moves focus into it", async () => {
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast("First", { duration: 60_000 });
    });
    expect(rows()[0]?.getAttribute("data-expanded")).toBe("false");
    await React.act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { altKey: true, code: "KeyT", bubbles: true }),
      );
    });
    expect(rows()[0]?.getAttribute("data-expanded")).toBe("true");
    expect(document.activeElement?.getAttribute("data-scrollsheet-toaster")).toBe("");
  });

  test("Escape while hotkey-expanded collapses back instead of dismissing", async () => {
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast("First", { duration: 60_000 });
    });
    await React.act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { altKey: true, code: "KeyT", bubbles: true }),
      );
    });
    await React.act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
    });
    expect(rows()[0]?.getAttribute("data-expanded")).toBe("false");
    expect(document.body.textContent).toContain("First");
  });

  test("focus-scoped Escape (not hotkey-driven) dismisses the front toast instead", async () => {
    await mount(<ToasterShell visibleToasts={3} closeButton />);
    await React.act(async () => {
      toast("Dismiss me", { duration: 60_000 });
    });
    const closeBtn = document.querySelector<HTMLElement>(".scrollsheet-toast-close");
    await React.act(async () => {
      closeBtn?.focus();
    });
    await React.act(async () => {
      closeBtn?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
    });
    // Dropped from the live store immediately, but the row itself stays
    // mounted for its own exit-hold (use-toast-exit.ts, EXIT_MS) — tagged
    // data-removed, not gone from the DOM outright.
    expect(rows()[0]?.hasAttribute("data-removed")).toBe(true);
    await React.act(async () => {
      await sleep(260);
    });
    expect(document.body.textContent).not.toContain("Dismiss me");
  });
});

describe("dismissal paths reuse the mechanical tier unchanged", () => {
  test("close button dismisses and fires onDismiss (not onAutoClose)", async () => {
    let dismissed = 0;
    let autoClosed = 0;
    await mount(<ToasterShell visibleToasts={3} closeButton />);
    await React.act(async () => {
      toast("Closable", {
        duration: 60_000,
        onDismiss: () => {
          dismissed += 1;
        },
        onAutoClose: () => {
          autoClosed += 1;
        },
      });
    });
    const closeBtn = document.querySelector<HTMLElement>(".scrollsheet-toast-close");
    await React.act(async () => {
      closeBtn?.click();
    });
    expect(dismissed).toBe(1);
    expect(autoClosed).toBe(0);
    expect(rows()[0]?.hasAttribute("data-removed")).toBe(true);
    await React.act(async () => {
      await sleep(260);
    });
    expect(document.body.textContent).not.toContain("Closable");
  });

  test("expire() (timer) fires onAutoClose, not onDismiss", async () => {
    let dismissed = 0;
    let autoClosed = 0;
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast("Expiring", {
        duration: 30,
        onDismiss: () => {
          dismissed += 1;
        },
        onAutoClose: () => {
          autoClosed += 1;
        },
      });
    });
    await React.act(async () => {
      await sleep(80);
    });
    expect(autoClosed).toBe(1);
    expect(dismissed).toBe(0);
  });

  test("action click dismisses unless the consumer preventDefault()s", async () => {
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast("With action", { action: { label: "Undo", onClick: () => {} }, duration: 60_000 });
    });
    const actionBtn = document.querySelector<HTMLElement>(".scrollsheet-toast-action");
    await React.act(async () => {
      actionBtn?.click();
    });
    expect(rows()[0]?.hasAttribute("data-removed")).toBe(true);
    await React.act(async () => {
      await sleep(260);
    });
    expect(document.body.textContent).not.toContain("With action");
  });
});

describe("per-row ResizeObserver", () => {
  test("every row gets its own ResizeObserver, and a fired resize on the FRONT row updates --scrollsheet-toast-front-height on siblings", async () => {
    await mount(<ToasterShell visibleToasts={3} />);
    // "front" created last — newest, so it's the real front/index-0 row;
    // --scrollsheet-toast-front-height is sourced from IT, not from "older".
    await React.act(async () => {
      toast("older", { duration: 60_000 });
      toast("front", { duration: 60_000 });
    });
    expect(FakeResizeObserver.instances.length).toBeGreaterThanOrEqual(2);

    const frontEl = rows().find((el) => el.textContent?.includes("front")) as HTMLElement;
    Object.defineProperty(frontEl, "getBoundingClientRect", {
      value: () => ({ height: 123 }) as DOMRect,
      configurable: true,
    });
    const frontObserver = FakeResizeObserver.instances.find((o) => o.target === frontEl);
    expect(frontObserver).toBeDefined();
    await React.act(async () => {
      frontObserver?.fire();
    });

    const olderEl = rows().find((el) => el.textContent?.includes("older")) as HTMLElement;
    expect(olderEl.style.getPropertyValue("--scrollsheet-toast-front-height")).toBe("123px");
  });
});

describe("swipe: direction lock", () => {
  test("once locked to x, further y movement on the same gesture is ignored", async () => {
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast("Swipe me", { duration: 60_000 });
    });
    const el = rows()[0] as HTMLElement;
    await firePointer(el, "pointerdown", 0, 0);
    // |dx|=10 > |dy|=2 — locks to x.
    await firePointer(el, "pointermove", 10, 2);
    expect(el.style.getPropertyValue("--scrollsheet-toast-swipe-y")).toBe("0px");
    // Same x delta, a much larger y delta — axis stays locked to x.
    await firePointer(el, "pointermove", 10, 50);
    expect(el.style.getPropertyValue("--scrollsheet-toast-swipe-y")).toBe("0px");
    expect(el.style.getPropertyValue("--scrollsheet-toast-swipe-x")).toBe("10px");
    await firePointer(el, "pointerup", 10, 50);
  });
});

describe("swipe: dampening against a disallowed direction", () => {
  test("bottom-right's default (['bottom','right']) dampens a leftward drag instead of blocking it", async () => {
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast("Swipe me", { duration: 60_000 });
    });
    const el = rows()[0] as HTMLElement;
    await firePointer(el, "pointerdown", 0, 0);
    await firePointer(el, "pointermove", -100, 0);
    const raw = Number.parseFloat(el.style.getPropertyValue("--scrollsheet-toast-swipe-x"));
    expect(raw).toBeLessThan(0);
    expect(Math.abs(raw)).toBeLessThan(100); // dampened, not the raw -100
    expect(Math.abs(raw)).toBeGreaterThan(0); // not fully blocked either
    await firePointer(el, "pointerup", -100, 0);
  });

  test("bottom-center's default (['bottom']) blocks horizontal movement outright — the x axis has no allowed direction at all", async () => {
    await mount(<ToasterShell />);
    await React.act(async () => {
      toast("Center toast", { position: "bottom-center", duration: 60_000 });
    });
    const el = rows()[0] as HTMLElement;
    await firePointer(el, "pointerdown", 0, 0);
    await firePointer(el, "pointermove", 100, 3);
    expect(el.style.getPropertyValue("--scrollsheet-toast-swipe-x")).toBe("0px");
    await firePointer(el, "pointerup", 100, 3);
  });
});

describe("swipe: dismiss triggers", () => {
  test("past the distance threshold in an allowed direction: data-swipe-out/-direction are set, and onDismiss fires once the exit animation ends", async () => {
    let dismissed = 0;
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast("Swipe me", {
        duration: 60_000,
        onDismiss: () => {
          dismissed += 1;
        },
      });
    });
    const el = rows()[0] as HTMLElement;
    await firePointer(el, "pointerdown", 0, 0);
    await firePointer(el, "pointermove", 60, 0); // > SWIPE_DISMISS_THRESHOLD_PX, 'right' is allowed
    await firePointer(el, "pointerup", 60, 0);
    expect(el.getAttribute("data-swipe-out")).toBe("true");
    expect(el.getAttribute("data-swipe-direction")).toBe("right");
    // Not dismissed yet — happy-dom never actually runs the CSS animation,
    // so the hook's own onDismiss only fires once a (real or, here,
    // manually-simulated) animationend reaches its listener.
    expect(dismissed).toBe(0);
    await React.act(async () => {
      el.dispatchEvent(new Event("animationend"));
    });
    expect(dismissed).toBe(1);
  });

  test("a small, fast swipe dismisses via the velocity trigger despite staying under the distance threshold", async () => {
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast("Flick me", { duration: 60_000 });
    });
    const el = rows()[0] as HTMLElement;
    await firePointer(el, "pointerdown", 0, 0);
    // 20px is well under the 45px threshold — dispatched back-to-back with
    // no elapsed time, this is a very high px/ms velocity.
    await firePointer(el, "pointermove", 20, 0);
    await firePointer(el, "pointerup", 20, 0);
    expect(el.getAttribute("data-swipe-out")).toBe("true");
  });

  test("under BOTH triggers (small movement, given time to elapse): snaps back, no dismiss", async () => {
    let dismissed = 0;
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast("Snap back", {
        duration: 60_000,
        onDismiss: () => {
          dismissed += 1;
        },
      });
    });
    const el = rows()[0] as HTMLElement;
    await firePointer(el, "pointerdown", 0, 0);
    await firePointer(el, "pointermove", 5, 0);
    // 5px / ~300ms ≈ 0.017px/ms — well under SWIPE_VELOCITY_THRESHOLD, and
    // 5px is well under SWIPE_DISMISS_THRESHOLD_PX too.
    await sleep(300);
    await firePointer(el, "pointerup", 5, 0);
    expect(el.getAttribute("data-swipe-out")).not.toBe("true");
    expect(el.getAttribute("data-swiping")).toBe("false");
    expect(el.style.getPropertyValue("--scrollsheet-toast-swipe-x")).toBe("0px");
    expect(dismissed).toBe(0);
  });

  test("a disallowed direction never dismisses, no matter how far or fast — the direction gate wins over both triggers", async () => {
    let dismissed = 0;
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast("Try to swipe up", {
        duration: 60_000,
        onDismiss: () => {
          dismissed += 1;
        },
      });
    });
    const el = rows()[0] as HTMLElement;
    await firePointer(el, "pointerdown", 0, 0);
    // bottom-right's default is ['bottom','right'] — 'top' isn't allowed.
    // Large + fast (no elapsed time), so both triggers would otherwise fire.
    await firePointer(el, "pointermove", 0, -100);
    await firePointer(el, "pointerup", 0, -100);
    expect(el.getAttribute("data-swipe-out")).not.toBe("true");
    expect(dismissed).toBe(0);
  });

  test("under prefers-reduced-motion, a triggered dismiss fires immediately — no animationend wait", async () => {
    const restore = mockReducedMotion();
    try {
      let dismissed = 0;
      await mount(<ToasterShell visibleToasts={3} />);
      await React.act(async () => {
        toast("Reduced motion", {
          duration: 60_000,
          onDismiss: () => {
            dismissed += 1;
          },
        });
      });
      const el = rows()[0] as HTMLElement;
      await firePointer(el, "pointerdown", 0, 0);
      await firePointer(el, "pointermove", 60, 0);
      await firePointer(el, "pointerup", 60, 0);
      // The dismiss-triggered store update lands synchronously inside this
      // pointerup dispatch, but the heights bookkeeping it cascades into
      // (use-toast-heights.ts's own `forget()`, watched by an effect) settles
      // one macrotask later — an extra empty act() flush catches it so the
      // assertion below isn't racing a still-pending update.
      await React.act(async () => {
        await sleep(0);
      });
      expect(dismissed).toBe(1);
    } finally {
      restore();
    }
  });
});

describe("swipe: Toaster-level swipeDirections override", () => {
  test("overrides the per-position default uniformly — a direction the default excluded now dismisses, and one it included no longer does", async () => {
    await mount(<ToasterShell visibleToasts={3} swipeDirections={["left"]} />);
    await React.act(async () => {
      toast("Overridden", { duration: 60_000 });
    });
    const el = rows()[0] as HTMLElement;

    // bottom-right's own default allows 'right' — the override replaces
    // that entirely, so a rightward swipe no longer dismisses.
    await firePointer(el, "pointerdown", 0, 0);
    await firePointer(el, "pointermove", 60, 0);
    await firePointer(el, "pointerup", 60, 0);
    expect(el.getAttribute("data-swipe-out")).not.toBe("true");

    // 'left' wasn't in the default at all — the override makes it allowed.
    await firePointer(el, "pointerdown", 0, 0);
    await firePointer(el, "pointermove", -60, 0);
    await firePointer(el, "pointerup", -60, 0);
    expect(el.getAttribute("data-swipe-out")).toBe("true");
    expect(el.getAttribute("data-swipe-direction")).toBe("left");
  });
});

describe("swipe: per-position default includes the vertical edge for a corner position", () => {
  test("top-left allows an upward swipe (its own y half), matching the port design's table", async () => {
    await mount(<ToasterShell />);
    await React.act(async () => {
      toast("Corner toast", { position: "top-left", duration: 60_000 });
    });
    const el = rows()[0] as HTMLElement;
    await firePointer(el, "pointerdown", 0, 0);
    await firePointer(el, "pointermove", 0, -60);
    await firePointer(el, "pointerup", 0, -60);
    expect(el.getAttribute("data-swipe-out")).toBe("true");
    expect(el.getAttribute("data-swipe-direction")).toBe("up");
  });
});

describe("swipe: gesture immunity", () => {
  test("a loading toast never arms the swipe gesture", async () => {
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast.loading("Uploading…", { duration: 60_000 });
    });
    const el = rows()[0] as HTMLElement;
    await firePointer(el, "pointerdown", 0, 0);
    await firePointer(el, "pointermove", 60, 0);
    expect(el.getAttribute("data-swiping")).toBe("false");
    expect(el.style.getPropertyValue("--scrollsheet-toast-swipe-x")).toBe("");
  });

  test("dismissible: false never arms the swipe gesture", async () => {
    await mount(<ToasterShell visibleToasts={3} />);
    await React.act(async () => {
      toast("Pinned", { dismissible: false, duration: 60_000 });
    });
    const el = rows()[0] as HTMLElement;
    await firePointer(el, "pointerdown", 0, 0);
    await firePointer(el, "pointermove", 60, 0);
    expect(el.getAttribute("data-swiping")).toBe("false");
    expect(el.style.getPropertyValue("--scrollsheet-toast-swipe-x")).toBe("");
  });

  test("a pointerdown that originates on a close button doesn't arm a drag, so its own click still dismisses normally", async () => {
    await mount(<ToasterShell visibleToasts={3} closeButton />);
    await React.act(async () => {
      toast("Closable", { duration: 60_000 });
    });
    const el = rows()[0] as HTMLElement;
    const closeBtn = el.querySelector<HTMLElement>(".scrollsheet-toast-close");
    expect(closeBtn).toBeDefined();
    await firePointer(closeBtn as HTMLElement, "pointerdown", 0, 0);
    expect(el.getAttribute("data-swiping")).toBe("false");
  });
});
