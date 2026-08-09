import { describe, expect, spyOn, test } from "bun:test";
import type * as React from "react";
import { renderToString } from "react-dom/server";
import {
  composeHandleClick,
  composeOpenChange,
  Drawer,
  hasMultipleSnapPoints,
  resolveCloseThreshold,
  resolveFadeFromIndex,
} from "../../../packages/scrollsheet/src/drawer/index";

/**
 * The vaul compat layer (src/drawer) is a thin translation over the same
 * dialog/scroll-snap engine `src/index.ts` exercises in test/ssr.test.tsx —
 * these tests focus on what's specific to the shim: vaul's prop names
 * (snapPoints/activeSnapPoint), the data-attribute contract vaul consumers'
 * CSS depends on, ignored-prop warnings, and that Portal/Overlay — which do
 * nothing in scrollsheet — don't crash when given vaul's props.
 */

function SnapPointDrawer() {
  return (
    <Drawer.Root defaultOpen snapPoints={[0.4, 0.8, "500px"]} activeSnapPoint={0.8}>
      <Drawer.Content aria-label="snap point sheet">
        <Drawer.Handle />
        <Drawer.Title>Title</Drawer.Title>
        <Drawer.Description>Description</Drawer.Description>
      </Drawer.Content>
    </Drawer.Root>
  );
}

// `fixed` shares the exact same "root-ignored-props" warnOnce key as the
// rest of this list (see Root's implementation) — a real vaul migrator
// setting `fixed` alongside these other legacy props gets exactly one
// combined warning, not a second one, so it belongs in the same fixture
// rather than a standalone one that would never see its own warning fire
// (the key would already be consumed by whichever ignored-props render ran
// first in this file's shared, module-wide `warned` Set).
function IgnoredPropsDrawer() {
  return (
    <Drawer.Root
      defaultOpen
      setBackgroundColorOnScale
      noBodyStyles
      scrollLockTimeout={100}
      fixed
      autoFocus
      nested
    >
      <Drawer.Content aria-label="ignored props sheet" />
    </Drawer.Root>
  );
}

/** onClose is a real mapped prop (wired through onOpenChange), not an ignored one — it must never appear in the ignored-props warning. */
function OnCloseDrawer() {
  return (
    <Drawer.Root defaultOpen onClose={() => {}}>
      <Drawer.Content aria-label="onClose sheet" />
    </Drawer.Root>
  );
}

/**
 * Content's Radix-only interaction-handler props — none of these have a
 * scrollsheet equivalent, mirroring Root's own ignored-props mechanism.
 */
function ContentIgnoredPropsDrawer() {
  return (
    <Drawer.Root defaultOpen>
      <Drawer.Content
        aria-label="content ignored props sheet"
        onPointerDownOutside={() => {}}
        onOpenAutoFocus={() => {}}
        onEscapeKeyDown={() => {}}
        onCloseAutoFocus={() => {}}
        onInteractOutside={() => {}}
        onFocusOutside={() => {}}
        forceMount
      />
    </Drawer.Root>
  );
}

/**
 * Handle rendered directly under Root (not nested in Content, which is
 * behind a client-only mount gate — see hasMultipleSnapPoints' doc comment)
 * so its own markup is actually observable via SSR.
 */
function HandleDrawer({ preventCycle }: { preventCycle?: boolean }) {
  return (
    <Drawer.Root defaultOpen>
      <Drawer.Handle preventCycle={preventCycle} />
    </Drawer.Root>
  );
}

/** Title/Description rendered directly under Root for the same SSR-observability reason as HandleDrawer. */
function TitleDescriptionAsChildDrawer() {
  return (
    <Drawer.Root defaultOpen>
      <Drawer.Title asChild className="slot-title">
        <span className="child-title">Title</span>
      </Drawer.Title>
      <Drawer.Description asChild>
        <span className="child-description">Description</span>
      </Drawer.Description>
    </Drawer.Root>
  );
}

/** Child already carries its own `id` — the vaul-compat Title/Description's ctx id must still win. */
function TitleDescriptionAsChildOwnIdDrawer() {
  return (
    <Drawer.Root defaultOpen>
      <Drawer.Title asChild>
        <span id="my-own-id">Title</span>
      </Drawer.Title>
      <Drawer.Description asChild>
        <span id="my-own-id">Description</span>
      </Drawer.Description>
    </Drawer.Root>
  );
}

function MappedPropsDrawer() {
  return (
    <Drawer.Root defaultOpen direction="right" modal={false} shouldScaleBackground>
      <Drawer.Content aria-label="mapped props sheet" />
    </Drawer.Root>
  );
}

