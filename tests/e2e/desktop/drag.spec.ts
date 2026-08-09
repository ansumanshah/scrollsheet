import { type Locator, type Page, expect, test } from "@playwright/test";

import { WHEEL_SESSION_IDLE_MS } from "../../../packages/scrollsheet/src/motion/wheel-latch";
import {
  SPRING_TIMEOUT,
  hasAttribute,
  openSheetByTrigger,
  waitForStableScrollTop,
} from "../helpers";

/**
 * Desktop-only: mouse drag, wheel, and no-touch-scrollbar behavior. Runs in
 * the 'desktop' Playwright project (1280x800, hasTouch: false) — see
 * playwright.config.ts's testMatch for desktop-*.spec.ts. Mobile/touch
 * gesture coverage lives in the other e2e/*.spec.ts files, which run in the
 * 'chromium' (390x844, hasTouch: true) project instead.
 */

/**
 * page.mouse always synthesizes pointerType 'mouse' — the gate this feature
 * checks. Ends with a few repeated moves at `endY` so the drag's rolling
 * ~100ms velocity sample settles near zero before release — otherwise a
 * fast synthetic drag (steps arrive over just a few ms of real time) can
 * carry enough projected velocity to overshoot past the intended detent.
 */
async function mouseDrag(page: Page, x: number, startY: number, endY: number, steps = 16) {
  await page.mouse.move(x, startY);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const y = startY + ((endY - startY) * i) / steps;
    await page.mouse.move(x, y);
  }
  for (let i = 0; i < 4; i++) await page.mouse.move(x, endY);
  await page.mouse.up();
}

/**
 * `--scrollsheet-max-detent` is the resolved-px source of truth this suite
 * already reads elsewhere (see the existing "wheel scroll settles..." test
 * below) — every wheel-latch fixture used here has exactly one detent, so
 * this doubles as that detent's own height (the latch's firstDetentHeight).
 */
async function readMaxDetent(dialog: Locator): Promise<number> {
  return dialog.evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).getPropertyValue("--scrollsheet-max-detent")),
  );
}

/** Polls a track's scrollTop at a fixed cadence — catches a mid-correction flicker/reversal a before/after settle-value check alone would miss. */
async function sampleScrollTop(
  page: Page,
  track: Locator,
  count: number,
  intervalMs: number,
): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < count; i++) {
    samples.push(await track.evaluate((el) => el.scrollTop));
    await page.waitForTimeout(intervalMs);
  }
  return samples;
}

