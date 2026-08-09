import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger, waitForStableScrollTop } from "../helpers";

/**
 * Competitor bug audit — scenarios B01–B41, mined from vaul / react-modal-sheet
 * / MUI Base UI / other sheet-library issue trackers, replayed against
 * scrollsheet. Runs against e2e/fixtures/ (see sides.spec.ts's header for
 * why: a stable, purpose-built app, never the human-facing playground).
 *
 * Pruned pass: every scenario below is either a live probe (a real DOM/CSS/
 * behavior assertion) or has been cut. Cut categories, not kept as
 * `test.skip` stubs:
 *   - "IMMUNE by architecture/design/construction" entries that only restate
 *     a static fact about the source (no custom touch listeners, no hooks
 *     after an early return, no WeakRef usage, etc.) — a code comment, not a
 *     test; verify these by reading the code, not by running a suite.
 *   - NEEDS-DEVICE entries with literally no DOM/accessibility signal
 *     Playwright can assert on (native select re-tap timing, caret blink
 *     compositing) — nothing to assert, so nothing to keep as a `test`.
 *   - Entries fully superseded by a dedicated spec file's own live coverage
 *     (vaul#582/#580 → non-modal.spec.ts's "bug-class defenses" describe;
 *     B22's "side sheets are hypothetical future work" premise → sides.spec.ts,
 *     which now covers the shipped feature directly).
 * PWA-standalone-specific scenarios (B09–B11) are probed in e2e/pwa.spec.ts
 * instead — see that file for those B-ids.
 */

test.describe("B01 — keyboard-dismiss blur/resize race", () => {
  test("B01: keyboard-inset reset is driven by the resize event itself, not gated on blur order", async ({
    page,
  }) => {
    // Root-cause in the source bug: the height-reset lives ONLY inside a
    // blur handler, so a blur-before-resize race skips it. scrollsheet has
    // no blur listener in this path at all — relayout() reacts purely to
    // window/visualViewport resize/scroll and always recomputes fresh from
    // current state. Simulating the keyboard closing (a visualViewport
    // shrink-then-grow) with no blur involved at all proves the reset
    // doesn't depend on blur ever having fired.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Keyboard");
    // Keyboard detection is gated on focus (v0.2: a keyboard-summoning
    // element must be focused for a visualViewport delta to count as "the
    // keyboard" at all — otherwise it's Safari's bottom-bar collapsing, full
    // stop). Focusing the input here is that gate, not a "blur order"
    // dependency — B01's own point (no *blur* dependency) is unaffected.
    await dialog.getByLabel("Demo text input").focus();

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      // Simulate a keyboard opening then closing, purely via resize events —
      // no focus/blur dispatched anywhere in this sequence.
      Object.defineProperty(vv, "height", { value: window.innerHeight - 300, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    // The inset lives on the track (its only CSS consumer); assert the real
    // observable effect — the track's computed bottom offset — not the var.
    const track = dialog.locator(".scrollsheet-track");
    await expect(async () => {
      const inset = await track.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--scrollsheet-keyboard").trim(),
      );
      expect(inset).toBe("300px");
    }).toPass({ timeout: SPRING_TIMEOUT });

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    await expect(async () => {
      const inset = await track.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--scrollsheet-keyboard").trim(),
      );
      expect(inset).toBe("0px");
    }).toPass({ timeout: SPRING_TIMEOUT });
  });
});