function MappedDragPropsDrawer() {
  return (
    <Drawer.Root
      defaultOpen
      snapPoints={[0.4, 0.8]}
      fadeFromIndex={0}
      handleOnly
      snapToSequentialPoint
      onRelease={() => {}}
    >
      <Drawer.Content aria-label="mapped drag props sheet">
        <Drawer.Handle />
      </Drawer.Content>
    </Drawer.Root>
  );
}

/** closeThreshold + snapPoints together — inert in real vaul, so this compat layer warns once instead of silently changing dismiss behavior (see resolveFadeFromIndex's neighbor logic in src/drawer/index.tsx's Root). */
function CloseThresholdWithSnapPointsDrawer() {
  return (
    <Drawer.Root defaultOpen snapPoints={[0.4, 0.8]} closeThreshold={0.9}>
      <Drawer.Content aria-label="close threshold with snap points sheet" />
    </Drawer.Root>
  );
}

/** closeThreshold alone (no snapPoints) — the one case real vaul actually reads it, so it should map through live with no warning. */
function CloseThresholdWithoutSnapPointsDrawer() {
  return (
    <Drawer.Root defaultOpen closeThreshold={0.9}>
      <Drawer.Content aria-label="close threshold without snap points sheet" />
    </Drawer.Root>
  );
}

function OverlayPortalDrawer() {
  return (
    <Drawer.Root defaultOpen>
      <Drawer.Portal container={null}>
        <Drawer.Overlay className="my-overlay" />
        <Drawer.Content aria-label="overlay sheet" />
      </Drawer.Portal>
    </Drawer.Root>
  );
}