test.describe("desktop mouse drag", () => {
  test("dragging the panel down past the dismiss threshold closes the sheet", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");

    // Basic sheet's only interactive/text element besides Handle/Close is the
    // Title — a plain <h2>, not in the no-drag exclusion list.
    const title = dialog.getByRole("heading", { name: "Basic", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    // Drag well past half the (small, content-height) first detent — enough
    // margin that this is deterministic without depending on fling velocity.
    await mouseDrag(page, box.x + box.width / 2, box.y + box.height / 2, box.y + 320);

    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("dragging the panel up snaps to the nearest higher detent", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const viewportHeight = page.viewportSize()!.height;

    const title = dialog.getByRole("heading", { name: "Detents", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    // 35% -> comfortably closer to 70% than back to 35% or up to full
    // (full resolves to viewport minus the desktop floating-card margins,
    // which pulls the 70%/full midpoint down — keep the drag clearly short
    // of it).
    await mouseDrag(page, box.x + box.width / 2, box.y + box.height / 2, box.y - 200);

    const scrollTop = await waitForStableScrollTop(track);
    const expected = Math.round(viewportHeight * 0.7);
    expect(Math.abs(scrollTop - expected)).toBeLessThanOrEqual(40);
  });

  test("the sheet follows the pointer mid-drag, not only on release", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const title = dialog.getByRole("heading", { name: "Detents", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");
    const x = box.x + box.width / 2;
    const y0 = box.y + box.height / 2;

    const before = await track.evaluate((el) => el.scrollTop);
    await page.mouse.move(x, y0);
    await page.mouse.down();
    // Mandatory scroll-snap would re-snap each mid-drag scrollTo back to the
    // detent stop, freezing the sheet under the pointer — sample while the
    // button is still held to catch exactly that regression.
    const seen: number[] = [];
    for (let i = 1; i <= 9; i++) {
      await page.mouse.move(x, y0 + i * 15);
      await page.waitForTimeout(30);
      if (i % 3 === 0) seen.push(await track.evaluate((el) => el.scrollTop));
    }
    await page.mouse.up();
    // Every held sample tracked the pointer away from the start position.
    for (const value of seen) expect(before - value).toBeGreaterThanOrEqual(30);
    // And it kept moving between samples (following, not one lucky write).
    expect(seen[2]!).toBeLessThan(seen[0]!);
  });

  test("a horizontal mouse drag over panel text selects it instead of moving the sheet", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");
    const track = dialog.locator(".scrollsheet-track");
    const before = await track.evaluate((el) => el.scrollTop);

    const title = dialog.getByRole("heading", { name: "Basic", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");
    const y = box.y + box.height / 2;

    await page.mouse.move(box.x + 2, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(box.x + 2 + i * 8, y);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();

    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
    expect(selected.length).toBeGreaterThan(0);
    expect(await track.evaluate((el) => el.scrollTop)).toBe(before);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("a drag starting on a button does not move the sheet", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");
    const track = dialog.locator(".scrollsheet-track");
    const before = await track.evaluate((el) => el.scrollTop);

    const closeButton = dialog.getByRole("button", { name: "Close", exact: true });
    const box = await closeButton.boundingBox();
    if (!box) throw new Error("close button bounding box unavailable");

    // A short move, staying within the panel: enough to prove a real drag
    // would have changed scrollTop, without releasing the mouse over the
    // track (which would trigger the unrelated track-click light-dismiss).
    await mouseDrag(page, box.x + box.width / 2, box.y + box.height / 2, box.y - 40);

    const after = await track.evaluate((el) => el.scrollTop);
    expect(after).toBe(before);
    // The sheet is still open — the drag was a no-op, not a dismiss either.
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("wheel still travels detents", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const before = await track.evaluate((el) => el.scrollTop);

    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    await page.mouse.wheel(0, 250);

    await expect
      .poll(async () => track.evaluate((el) => el.scrollTop), { timeout: SPRING_TIMEOUT })
      .not.toBe(before);
  });

  // "the panel's scrollbar is hidden (computed scrollbar-width: none)" was
  // demoted to tests/unit/desktop-handle-spacing.test.tsx — an ungated
  // static CSS rule, no drag mechanics exercised despite living in this
  // file. See test-shed-audit.md row 14.

  /**
   * Desktop-only by design, not just by file location: a mouse wheel doesn't
   * exist as an input source on real mobile Safari, so this only makes sense
   * against desktop engines. Originally tried as a cross-engine probe that
   * also ran on webkit-mobile — wheeling on a touch-emulated WebKit viewport
   * produced flaky, sometimes-wildly-off settle values (native momentum
   * scrolling racing the library's own settle()-triggered animateScrollTo
   * tween), an artifact of mixing an input device with a viewport it never
   * occurs on, not a real bug. Scoped to real desktop engines only, it's
   * reliable and is exactly where the task's "scroll-snap settling
   * differences in Firefox" concern lives — verified: Firefox settles wheel
   * scrolls onto an exact detent stop just as precisely as Chromium (both
   * within the 2px DETENT_TOLERANCE used elsewhere in this suite).
   */
  test("wheel scroll settles exactly on a detent's resolved height, not a rubber-banded neighbor", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const viewportHeight = page.viewportSize()!.height;

    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    // A generous wheel delta well past the 35% detent, so mandatory scroll-snap
    // has to actually resolve a stop rather than rubber-band back to start.
    await page.mouse.wheel(0, 400);

    const scrollTop = await waitForStableScrollTop(track);
    // 'full' resolves against the detent space, which on desktop excludes
    // the floating-card margins — read the real resolved max from the DOM
    // rather than assuming raw viewport height.
    const maxDetent = await dialog.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).getPropertyValue("--scrollsheet-max-detent")),
    );
    const detentHeights = [0.35, 0.7].map((f) => Math.round(viewportHeight * f)).concat(maxDetent);
    const nearest = detentHeights.reduce((a, b) =>
      Math.abs(b - scrollTop) < Math.abs(a - scrollTop) ? b : a,
    );
    // Native mandatory scroll-snap must land the settled scrollTop within a
    // couple px of a real detent stop — not an arbitrary mid-scroll value.
    expect(Math.abs(scrollTop - nearest)).toBeLessThanOrEqual(2);
  });
});

/**
 * Regression: NO_DRAG_SELECTOR includes "button" (deliberately, so a
 * consumer's own buttons in the panel body don't start a drag under a held
 * click) — but Sheet.Handle is itself a <button data-scrollsheet-handle>, so
 * the same guard was silently blocking a drag started from the one
 * affordance whose entire purpose is to be dragged. Fixed in content.tsx's
 * drag-engine pointerdown handler: a pointerdown on/inside the handle is
 * checked first and unconditionally allowed, bypassing both NO_DRAG_SELECTOR
 * and the at-max-with-scrolled-content bail. These fixtures use
 * e2e/fixtures/ (localhost:5799), not the playground, since they only need
 * a Handle and a couple of detents.
 */
test.describe("Handle drag (regression: NO_DRAG_SELECTOR matches Handle's own <button>)", () => {
  // The desktop presentation hides the Handle entirely (drawers close via
  // Escape/backdrop/consumer controls), so these mouse-on-handle tests run
  // just under the 768px breakpoint: mobile presentation, pill visible at
  // the panel's top — which also keeps every drag inside the viewport.
  test.use({ viewport: { width: 760, height: 800 } });

  test("mouse-drag starting on the Handle moves the sheet and snaps back on a short release", async ({
    page,
  }) => {
    // The all-engines regression guard: if NO_DRAG_SELECTOR were blocking
    // the handle again, this drag would never move the track at all.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const handle = dialog.locator("[data-scrollsheet-handle]");
    const box = await handle.boundingBox();
    if (!box) throw new Error("handle bounding box unavailable");
    const track = page.locator(".scrollsheet-track");
    const startScroll = await track.evaluate((el) => el.scrollTop);

    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(x, startY);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x, startY + (40 * i) / 8);
    // The sheet must be following the pointer mid-drag, not sitting inert.
    const midScroll = await track.evaluate((el) => el.scrollTop);
    expect(startScroll - midScroll).toBeGreaterThan(20);
    // Settle the velocity window so release intent is "stopped", then let
    // go: 40px is under half the first detent, so it snaps back open.
    for (let i = 0; i < 4; i++) await page.mouse.move(x, startY + 40);
    await page.mouse.up();
    await waitForStableScrollTop(track);
    expect(await track.evaluate((el) => el.scrollTop)).toBe(startScroll);
    await expect(dialog).toBeVisible();
  });

  test("mouse-drag starting on the Handle, downward past half the first detent, dismisses the sheet", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const handle = dialog.locator("[data-scrollsheet-handle]");
    const box = await handle.boundingBox();
    if (!box) throw new Error("handle bounding box unavailable");

    // First detent is 50% of the 800px viewport (400px) — dragging 300px
    // down clears half of it with real margin. In this describe's mobile
    // presentation the pill sits at the panel's top (~y 410), so the whole
    // gesture stays inside the viewport on every engine — headless
    // Firefox's synthetic pointer corrupts off-viewport moves, which is
    // why these tests must not drag below y=800.
    await mouseDrag(page, box.x + box.width / 2, box.y + box.height / 2, box.y + 300);

    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("a plain click on the Handle (no real movement) still cycles to the next detent", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const track = dialog.locator(".scrollsheet-track");
    const before = await track.evaluate((el) => el.scrollTop);

    const handle = dialog.locator("[data-scrollsheet-handle]");
    // A real click (down+up at ~the same point) — under DRAG_CLICK_SUPPRESS_PX
    // (4px), so the drag engine's own click-suppression never kicks in and
    // the Handle's own onClick (cycle to next detent) fires normally.
    await handle.click();

    const after = await waitForStableScrollTop(track);
    expect(after).not.toBe(before);
  });

  test("dragging from the Handle works at the max detent, even with the panel's own content scrolled", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Handle drag at max");
    const handle = dialog.locator("[data-scrollsheet-handle]");

    // Expand to the second ("full") detent, where the panel's own long
    // content (60 filler rows) genuinely overflows the viewport.
    await handle.click();
    await expect(dialog).toHaveAttribute("data-scrollsheet-at-max", "", {
      timeout: SPRING_TIMEOUT,
    });

    // Scroll the panel's own internal content down — this is exactly the
    // isAtMaxWithInternalScroll() condition (data-scrollsheet-at-max +
    // panel.scrollTop > 0) that, before the fix, would have bailed out of
    // starting a drag entirely, even from the handle. A *small* offset,
    // deliberately: Handle isn't sticky (it's ordinary in-flow content
    // inside .scrollsheet-body, the same scrollable region as the rest of
    // the panel — see content.tsx's render), so a large scroll would carry
    // it out of view entirely. isAtMaxWithInternalScroll only cares whether
    // scrollTop is *nonzero*, not by how much, so a few px is enough to
    // trigger the exact condition being tested while keeping Handle
    // (~40px hit area) still fully on-screen and clickable.
    const panel = dialog.locator(".scrollsheet-panel");
    await panel.evaluate((el) => {
      el.scrollTop = 10;
    });
    await expect.poll(async () => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    // Drag down by the same magnitude the "past half the first detent" test
    // above uses (also starting from a handle-initiated drag) — release-time
    // dismiss/settle decisions here are driven by the drag's own pointer-
    // position velocity/displacement (see resolveDrag in content.tsx), not by
    // reading back live intermediate scrollTop during the drag itself
    // (mandatory scroll-snap on desktop Chromium silently rejects
    // *programmatic* intermediate scrollTo/scrollTop writes outside a real
    // touch/wheel gesture, confirmed via direct instrumentation — a
    // pre-existing characteristic of every desktop mouse drag in this suite,
    // not something this fix changes or something this test needs to
    // exercise). So the meaningful, robust assertion is the *outcome*: this
    // drag is far more than enough to carry the sheet's projected position
    // below the (400+800)/2 = 600 midpoint between the two detents, so it
    // must settle away from "full" onto the lower one — proving the drag
    // session actually started and responded, exactly the thing
    // isAtMaxWithInternalScroll would have silently blocked pre-fix (in
    // which case the sheet would stay pinned at "full"/at-max forever,
    // no matter how the pointer moved).
    const box = await handle.boundingBox();
    if (!box) throw new Error("handle bounding box unavailable");
    await mouseDrag(page, box.x + box.width / 2, box.y + box.height / 2, box.y + 300);

    await expect(dialog).not.toHaveAttribute("data-scrollsheet-at-max", "", {
      timeout: SPRING_TIMEOUT,
    });
  });
});

/**
 * Wheel-dismiss latch. Single-detent sheets only
 * have two native scroll-snap stops (0 / the one detent), so which one a
 * wheel gesture lands on was decided entirely by the browser's own
 * nearest-stop heuristic (~50% midpoint), leaving closeThreshold silently
 * inert for wheel input. use-drag-engine.ts's onWheel/endWheelSession
 * accumulate the session's own revealed-space delta and correct the outcome
 * once, on a 150ms idle debounce, via the pure resolveWheelLatch
 * (src/motion/wheel-latch.ts). Fixtures: "Wheel latch high threshold"
 * (closeThreshold=0.9, easy to dismiss) and "Wheel latch low threshold"
 * (closeThreshold=0.1, hard to dismiss) — both single detent (0.5), the only
 * shape the gate (resolvedRef.current.length === 1) ever engages for.
 */
test.describe("wheel-dismiss latch", () => {
  test("closeThreshold=0.9: a small wheel nudge that native snap alone would keep open still dismisses", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Wheel latch high threshold");
    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    const maxDetent = await readMaxDetent(dialog);

    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    // Negative deltaY is confirmed (empirically, against this exact
    // fixture) to be the real dismiss direction — it decreases the track's
    // scrollTop toward the 0 ("dismiss") stop; positive deltaY pushes past
    // the already-fully-open boundary instead. ~15% of the detent:
    // comfortably under native mandatory snap's own ~50% nearest-stop
    // midpoint, so native alone re-snaps this back to fully open —
    // closeThreshold=0.9 means the latch should disagree and correct to a
    // real dismiss once the 150ms idle debounce fires.
    await page.mouse.wheel(0, -Math.round(maxDetent * 0.15));

    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    // The settle()-race case (536d0ea) this brief's fix exists for: without
    // the wheel-session marker deferring settle(), a scrollend firing the
    // instant native snap commits to the "0" stop can dismiss before the
    // latch's own accumulated-intent correction ever runs. Run 3x — this
    // must be deterministic, not "usually" pass.
    test(`closeThreshold=0.1: a wheel push most of the way down re-tweens back to the detent and stays open (run ${attempt}/3)`, async ({
      page,
    }) => {
      await page.goto("/");
      const dialog = await openSheetByTrigger(page, "Wheel latch low threshold");
      const track = dialog.locator(".scrollsheet-track");
      const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
      if (!panelBox) throw new Error("panel bounding box unavailable");
      const maxDetent = await readMaxDetent(dialog);

      await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
      // Negative deltaY = real dismiss direction (see the first test's
      // comment above). ~65% of the detent: well past native mandatory
      // snap's own ~50% midpoint, so native alone commits fully to the
      // dismiss ("0") stop — but the user's own gesture only crossed 65%,
      // still comfortably above closeThreshold=0.1's much stricter bar. The
      // dialog must never actually unmount; a later correction can't undo a
      // real dismiss.
      await page.mouse.wheel(0, -Math.round(maxDetent * 0.65));

      // The dialog must exist throughout — poll immediately rather than
      // only at the end, so a premature dismiss can't hide behind a later
      // reopen-shaped assertion.
      await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(1);
      await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");

      // Converges-to-detent, not first-stable-position: a throttled worker
      // window (Firefox clamps rAF AND timers when occluded) legitimately
      // rests at the wrong stop for a few hundred ms before the latch's
      // clamped timers land the correction — invisible in any real window,
      // and a genuine regression (wrong dismiss, missing correction) never
      // converges at all, so nothing this test exists for slips through.
      await expect
        .poll(async () => track.evaluate((el) => el.scrollTop), { timeout: SPRING_TIMEOUT * 3 })
        .toBeGreaterThanOrEqual(maxDetent - 3);
      await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
    });
  }

  test("the correction re-tween approaches its target without flicker (bounded position reversals)", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Wheel latch low threshold");
    const track = dialog.locator(".scrollsheet-track");
    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    const maxDetent = await readMaxDetent(dialog);

    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    await page.mouse.wheel(0, -Math.round(maxDetent * 0.65));

    // Samples every 25ms for 1s — spans the 150ms idle debounce plus the
    // correction's own re-tween (~500ms spring).
    const samples = await sampleScrollTop(page, track, 40, 25);

    // From the deepest (closest-to-dismiss) sample onward, position must
    // climb back toward the detent — no back-and-forth ("double tween")
    // once the correction takes over. A couple of px of noise is tolerated
    // (sub-frame sampling jitter), a real reversal is not.
    const trough = Math.min(...samples);
    const troughIndex = samples.indexOf(trough);
    let reversals = 0;
    for (let i = troughIndex + 1; i < samples.length; i++) {
      if (samples[i]! < samples[i - 1]! - 2) reversals++;
    }
    expect(reversals).toBe(0);
    expect(samples[samples.length - 1]!).toBeGreaterThan(trough);
  });

  test("multi-detent sheets ignore the wheel latch — native scroll-snap governs, unchanged", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    const viewportHeight = page.viewportSize()!.height;

    // Same wheel magnitude as the existing "wheel scroll settles exactly on
    // a detent's resolved height" test above — the before/after-this-brief
    // pairing for the same fixture.
    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    await page.mouse.wheel(0, 400);

    // Read immediately, before the 150ms debounce could have cleared it —
    // the gate (resolvedRef.current.length === 1) lives inside onWheel,
    // before the marker is ever set, so a multi-detent sheet must never see
    // it at all, not just settle back to a state where it looks unset.
    expect(await hasAttribute(dialog, "data-scrollsheet-wheel-session")).toBe(false);

    const scrollTop = await waitForStableScrollTop(track);
    const maxDetent = await dialog.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).getPropertyValue("--scrollsheet-max-detent")),
    );
    const detentHeights = [0.35, 0.7].map((f) => Math.round(viewportHeight * f)).concat(maxDetent);
    const nearest = detentHeights.reduce((a, b) =>
      Math.abs(b - scrollTop) < Math.abs(a - scrollTop) ? b : a,
    );
    expect(Math.abs(scrollTop - nearest)).toBeLessThanOrEqual(2);
  });

  test("an already-correct wheel outcome is a no-op — no extra tween on top of native's own settle", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Wheel latch low threshold");
    const track = dialog.locator(".scrollsheet-track");
    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    const maxDetent = await readMaxDetent(dialog);

    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    // A tiny nudge in the real dismiss direction (negative deltaY): native
    // re-snaps back to fully open on its own, and closeThreshold=0.1 agrees
    // (revealed stays far above the threshold) — endWheelSession's own
    // comparison must be a same-outcome no-op, not a redundant startTween on
    // top of native's already-correct settle.
    await page.mouse.wheel(0, -Math.round(maxDetent * 0.05));

    const settled = await waitForStableScrollTop(track);
    expect(Math.abs(settled - maxDetent)).toBeLessThanOrEqual(3);

    // Give the idle debounce (and then some) a chance to fire its no-op
    // comparison, then confirm the position genuinely never moves again —
    // a "double tween" would show up as a second departure-then-return.
    await page.waitForTimeout(WHEEL_SESSION_IDLE_MS + 250);
    expect(await track.evaluate((el) => el.scrollTop)).toBe(settled);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("rapid successive wheel sessions are judged independently, not accumulated across the idle gap", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");
    const track = dialog.locator(".scrollsheet-track");
    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    const maxDetent = await readMaxDetent(dialog);

    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    // Each nudge alone reveals ~70% remaining — comfortably above the
    // default closeThreshold=0.5, so neither session should dismiss on its
    // own. If the two sessions were wrongly accumulated across the pause
    // (no real debounce reset), the combined ~60% drop would cross below
    // 0.5 and dismiss on the second. Negative deltaY = real dismiss
    // direction (see the first test above's comment) — each session settles
    // back to maxDetent independently, proving the debounce boundary resets
    // rather than a running total surviving the pause.
    await page.mouse.wheel(0, -Math.round(maxDetent * 0.3));
    await page.waitForTimeout(WHEEL_SESSION_IDLE_MS + 150);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
    const firstSettled = await waitForStableScrollTop(track);
    expect(Math.abs(firstSettled - maxDetent)).toBeLessThanOrEqual(3);

    await page.mouse.wheel(0, -Math.round(maxDetent * 0.3));
    await page.waitForTimeout(WHEEL_SESSION_IDLE_MS + 150);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
    const secondSettled = await waitForStableScrollTop(track);
    expect(Math.abs(secondSettled - maxDetent)).toBeLessThanOrEqual(3);
  });

  test("the wheel-session marker doesn't stick — a later open/close cycle settles normally", async ({
    page,
  }) => {
    await page.goto("/");
    let dialog = await openSheetByTrigger(page, "Basic sheet");
    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    const maxDetent = await readMaxDetent(dialog);

    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    await page.mouse.wheel(0, -Math.round(maxDetent * 0.3));
    await page.waitForTimeout(WHEEL_SESSION_IDLE_MS + 150);
    // Marker hygiene: cleared on every endWheelSession exit path — a stuck
    // marker would suppress settle() (content.tsx) for the rest of the
    // session, exactly the bug the marker's own removeAttribute calls guard
    // against.
    expect(await hasAttribute(dialog, "data-scrollsheet-wheel-session")).toBe(false);

    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });

    dialog = await openSheetByTrigger(page, "Basic sheet");
    const title = dialog.getByRole("heading", { name: "Basic", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");
    // A normal drag well past the dismiss threshold must still work,
    // proving settle() isn't permanently suppressed by a stale marker left
    // over from the earlier wheel session.
    await mouseDrag(page, box.x + box.width / 2, box.y + box.height / 2, box.y + 320);
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("a non-dismissible sheet never enters a wheel session — no marker, no snap suspension, rests on its detent", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Non-dismissible wheel sheet");
    const track = dialog.locator(".scrollsheet-track");
    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    const maxDetent = await readMaxDetent(dialog);

    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    await page.mouse.wheel(0, -Math.round(maxDetent * 0.65));
    // The latch stays entirely out for dismissible={false}: a session that
    // suspended snap here could leave the sheet resting off-detent with
    // nothing to snap it back, a broken state for a sheet the API promises
    // cannot be dismissed.
    expect(await hasAttribute(dialog, "data-scrollsheet-wheel-session")).toBe(false);
    await page.waitForTimeout(WHEEL_SESSION_IDLE_MS + 200);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
    await expect
      .poll(async () => track.evaluate((el) => el.scrollTop), { timeout: SPRING_TIMEOUT * 3 })
      .toBeGreaterThanOrEqual(maxDetent - 3);
    const snapType = await track.evaluate((el) => (el as HTMLElement).style.scrollSnapType);
    expect(snapType).toBe("");
  });

  test("wheel ticks during a live pointer drag are ignored — the drag's resolution stands", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Wheel latch low threshold");
    const track = dialog.locator(".scrollsheet-track");
    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    const maxDetent = await readMaxDetent(dialog);
    const x = panelBox.x + panelBox.width / 2;
    const startY = panelBox.y + 10;

    // Hold a small mouse drag open, spin the wheel mid-drag (an ordinary
    // physical action), then release without crossing any threshold. The
    // wheel's accumulated delta would judge "dismiss-ward" on its own; it
    // must never get its own session while the drag owns the gesture.
    await page.mouse.move(x, startY);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x, startY + i * 4);
    await page.mouse.wheel(0, -Math.round(maxDetent * 0.65));
    expect(await hasAttribute(dialog, "data-scrollsheet-wheel-session")).toBe(false);
    for (let i = 8; i >= 1; i--) await page.mouse.move(x, startY + i * 4);
    await page.mouse.up();

    await page.waitForTimeout(WHEEL_SESSION_IDLE_MS + 300);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
    await expect
      .poll(async () => track.evaluate((el) => el.scrollTop), { timeout: SPRING_TIMEOUT * 3 })
      .toBeGreaterThanOrEqual(maxDetent - 3);
  });
});