test.describe("B03 — input scroll-into-view above keyboard", () => {
  test("B03: focusing an input scrolls it into view within the sheet's own scroll container", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Keyboard");
    const panel = dialog.locator(".scrollsheet-panel");
    const input = dialog.getByLabel("Demo text input");

    // Raw DOM rects via evaluate, NOT locator.boundingBox(): this is a pure
    // geometry check, and boundingBox routes through Playwright's visibility
    // gating, which the Linux x64 WebKit build fails for elements scrolled
    // out of an overflow container (null for the whole wait, "bounding boxes
    // unavailable"). getBoundingClientRect has no such layer.
    const rect = (locator: typeof input) =>
      locator.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { y: r.y, height: r.height };
      });

    // Push the input out of view first (scroll the panel's own content down
    // past it), matching "an input whose natural position isn't currently
    // visible" — the general form of B03's "near the bottom" repro.
    await panel.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const beforeBox = await rect(input);
    const panelBox = await rect(panel);
    expect(beforeBox.y + beforeBox.height).toBeLessThan(panelBox.y); // scrolled above the visible top

    await input.focus();
    // The keyboard-avoiding focus scroll effect debounces 250ms then calls
    // scrollIntoView({block:'nearest'}) — wait past that, then confirm the
    // input is back within the panel's visible bounds. 4px slack, not 1:
    // Linux WebKit's scrollIntoView lands block:'nearest' up to ~3px shy of
    // the edge on fractional layouts, and the claim B03 guards is "scrolled
    // back into view at all" (it starts ~1700px out), not exact alignment.
    await expect(async () => {
      const afterBox = await rect(input);
      const currentPanelBox = await rect(panel);
      expect(afterBox.y).toBeGreaterThanOrEqual(currentPanelBox.y - 4);
      expect(afterBox.y + afterBox.height).toBeLessThanOrEqual(
        currentPanelBox.y + currentPanelBox.height + 4,
      );
    }).toPass({ timeout: SPRING_TIMEOUT });
  });
});

test.describe("B06 — drawer/keyboard positioning vs. scroll-vs-dismiss disambiguation", () => {
  test("B06: track repositions above a simulated keyboard, and the dismiss threshold is unaffected", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Keyboard");
    const track = dialog.locator(".scrollsheet-track");
    // Keyboard detection is gated on focus (see B01's comment) — focus the
    // input first so this resize is classified as "the keyboard" at all.
    await dialog.getByLabel("Demo text input").focus();

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight - 300, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    // The track keeps its layout size (detents stay stable); the PANEL is
    // what lifts above the keyboard via --scrollsheet-keyboard.
    const panel = dialog.locator(".scrollsheet-panel");
    await expect(async () => {
      // The inset var, not computed `bottom`: the panel's anchored-edge
      // offset now also carries the kb-hang term (keyboard scrollport
      // geometry), so raw bottom is inset + hang. The var is the engine
      // output these tests exercise; visible geometry has its own spec in
      // keyboard-gaps.spec.ts.
      const kb = await dialog.evaluate((el) =>
        (el as HTMLElement).style.getPropertyValue("--scrollsheet-keyboard"),
      );
      expect(kb).toBe("300px");
    }).toPass({ timeout: SPRING_TIMEOUT });

    // Dismissal is still "scrollTop reaches 0" — a native scroll-boundary
    // fact, not a pixel-delta gesture calculation that could be thrown off
    // by the keyboard-adjusted viewport height.
    await track.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scrollend"));
    });
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });
});

test.describe("B07 — stale bottom whitespace after keyboard dismiss", () => {
  test("B07: keyboard inset and detent height both fully reset after a simulated keyboard close", async ({
    page,
  }) => {
    // This is the scenario the WebKit scrollTop-revert fix (jumpScroll /
    // el.scrollTo({behavior:'instant'}) in content.tsx) directly addresses —
    // before that fix, WebKit would silently revert a raw scrollTop
    // re-assignment made by the relayout effect, leaving a stale detent
    // height in place after the keyboard closed.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Keyboard");
    const track = dialog.locator(".scrollsheet-track");
    const before = await waitForStableScrollTop(track);
    // Keyboard detection is gated on focus (see B01's comment) — focus the
    // input first so this resize is classified as "the keyboard" at all.
    await dialog.getByLabel("Demo text input").focus();

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight - 300, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });

    await expect(async () => {
      const inset = await track.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--scrollsheet-keyboard").trim(),
      );
      expect(inset).toBe("0px");
      const scrollTop = await track.evaluate((el) => el.scrollTop);
      expect(Math.abs(scrollTop - before)).toBeLessThanOrEqual(2);
    }).toPass({ timeout: SPRING_TIMEOUT });
  });
});