describe("vaul compat", () => {
  test("Drawer.Root with snapPoints + activeSnapPoint renders without throwing", () => {
    // The dialog is portaled behind a mount gate, so SSR emits no dialog
    // markup; this proves the vaul prop translation (snapPoints, activeSnapPoint)
    // doesn't throw at render time. Client behavior is covered by e2e.
    expect(() => renderToString(<SnapPointDrawer />)).not.toThrow();
  });

  // `fixed`/`autoFocus`/`nested` (real vaul props with no scrollsheet
  // equivalent — both `autoFocus` and `nested` were typed + TSDoc'd as
  // ignored but never actually pushed onto this list, so they were silently
  // swallowed instead of warned like every sibling here) share this same
  // warned-ignored list and warnOnce key — they must land here, not be
  // silently absent from both the mapped props and the warning.
  test("ignored props warn once, including fixed/autoFocus/nested", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      renderToString(<IgnoredPropsDrawer />);
      renderToString(<IgnoredPropsDrawer />);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0]?.[0]);
      expect(message).toContain("setBackgroundColorOnScale");
      expect(message).toContain("noBodyStyles");
      expect(message).toContain("scrollLockTimeout");
      expect(message).toContain("fixed");
      expect(message).toContain("autoFocus");
      expect(message).toContain("nested");
    } finally {
      warnSpy.mockRestore();
    }
  });

  // onClose used to be entirely absent — neither mapped nor warned. It's a
  // real mapped prop now (composeOpenChange, tested directly below), so it
  // must never trip the ignored-props warning.
  test("onClose maps without warning", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => renderToString(<OnCloseDrawer />)).not.toThrow();
      const mentioned = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) => m.includes("onClose"));
      expect(mentioned).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  // Content had no ignored-props mechanism at all before — these Radix
  // Dialog.Content handlers used to be spread straight onto the DOM with
  // zero signal. Mirrors Root's own "ignored props warn once" test above.
  test("Content's Radix-only interaction-handler props warn once and are stripped", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      renderToString(<ContentIgnoredPropsDrawer />);
      renderToString(<ContentIgnoredPropsDrawer />);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0]?.[0]);
      expect(message).toContain("<Drawer.Content>");
      expect(message).toContain("onPointerDownOutside");
      expect(message).toContain("onOpenAutoFocus");
      expect(message).toContain("onEscapeKeyDown");
      expect(message).toContain("onCloseAutoFocus");
      expect(message).toContain("onInteractOutside");
      expect(message).toContain("onFocusOutside");
      expect(message).toContain("forceMount");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("Content without any of the Radix-only props doesn't warn", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => renderToString(<SnapPointDrawer />)).not.toThrow();
      const mentioned = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) => m.includes("<Drawer.Content>"));
      expect(mentioned).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  // Handle is rendered directly under Root (not nested in Content, which
  // never emits markup under SSR — see hasMultipleSnapPoints' doc comment),
  // so its own data attribute and prop-stripping are directly observable.
  test("Handle emits data-vaul-handle for CSS parity with vaul", () => {
    const html = renderToString(<HandleDrawer />);
    expect(html).toContain('data-vaul-handle=""');
    // scrollsheet's own attribute must still be present alongside vaul's.
    expect(html).toContain("data-scrollsheet-handle");
  });

  test("Handle strips preventCycle so it never leaks onto the DOM button", () => {
    const html = renderToString(<HandleDrawer preventCycle />);
    expect(html.toLowerCase()).not.toContain("preventcycle");
  });

  // Real vaul's data-vaul-drawer-visible mirrors `isOpen` directly (src/index.tsx
  // Handle: `isOpen ? 'true' : 'false'`) — scrollsheet's `ctx.open`, not the
  // exit-animation phase.
  test("Handle emits data-vaul-drawer-visible matching the drawer's open state", () => {
    const openHtml = renderToString(<HandleDrawer />);
    expect(openHtml).toContain('data-vaul-drawer-visible="true"');

    function ClosedHandleDrawer() {
      return (
        <Drawer.Root open={false}>
          <Drawer.Handle />
        </Drawer.Root>
      );
    }
    const closedHtml = renderToString(<ClosedHandleDrawer />);
    expect(closedHtml).toContain('data-vaul-drawer-visible="false"');
  });

  // Title/Description are rendered directly under Root for the same
  // SSR-observability reason as HandleDrawer above.
  test("Title/Description asChild render the child element with merged props", () => {
    const html = renderToString(<TitleDescriptionAsChildDrawer />);
    expect(html).toContain('class="slot-title child-title"');
    expect(html).toContain("child-description");
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("<p ");
  });

  test("Title/Description asChild keep the scrollsheet-owned id when the child already has its own", () => {
    const html = renderToString(<TitleDescriptionAsChildOwnIdDrawer />);
    expect(html).not.toContain('id="my-own-id"');
  });

  test("direction, modal and shouldScaleBackground map to core props without warning", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => renderToString(<MappedPropsDrawer />)).not.toThrow();
      const mentioned = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) => m.includes("direction") || m.includes("modal") || m.includes("shouldScale"));
      expect(mentioned).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  // fadeFromIndex/handleOnly/snapToSequentialPoint/onRelease used to be
  // ignored-and-warned; they're live scrollsheet props now (see
  // src/drawer/index.tsx's Root) — this locks in that none of them regress
  // back into the ignored-prop warning. closeThreshold is covered
  // separately below — it now conditionally warns depending on snapPoints,
  // so it doesn't belong in an unconditional "never warns" fixture.
  test("fadeFromIndex, handleOnly, snapToSequentialPoint and onRelease map without warning", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => renderToString(<MappedDragPropsDrawer />)).not.toThrow();
      const mentioned = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter(
          (m) =>
            m.includes("fadeFromIndex") ||
            m.includes("handleOnly") ||
            m.includes("closeThreshold") ||
            m.includes("snapToSequentialPoint") ||
            m.includes("onRelease"),
        );
      expect(mentioned).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  // vaul's closeThreshold is dead code once snapPoints exist (verified
  // against vaul's own source — onRelease returns through the snap-points
  // branch before ever reading it). This compat layer matches that instead
  // of giving the prop unconditional live effect, and warns once in dev so
  // a migrated consumer who set both notices rather than silently getting a
  // different dismiss threshold than real vaul ever gave them.
  test("closeThreshold + snapPoints warns once and doesn't reach SheetRoot live", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      renderToString(<CloseThresholdWithSnapPointsDrawer />);
      renderToString(<CloseThresholdWithSnapPointsDrawer />);
      const mentions = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) => m.includes("closeThreshold"));
      expect(mentions).toHaveLength(1);
      expect(mentions[0]).toContain("snapPoints");
      expect(mentions[0]).toContain("dead code");
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("closeThreshold without snapPoints maps through live, no warning", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => renderToString(<CloseThresholdWithoutSnapPointsDrawer />)).not.toThrow();
      const mentions = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) => m.includes("closeThreshold"));
      expect(mentions).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("Overlay and Portal do not crash", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => renderToString(<OverlayPortalDrawer />)).not.toThrow();
      const html = renderToString(<OverlayPortalDrawer />);
      // Overlay renders nothing — scrollsheet draws its own backdrop.
      expect(html).not.toContain("my-overlay");
      // Portal's `container` prop is a documented no-op, warned about once.
      expect(warnSpy).toHaveBeenCalled();
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain("Drawer.Portal");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