/**
 * Regression: a wheel tick arms use-drag-engine.ts's wheelTimer (fires
 * endWheelSession WHEEL_SESSION_IDLE_MS later), but nothing clears it when a
 * *different* input session — a pointer drag — starts and resolves before
 * that timer fires. beginDragSession/resolveDrag clear `dragging` and
 * `data-scrollsheet-dragging` synchronously, which are the only guards
 * endWheelSession checks besides phase — so a drag that resolves to "stay
 * open, phase still 'open'" leaves the stale timer free to fire later and
 * judge the *wheel* gesture's own (now superseded) accumulated delta against
 * wherever the drag left the sheet. Sub-768px viewport so the Handle is
 * actually visible/draggable (desktop-width hides it — see the "Handle
 * drag" describe block above for the same override).
 */
test.describe("wheel + drag handoff (regression: stale wheel-session timer not cleared by a drag)", () => {
  test.use({ viewport: { width: 760, height: 800 } });

  test("a drag that resolves before the wheel idle window fires must not be overridden by a stale wheel-session timer", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Wheel latch high threshold");
    const track = dialog.locator(".scrollsheet-track");
    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    const maxDetent = await readMaxDetent(dialog);
    const handle = dialog.locator("[data-scrollsheet-handle]");
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error("handle bounding box unavailable");

    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    // Deliberately POSITIVE deltaY here, not the real dismiss direction used
    // by the "closeThreshold=0.9" test above (see that test's comment) — a
    // separate wiring bug (wheelAccumulated's sign, see this file's report)
    // means only positive-deltaY wheel gestures can currently reach a
    // latch-computed "dismiss" at all. This test targets a *different* bug
    // (the stale timer), so it needs a gesture that reaches "dismiss" under
    // current code, whichever direction that happens to be. closeThreshold
    // =0.9: this nudge alone (no follow-up drag) resolves to a real dismiss
    // once ITS OWN 150ms idle timer fires. Here it's immediately followed by
    // a real pointer drag that resolves the sheet on its own, well before
    // that timer would fire — minimal moves, no artificial waits, so the
    // whole grab-drag-release completes in a handful of ms, comfortably
    // inside the 150ms window the wheel timer is racing against.
    await page.mouse.wheel(0, Math.round(maxDetent * 0.15));

    const hx = handleBox.x + handleBox.width / 2;
    const hy = handleBox.y + handleBox.height / 2;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    // Comfortably past maxDetent (clamped) — the drag's own release tween
    // has ~0 distance left to travel, so there's no extended mid-flight
    // window for the stale timer to race against a still-animating tween.
    await page.mouse.move(hx, hy - 200);
    await page.mouse.move(hx, hy - 200);
    await page.mouse.up();

    // Let the release settle before taking the baseline: an immediate raw
    // read races the release's own snap tween (the wheel tick above can
    // leave the drag short of clamp, so release has real distance), and any
    // settle drift after that read is indistinguishable from the override
    // this test hunts. The dialog-present assertions below carry regression
    // detection on their own — the stale timer's resolved outcome here is a
    // dismiss — so a stale-timer fire during this settle wait is still
    // caught; the baseline only pins against a late correction tween.
    const rightAfterDrag = await waitForStableScrollTop(track);

    // Wait well past the wheel session's own 150ms idle window — if the
    // timer armed by the earlier wheel tick was never cleared when the drag
    // began, it fires here and overrides the drag's already-resolved
    // outcome (a late setOpen(false), or a late correction tween moving the
    // track again). Generous enough to also cover a full exit spring
    // (~500ms) landing the dialog fully removed, not just mid-animation.
    await page.waitForTimeout(WHEEL_SESSION_IDLE_MS + 600);

    const stillPresent = await page.locator("dialog.scrollsheet-dialog").count();
    expect(stillPresent, "dialog was late-dismissed by a stale wheel-session timer").toBe(1);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
    expect(
      await track.evaluate((el) => el.scrollTop),
      "track position moved again after the drag had already resolved it",
    ).toBe(rightAfterDrag);
  });
});