test.describe("B08 — bottom-anchored content shot off-screen by keyboard", () => {
  test("B08: an aggressive simulated keyboard height never pushes the panel's top edge above the visible track", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Keyboard");
    const track = dialog.locator(".scrollsheet-track");
    // Keyboard detection is gated on focus (see B01's comment) — focus the
    // input first so this resize is classified as "the keyboard" at all.
    await dialog.getByLabel("Demo text input").focus();

    // A keyboard "taller" than most of the sheet — the extreme case the
    // source bug describes (the reposition math over-shifting past the
    // sheet's own bounds, ejecting it off the top of the screen).
    // scrollsheet resizes the *container* (track's bottom inset) rather than
    // translating the sheet's own position, so detents are recomputed
    // against the shrunk viewport instead of being additively offset
    // off-screen.
    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: 100, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });

    await expect(async () => {
      const trackBox = await track.boundingBox();
      const panel = dialog.locator(".scrollsheet-panel");
      const panelBox = await panel.boundingBox();
      if (!trackBox || !panelBox) throw new Error("bounding boxes unavailable");
      expect(panelBox.y).toBeGreaterThanOrEqual(trackBox.y - 1);
    }).toPass({ timeout: SPRING_TIMEOUT });

    // Restore, so this test doesn't poison later tests sharing the page.
    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
  });
});

// B09, B10, B11 (PWA standalone mode) are probed in e2e/pwa.spec.ts instead —
// they require display-mode: standalone emulation, which that file already
// sets up. See that file for the B09/B10/B11-tagged tests.

test.describe("B12 — URL-bar collapse mid-interaction / scroll-position restore", () => {
  test("B12: the background page's own scroll position is never touched by open or close", async ({
    page,
  }) => {
    // scrollsheet's flagship architectural claim: no position:fixed body
    // hack, so there's no scroll-restore bug class to have. Scroll the
    // underlying page first (simulating "already scrolled, chrome
    // collapsed"), then open+close a sheet and confirm window.scrollY is
    // bit-for-bit unchanged throughout.
    //
    // Opens via a raw DOM .click() (page.evaluate), not Playwright's
    // locator.click() — the latter auto-scrolls its target into view first,
    // which would itself move window.scrollY and invalidate the very thing
    // this test checks.
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 400));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      buttons.find((b) => b.textContent === "Basic sheet")?.click();
    });
    const dialog = page.locator("dialog.scrollsheet-dialog").first();
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    const duringOpen = await page.evaluate(() => window.scrollY);
    expect(duringOpen).toBe(before);

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBe(before);
  });
});

test.describe("B13 — backdrop under Safari's floating bottom toolbar", () => {
  test("B13: track and backdrop cover the full viewport height (inset:0, no truncation)", async ({
    page,
  }) => {
    // Can't simulate Safari's real floating-toolbar overlay in Playwright,
    // but the underlying CSS contract this depends on (inset:0 covering the
    // full display, contingent on the page's own viewport-fit=cover — set in
    // e2e/fixtures/index.html) is directly verifiable: track/backdrop must
    // size to the full viewport, not something short of it.
    await page.goto("/");
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewportMeta).toContain("viewport-fit=cover");

    const dialog = await openSheetByTrigger(page, "Basic sheet");
    const track = dialog.locator(".scrollsheet-track");
    const backdrop = dialog.locator(".scrollsheet-backdrop");
    const viewportHeight = page.viewportSize()!.height;

    const trackBox = await track.boundingBox();
    const backdropBox = await backdrop.boundingBox();
    if (!trackBox || !backdropBox) throw new Error("bounding boxes unavailable");
    expect(Math.round(trackBox.height)).toBe(viewportHeight);
    expect(Math.round(backdropBox.height)).toBe(viewportHeight);
  });
});

test.describe("B15 — taps on button text fail; padding/icon taps register (iOS Safari)", () => {
  test("B15: a tap directly on a button's visible text label fires its click handler", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");
    const closeButton = dialog.getByRole("button", { name: "Close", exact: true });

    // Target the actual glyph area of the label, not just "somewhere in the
    // button's box" (which basic-sheet.spec.ts's own click test already does
    // implicitly via Playwright's default click-center behavior) — tap
    // explicitly within the text's own bounding box.
    const textBox = await closeButton.boundingBox();
    if (!textBox) throw new Error("button bounding box unavailable");
    await page.mouse.click(textBox.x + 8, textBox.y + textBox.height / 2);

    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });
});