/**
 * resolveFadeFromIndex is the exact index math the "inverted migration
 * behavior" finding was about: real vaul defaults fadeFromIndex to
 * snapPoints.length-1 (no dim until the topmost snap point) when omitted,
 * not "no undimmed range at all". Tested directly as a pure function — the
 * dialog is portaled behind a mount gate (see SnapPointDrawer's test above),
 * so SSR can't observe the resolved --scrollsheet-fade-start/-end values
 * this feeds into.
 */
describe("resolveFadeFromIndex", () => {
  test("no snapPoints resolves to undefined regardless of fadeFromIndex", () => {
    expect(resolveFadeFromIndex(undefined, undefined)).toBeUndefined();
    expect(resolveFadeFromIndex(undefined, 0)).toBeUndefined();
    expect(resolveFadeFromIndex([], 0)).toBeUndefined();
  });

  test("explicit fadeFromIndex resolves the snap point at that index", () => {
    expect(resolveFadeFromIndex([0.3, 0.6, 1], 0)).toBe(0.3);
    expect(resolveFadeFromIndex([0.3, 0.6, 1], 1)).toBe(0.6);
    expect(resolveFadeFromIndex([0.3, 0.6, "500px"], 2)).toBe("500px");
  });

  // The finding this guards: omitted (with snapPoints set) must default to
  // the LAST index (vaul's own default: `snapPoints.length - 1`), not leave
  // largestUndimmedDetent unset (which would dim from the very start of the
  // drag — the inverted, wrong-migration behavior the review caught).
  test("omitted fadeFromIndex (with snapPoints set) defaults to the last snap point, not unset", () => {
    expect(resolveFadeFromIndex([0.3, 0.6, 1], undefined)).toBe(1);
    expect(resolveFadeFromIndex([0.3, 0.6, "500px"], undefined)).toBe("500px");
    expect(resolveFadeFromIndex([0.5], undefined)).toBe(0.5);
  });

  test("explicit fadeFromIndex 0 is preserved, not treated as omitted", () => {
    expect(resolveFadeFromIndex([0.3, 0.6, 1], 0)).toBe(0.3);
  });

  test("out-of-range explicit fadeFromIndex resolves to undefined", () => {
    expect(resolveFadeFromIndex([0.3, 0.6], 5)).toBeUndefined();
    expect(resolveFadeFromIndex([0.3, 0.6], -1)).toBeUndefined();
  });
});

/**
 * resolveCloseThreshold converts between the two libraries' OPPOSITE
 * conventions: vaul counts the fraction dragged away (0.25 = quarter-height
 * drag dismisses), scrollsheet counts the fraction still visible
 * (isBelowCloseThreshold: higher = easier dismiss). The mapping is
 * `1 - value`; a raw passthrough shipped once and made migrated drawers
 * HARDER to dismiss than scrollsheet's own default, the opposite of vaul's
 * feel (confirmed by calibrated drag measurement in
 * tests/e2e/compat/vaul.spec.ts). Tested directly as a pure function for
 * the same SSR-observability reason as resolveFadeFromIndex above (the
 * resolved value only ever reaches Sheet.Root as a prop — Content's actual
 * dialog markup, where a dismiss threshold could in principle be observed,
 * never renders under SSR).
 */
describe("resolveCloseThreshold", () => {
  test("omitted, no snapPoints: vaul's own 0.25 default converts to scrollsheet 0.75", () => {
    expect(resolveCloseThreshold(undefined, undefined)).toBe(0.75);
  });

  test("explicit value, no snapPoints: converts 1 - value, clamped to 0..1", () => {
    expect(resolveCloseThreshold(undefined, 0.9)).toBeCloseTo(0.1, 10);
    expect(resolveCloseThreshold(undefined, 0)).toBe(1);
    expect(resolveCloseThreshold(undefined, 1)).toBe(0);
    expect(resolveCloseThreshold(undefined, 1.5)).toBe(0);
  });

  // Matches real vaul: closeThreshold is dead code once snapPoints exist —
  // its onRelease returns through the snap-points branch before ever
  // reading it. Always undefined here regardless of what closeThreshold was
  // given, omitted or not.
  test("snapPoints set: always undefined, omitted or explicit", () => {
    expect(resolveCloseThreshold([0.4, 0.8], undefined)).toBeUndefined();
    expect(resolveCloseThreshold([0.4, 0.8], 0.9)).toBeUndefined();
  });
});

/**
 * composeOpenChange is the exact wiring the "onClose is completely absent"
 * finding was about. Tested directly as a pure function: the DOM
 * interaction that would trigger it (a drag dismiss, an Esc press, a
 * backdrop tap) needs a live browser, unavailable to these SSR-only unit
 * tests — but the composed handler itself is plain synchronous logic, so
 * it's exercised directly with fake open/false transitions instead.
 */