test.describe("B16 — click shows a visual flash but the handler doesn't fire (iOS Safari)", () => {
  test("B16: repeated taps on the same interactive element fire its handler every time, no dropped clicks", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const handle = dialog.locator("[data-scrollsheet-handle]");
    const track = dialog.locator(".scrollsheet-track");
    const viewportHeight = page.viewportSize()!.height;

    // Handle click cycles detents (0.35 -> 0.7 -> full -> 0.35 -> ...) —
    // every click's effect is externally observable via scrollTop, so a
    // dropped click (handler didn't fire despite the tap "registering")
    // shows up immediately as a missed transition.
    for (const expectedFraction of [0.7, 1, 0.35, 0.7]) {
      await handle.click();
      const scrollTop = await waitForStableScrollTop(track);
      const expected = Math.round(viewportHeight * expectedFraction);
      expect(Math.abs(scrollTop - expected)).toBeLessThanOrEqual(2);
    }
  });
});

test.describe("B17 — invisible text caret on first tap inside a transform-animated sheet", () => {
  test("B17 (functional half): typing works immediately after tapping an input mid-open-animation, even though the caret's own visibility is a WebKit rendering quirk outside library control", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Keyboard", exact: true }).click();
    const dialog = page.locator("dialog.scrollsheet-dialog").first();
    // Deliberately don't wait for data-scrollsheet-state="open" (~508ms
    // spring) — a short partial wait instead, so the panel has translated at
    // least partway into the viewport (a literal 0ms-after-click tap would
    // target an element still fully translateY(100%) off-screen, which even
    // a forced click can't reach) while the transition is still very much in
    // progress, the exact condition B17 requires. `force: true` skips
    // Playwright's own "is this element stable (not still moving)"
    // actionability wait, which would otherwise just block until the CSS
    // transition finishes — defeating the point of tapping mid-animation.
    await page.waitForTimeout(120);
    const input = dialog.getByLabel("Demo text input");
    await input.click({ force: true });
    await input.fill("hello", { force: true });
    await expect(input).toHaveValue("hello");
  });
});

test.describe("B19 — scroll-to-top-then-continue-swipe dismiss requires pause/re-touch", () => {
  test("B19: overscrolling past the content's own top at max detent chains into dismissing the sheet in one continuous gesture", async ({
    page,
  }) => {
    // FOUND AFFECTED, FIXED: .scrollsheet-panel had its own
    // overscroll-behavior:contain at max-detent, which silently blocked this
    // exact handoff (verified via Playwright wheel-chaining probes across
    // Chromium/WebKit/Firefox before the fix: delta was always 0). Removed
    // in src/internal/styles.ts — track's own overscroll-behavior:contain
    // (untouched) still fully protects the page behind (see B39 below).
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const panel = dialog.locator(".scrollsheet-panel");

    await dialog.locator("[data-scrollsheet-handle]").click(); // 0.35 -> 0.7
    await dialog.locator("[data-scrollsheet-handle]").click(); // 0.7 -> full
    await waitForStableScrollTop(track);
    await expect(dialog).toHaveAttribute("data-scrollsheet-at-max", "");

    await panel.evaluate((el) => {
      el.scrollTop = 0;
    });
    const trackBefore = await track.evaluate((el) => el.scrollTop);

    const panelBox = await panel.boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 50);
    // One continuous overscroll past the content's own top boundary — same
    // gesture, no lift/re-touch.
    await page.mouse.wheel(0, -300);

    await expect
      .poll(async () => track.evaluate((el) => el.scrollTop), { timeout: SPRING_TIMEOUT })
      .toBeLessThan(trackBefore);
  });
});

test.describe("B21 — snap-point-conditional scroll-lock stops being respected after a cycle", () => {
  test("B21: inner-scroll enablement (data-scrollsheet-at-max) is correct on first open and after a full down/up detent cycle", async ({
    page,
  }) => {
    // scrollsheet has no consumer-supplied predicate function to go stale
    // via a closure bug (unlike the source library) — at-max is recomputed
    // fresh from live scrollTop on every travel frame. This is the closest
    // faithful replay: verify it's still correct after a snap-down-then-up
    // cycle, not just on first load.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const handle = dialog.locator("[data-scrollsheet-handle]");

    await handle.click(); // 0.35 -> 0.7
    await handle.click(); // 0.7 -> full
    await waitForStableScrollTop(track);
    await expect(dialog).toHaveAttribute("data-scrollsheet-at-max", "");

    await handle.click(); // full -> 0.35 (wraps)
    await waitForStableScrollTop(track);
    await expect(dialog).not.toHaveAttribute("data-scrollsheet-at-max", "");

    await handle.click(); // 0.35 -> 0.7
    await handle.click(); // 0.7 -> full
    await waitForStableScrollTop(track);
    await expect(dialog).toHaveAttribute("data-scrollsheet-at-max", "");
  });
});

test.describe("B24 — programmatic (state-driven) close skips the close animation", () => {
  test("B24: closing via external state (not the sheet's own Close/backdrop/Esc handlers) still animates the exit transition", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Controlled (external state)");

    await dialog.getByRole("button", { name: "Close from outside", exact: true }).click();

    // Immediately after the click, the dialog should be transitioning
    // (data-scrollsheet-state="closing"), not instantly gone — proving the
    // close goes through the same animated code path as any other dismissal.
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "closing");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });
});

test.describe("B28 — interrupted swipe-open gesture permanently disables outside-press dismissal", () => {
  test("B28 (closest analog): outside-click dismissal keeps working reliably across repeated open/close cycles", async ({
    page,
  }) => {
    // scrollsheet has no swipe-to-*open*-gesture recognizer at all (open is
    // a discrete state transition via Trigger's onClick or any consumer
    // state change), so there's no interruptible in-flight "gesture in
    // progress" flag to get stuck; the outside-click handler
    // (track/canvas-click) has no stateful gating at all — it's a plain
    // event.target identity check. This is a general robustness replay
    // across multiple cycles, since there's no literal "interrupted swipe"
    // to construct.
    await page.goto("/");
    for (let i = 0; i < 3; i++) {
      await openSheetByTrigger(page, "Basic sheet");
      const viewport = page.viewportSize();
      if (!viewport) throw new Error("viewport size unavailable");
      await page.mouse.click(viewport.width / 2, 10);
      await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
        timeout: SPRING_TIMEOUT,
      });
    }
  });
});

test.describe("B31 — nested overlay (portal) pointer events swallowed, sheet dismisses itself", () => {
  test("B31: a click on a DOM element portaled outside the sheet's subtree never dismisses the sheet", async ({
    page,
  }) => {
    // scrollsheet's outside-click check is an exact event.target identity
    // match against track/canvas (not a .contains()-based 'is this outside
    // my subtree' check) — so it can never misclassify a portaled element's
    // click as "the empty gutter", regardless of where in the DOM that
    // element actually lives. Simulate a portaled overlay (e.g. a Radix-
    // style component appended to document.body) with a plain injected
    // sibling element, since the fixtures app has no such demo to reuse.
    //
    // Dispatches the click programmatically (element.click(), not
    // Playwright's locator.click()) rather than fighting top-layer/z-index
    // stacking to make the portaled element genuinely hit-testable above the
    // open modal dialog: a manual popover cannot visually out-rank an
    // already-open native modal <dialog> in the top layer regardless of show
    // order (confirmed via elementFromPoint probing on Chromium and WebKit),
    // and a second sibling <dialog>.showModal() reproducibly segfaults this
    // Playwright WebKit build (26.5/v2311) when combined with a real
    // coordinate-based click. A programmatic click is also the more precise
    // test regardless: what B31 actually claims is about event.target
    // identity, not visual stacking.
    await page.goto("/");
    await openSheetByTrigger(page, "Basic sheet");

    await page.evaluate(() => {
      const portal = document.createElement("button");
      portal.id = "e2e-portal-overlay";
      portal.textContent = "Portaled option";
      document.body.appendChild(portal);
      portal.click();
    });

    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(1);
    await expect(page.locator("dialog.scrollsheet-dialog").first()).toHaveAttribute(
      "data-scrollsheet-state",
      "open",
    );
  });
});