describe("composeOpenChange", () => {
  test("returns undefined when neither onClose nor onOpenChange is given", () => {
    expect(composeOpenChange(undefined, undefined)).toBeUndefined();
  });

  test("fires onClose only on a transition to false, never to true", () => {
    const closes: number[] = [];
    const handler = composeOpenChange(undefined, () => closes.push(1));
    handler?.(true);
    expect(closes).toHaveLength(0);
    handler?.(false);
    expect(closes).toHaveLength(1);
  });

  test("always calls onOpenChange with the real value, on both transitions", () => {
    const opens: boolean[] = [];
    const handler = composeOpenChange((next) => opens.push(next), undefined);
    handler?.(true);
    handler?.(false);
    expect(opens).toEqual([true, false]);
  });

  test("onClose fires before onOpenChange on a close, and both fire exactly once", () => {
    const order: string[] = [];
    const handler = composeOpenChange(
      () => order.push("onOpenChange"),
      () => order.push("onClose"),
    );
    handler?.(false);
    expect(order).toEqual(["onClose", "onOpenChange"]);
  });
});

/**
 * hasMultipleSnapPoints is the exact predicate feeding Content's
 * `data-vaul-snap-points` attribute — the "only 2 of vaul's 6 [data-vaul-*]
 * attributes" finding's fix. Tested directly since Content's actual DOM
 * output is behind a client-only mount gate (content.tsx: `mounted` starts
 * false and only flips via an effect, which never runs under
 * `renderToString`), so SSR can't observe the rendered attribute value.
 */
describe("hasMultipleSnapPoints", () => {
  test("scrollsheet's own single-detent default resolves to false", () => {
    expect(hasMultipleSnapPoints(["content"])).toBe(false);
  });

  test("no detents at all resolves to false", () => {
    expect(hasMultipleSnapPoints([])).toBe(false);
  });

  test("two or more detents (from snapPoints) resolves to true", () => {
    expect(hasMultipleSnapPoints([0.4, 0.8])).toBe(true);
    expect(hasMultipleSnapPoints([0.4, 0.8, "500px"])).toBe(true);
  });
});

/**
 * composeHandleClick is the exact click-composition the "preventCycle is
 * unsupported" finding was about — mirrors composeOpenChange's rationale
 * for being pure-function-tested instead of DOM-click-simulated.
 */
describe("composeHandleClick", () => {
  function fakeClickEvent(): {
    event: React.MouseEvent<HTMLButtonElement>;
    prevented: () => boolean;
  } {
    let prevented = false;
    const event = {
      preventDefault: () => (prevented = true),
    } as unknown as React.MouseEvent<HTMLButtonElement>;
    return { event, prevented: () => prevented };
  }

  test("preventCycle true: preventDefault is called after the caller's onClick", () => {
    const order: string[] = [];
    const { event, prevented } = fakeClickEvent();
    const handler = composeHandleClick(true, () => order.push("onClick"));
    handler(event);
    expect(prevented()).toBe(true);
    expect(order).toEqual(["onClick"]);
  });

  test("preventCycle false or undefined: preventDefault is never called", () => {
    const { event: eventFalse, prevented: preventedFalse } = fakeClickEvent();
    composeHandleClick(false, undefined)(eventFalse);
    expect(preventedFalse()).toBe(false);

    const { event: eventUndef, prevented: preventedUndef } = fakeClickEvent();
    composeHandleClick(undefined, undefined)(eventUndef);
    expect(preventedUndef()).toBe(false);
  });

  test("the caller's onClick always fires, regardless of preventCycle", () => {
    let called = false;
    const { event } = fakeClickEvent();
    composeHandleClick(true, () => (called = true))(event);
    expect(called).toBe(true);
  });
});

// snapPoints={[]} (a dynamically computed list before data arrives) must
// read as "no snapPoints" everywhere on the Root: the detents line falls
// back to Sheet.Root's own default and resolveFadeFromIndex already returns
// undefined — a threshold that still treated [] as "set" produced the only
// inconsistent reading, leaving a sheet with no detents at all (maxDetent 0,
// zero-height dialog).
describe("resolveCloseThreshold — empty snapPoints array", () => {
  test("[] converts the threshold exactly like undefined snapPoints", () => {
    expect(resolveCloseThreshold([], undefined)).toBe(0.75);
    expect(resolveCloseThreshold([], 0.9)).toBeCloseTo(0.1, 10);
  });
});