test.describe("B32 — nesting a plain dialog re-triggers the parent sheet's nested-stack animation", () => {
  test("B32: opening a plain (non-scrollsheet) <dialog> nested inside an open parent sheet doesn't make the parent recede", async ({
    page,
  }) => {
    // StackContext is read/written exclusively by scrollsheet's own Content
    // component via an explicit useContext + a "tell my parent I'm open"
    // effect — React context propagates through the *component* tree, not
    // the DOM tree, so a plain, non-scrollsheet <dialog> injected as a raw
    // DOM node (even physically nested inside the parent panel's DOM) has no
    // way to reach or call parentStack.setChildOpen(true); it simply isn't
    // part of the same React tree. Uses the "Stacking parent" fixture
    // (already wired for recede) with a hand-injected plain <dialog>
    // standing in for an unrelated overlay library's modal.
    await page.goto("/");
    const parent = await openSheetByTrigger(page, "Stacking parent", 0);
    await expect(parent).not.toHaveAttribute("data-scrollsheet-behind", "");

    await page.evaluate(() => {
      const panel = document.querySelector(".scrollsheet-panel");
      const plainDialog = document.createElement("dialog");
      plainDialog.id = "e2e-plain-dialog";
      plainDialog.textContent = "A plain, non-scrollsheet dialog";
      panel?.appendChild(plainDialog);
      plainDialog.showModal();
    });
    await expect(page.locator("#e2e-plain-dialog")).toBeVisible();

    // The parent must not recede for an overlay that isn't a scrollsheet
    // Sheet.Content participating in its StackContext.
    await expect(parent).not.toHaveAttribute("data-scrollsheet-behind", "");
  });
});

test.describe("B34 — dismissing a nested child snaps the untouched parent to a wrong position", () => {
  test("B34: the parent sheet's scrollTop is bit-for-bit unchanged across a child sheet opening and closing", async ({
    page,
  }) => {
    // There is no 'restore my position' logic anywhere reacting to child
    // open/close — the recede effect only ever toggles a CSS attribute
    // (data-scrollsheet-behind, a pure scale() transform), never touches the
    // parent's own scrollTop/activeDetent. Nothing displaces the parent's
    // position in the first place, so there's nothing to (incorrectly)
    // restore.
    await page.goto("/");
    const parent = await openSheetByTrigger(page, "Stacking parent", 0);
    const parentTrack = parent.locator(".scrollsheet-track");
    const before = await waitForStableScrollTop(parentTrack);

    await parent.getByRole("button", { name: "Open stacking child", exact: true }).click();
    const child = page.locator("dialog.scrollsheet-dialog").nth(1);
    await expect(child).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });

    await child.getByRole("button", { name: "Close stacking child", exact: true }).click();
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(1, {
      timeout: SPRING_TIMEOUT,
    });

    const after = await parentTrack.evaluate((el) => el.scrollTop);
    expect(after).toBe(before);
  });
});

test.describe("B36 — a portaled select dropdown is visible but not touch-scrollable inside the sheet", () => {
  test("B36: an element portaled outside the sheet's DOM subtree remains natively scrollable while the sheet is open", async ({
    page,
  }) => {
    // scrollsheet implements no touch-scroll allowlist/gesture-passthrough
    // mechanism at all (no custom touch listeners anywhere) — native scroll
    // works identically for any scrollable element regardless of DOM
    // position, portaled or not. Verify with an injected, genuinely
    // scrollable sibling element (standing in for a portaled dropdown list).
    await page.goto("/");
    await openSheetByTrigger(page, "Basic sheet");

    await page.evaluate(() => {
      const portal = document.createElement("div");
      portal.id = "e2e-portal-scrollable";
      portal.style.cssText =
        "position:fixed;top:10%;left:10%;width:200px;height:150px;overflow-y:scroll;z-index:99999;background:white;";
      for (let i = 0; i < 30; i++) {
        const row = document.createElement("div");
        row.textContent = `row ${i}`;
        row.style.height = "30px";
        portal.appendChild(row);
      }
      document.body.appendChild(portal);
    });

    const portal = page.locator("#e2e-portal-scrollable");
    await portal.evaluate((el) => {
      el.scrollTop = 100;
    });
    const scrollTop = await portal.evaluate((el) => el.scrollTop);
    expect(scrollTop).toBe(100);
  });
});

test.describe("B37 — body scroll-lock (overflow:hidden) breaks position:sticky elsewhere", () => {
  test("B37: opening a sheet never applies overflow/position changes to <html> or <body>", async ({
    page,
  }) => {
    await page.goto("/");
    const before = await page.evaluate(() => ({
      bodyOverflow: getComputedStyle(document.body).overflow,
      bodyPosition: getComputedStyle(document.body).position,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
    }));

    await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const during = await page.evaluate(() => ({
      bodyOverflow: getComputedStyle(document.body).overflow,
      bodyPosition: getComputedStyle(document.body).position,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
    }));

    expect(during).toEqual(before);
    expect(during.bodyOverflow).not.toBe("hidden");
    expect(during.bodyPosition).not.toBe("fixed");
  });
});

// B38 (opening near the bottom of page scroll causes a visible background
// jump) was shed: B37 above already proves opening a sheet never mutates
// body/html layout at all, which mechanically rules out the
// layout-shift-induced-clamp mechanism B38 guarded. See test-shed-audit.md
// row 9.

test.describe("B39 — over-scrolling the sheet's own content leaks into scrolling the page behind it", () => {
  test("B39: overscrolling past the track's own boundary never moves the underlying page", async ({
    page,
  }) => {
    await page.goto("/");

    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const panel = dialog.locator(".scrollsheet-panel");

    await dialog.locator("[data-scrollsheet-handle]").click();
    await dialog.locator("[data-scrollsheet-handle]").click();
    await waitForStableScrollTop(track);
    await panel.evaluate((el) => {
      el.scrollTop = 0;
    });

    // Baseline captured here, not at page load: this fixtures page is long
    // enough that Playwright's own trigger click above auto-scrolls the page
    // to bring the trigger into view first — an artifact of the fixture's
    // layout, unrelated to the thing this test actually checks (whether
    // *overscrolling the panel* leaks into page scroll).
    const pageBefore = await page.evaluate(() => window.scrollY);

    const panelBox = await panel.boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 50);
    // A large overscroll: enough to exhaust panel's own scroll room AND
    // track's, so any leak into the page would be unambiguous.
    await page.mouse.wheel(0, -2000);
    await page.waitForTimeout(400);

    const pageAfter = await page.evaluate(() => window.scrollY);
    expect(pageAfter).toBe(pageBefore);
  });
});

test.describe("B40 — transient zero viewport dimensions send detent math into a runaway/crash state", () => {
  test("B40: a transient zero clientHeight neither crashes nor hangs, and the sheet recovers cleanly", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    await waitForStableScrollTop(track);

    const result = await page.evaluate(() => {
      const trackEl = document.querySelector(".scrollsheet-track") as HTMLElement;
      const original = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight");
      let hung = false;
      const watchdog = setTimeout(() => {
        hung = true;
      }, 2000);

      Object.defineProperty(trackEl, "clientHeight", { value: 0, configurable: true });
      window.dispatchEvent(new Event("resize"));

      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          if (original) Object.defineProperty(trackEl, "clientHeight", original);
          window.dispatchEvent(new Event("resize"));
          setTimeout(() => {
            clearTimeout(watchdog);
            resolve({ hung });
          }, 300);
        });
      });
    });
    expect(result).toEqual({ hung: false });
    expect(errors).toEqual([]);

    // The sheet must still be fully functional afterward.
    await dialog.locator("[data-scrollsheet-handle]").click();
    const scrollTop = await waitForStableScrollTop(track);
    const viewportHeight = page.viewportSize()!.height;
    expect(Math.abs(scrollTop - Math.round(viewportHeight * 0.7))).toBeLessThanOrEqual(2);
  });
});

test.describe("B41 — auto-resize/height-tracking breaks around resize/orientation-change events", () => {
  test("B41: the sheet re-settles to its active detent's correct height after a viewport resize event, on every engine", async ({
    page,
  }) => {
    // This is the WebKit scrollTop-revert bug found and fixed in
    // src/content.tsx (jumpScroll / el.scrollTo({behavior:'instant'}))
    // during the cross-browser matrix work — before that fix, a raw
    // `track.scrollTop = target.height` write in the relayout effect would
    // silently revert on WebKit within ~50ms, leaving the sheet at a stale
    // height after a resize/orientation-change-class event.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const viewportHeight = page.viewportSize()!.height;

    // Travel to a non-default detent first, so a revert-to-previous-position
    // bug would be observable (reverting to 0.35 would be wrong).
    await dialog.locator("[data-scrollsheet-handle]").click(); // -> 0.7
    await waitForStableScrollTop(track);

    // A resize/orientation-change-class event: dimensions unchanged, but
    // triggers the same relayout() path a real rotation would.
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));

    const scrollTop = await waitForStableScrollTop(track);
    const expected = Math.round(viewportHeight * 0.7);
    expect(Math.abs(scrollTop - expected)).toBeLessThanOrEqual(2);
  });
});

// MUI#5237/#4845 (nameless focus-guard sentinels exposed to WebKit a11y
// tree) demoted to a unit test — pure DOM-attribute-absence query, no
// gesture/animation/dialog-open dependency. See
// tests/unit/dom-shape.test.tsx and test-shed-audit.md row 10.

test.describe("B43 — expanded-toolbar baseline inflates the keyboard estimate", () => {
  test("B43: the pre-focus layout/visual viewport gap is subtracted from the keyboard inset", async ({
    page,
  }) => {
    // Real iPhones report vv.height < innerHeight before any keyboard (the
    // expanded Safari toolbar). `innerHeight - vv.height` alone counts that
    // toolbar as keyboard, lifting the panel past the real keyboard and
    // leaving a strip of page in between. The engine must sample the gap
    // while unfocused and subtract it once armed.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Keyboard");

    // Toolbar expands BEFORE any input is focused: 60px layout/visual gap.
    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight - 60, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });

    await dialog.getByLabel("Demo text input").focus();

    // Keyboard opens: total gap = 60 (toolbar baseline) + 300 (keyboard).
    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight - 360, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });

    const panel = dialog.locator(".scrollsheet-panel");
    await expect(async () => {
      // The inset var, not computed `bottom`: the panel's anchored-edge
      // offset now also carries the kb-hang term (keyboard scrollport
      // geometry), so raw bottom is inset + hang. The var is the engine
      // output these tests exercise; visible geometry has its own spec in
      // keyboard-gaps.spec.ts.
      const kb = await dialog.evaluate((el) =>
        (el as HTMLElement).style.getPropertyValue("--scrollsheet-keyboard"),
      );
      expect(kb).toBe("300px");
    }).toPass({ timeout: SPRING_TIMEOUT });

    // The under-panel overdraw must start at the panel's LIFTED bottom edge,
    // not the canvas bottom — otherwise the page shows through the
    // keyboard-height band under the sheet (and through iOS's translucent
    // keyboard). ::after top is resolved against the canvas, so the lifted
    // edge is canvas height minus the keyboard inset.
    const overdraw = await dialog.locator(".scrollsheet-canvas").evaluate((el) => {
      const cs = getComputedStyle(el, "::after");
      return { top: Number.parseFloat(cs.top), canvasHeight: el.getBoundingClientRect().height };
    });
    expect(Math.round(overdraw.top)).toBe(Math.round(overdraw.canvasHeight - 300));
  });
});

test.describe("B42 — blur/refocus churn while the keyboard stays open corrupts the toolbar baseline", () => {
  test("B42: refocusing the same field with the keyboard never actually closing keeps the full inset", async ({
    page,
  }) => {
    // A re-render can blur then refocus the same field within a frame or two
    // (key change, controlled-value churn, an a11y tool moving focus) while
    // the real on-screen keyboard never closes and the viewport never
    // changes size. The library's own onFocusOut handler treats that instant
    // as "unarmed" and must not mistake the still-keyboard-shrunk viewport
    // for a toolbar-only baseline — the panel would then be re-armed short
    // by whatever it wrongly latched.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Keyboard");
    const input = dialog.getByLabel("Demo text input");
    const panel = dialog.locator(".scrollsheet-panel");

    await input.focus();
    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight - 300, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    await expect(async () => {
      const kb = await dialog.evaluate((el) =>
        (el as HTMLElement).style.getPropertyValue("--scrollsheet-keyboard"),
      );
      expect(kb).toBe("300px");
    }).toPass({ timeout: SPRING_TIMEOUT });

    // Blur, then refocus the SAME field — no resize, no field switch, the
    // simulated keyboard stays exactly as tall as before throughout.
    await input.evaluate((el) => (el as HTMLElement).blur());
    await page.waitForTimeout(100);
    await input.focus();

    // Must land back at the true 300px inset, not undershoot by the toolbar
    // baseline cap (up to KEYBOARD_BASELINE_MAX_PX = 80px).
    await expect(async () => {
      const kb = await dialog.evaluate((el) =>
        (el as HTMLElement).style.getPropertyValue("--scrollsheet-keyboard"),
      );
      expect(kb).toBe("300px");
    }).toPass({ timeout: SPRING_TIMEOUT });
  });
});
