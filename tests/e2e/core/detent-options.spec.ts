import { type Locator, type Page, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger, waitForStableScrollTop } from "../helpers";

/**
 * The v0.4 detent-behavior props: largestUndimmedDetent, handleOnly,
 * disableDrag, sequentialDetents, closeThreshold, onRelease. Each fixture
 * lives in e2e/fixtures/app.tsx, next to the feature it exercises.
 *
 * A mandatory-scroll-snap container on Chromium silently rejects
 * intermediate programmatic scrollTo() writes issued outside a real
 * touch/wheel gesture (confirmed via direct instrumentation, same
 * characteristic desktop-drag.spec.ts documents) — a synthetic page.mouse
 * drag's per-move jumpScroll() calls never visibly move `track.scrollTop`
 * mid-gesture. Every outcome here is therefore checked via the drag's real
 * *effect* (data-scrollsheet-dragging while the pointer is held,
 * dismiss/stay-open on release, onRelease's own payload) rather than reading
 * back scrollTop mid-drag, and closeThreshold — which needs a precise
 * *resting* revealed position, not a velocity projection — is driven
 * straight through the native-scroll settle() path (scrollTop + a synthetic
 * `scrollend`, the same technique detents.spec.ts's dismiss test uses)
 * instead of a mouse drag at all.
 */

/**
 * page.mouse always synthesizes pointerType 'mouse' (the drag engine's gate
 * for it), so this works regardless of a project's hasTouch setting — same
 * pattern desktop-drag.spec.ts uses, just not restricted to the desktop-only
 * projects since these tests don't depend on a specific viewport size.
 * Repeated moves at `endY` let the rolling velocity sample settle near zero
 * before release, for a controlled (not fling-driven) outcome.
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
 * Same shape as `mouseDrag`, plus a mid-gesture read of
 * `data-scrollsheet-dragging` right after the pointer starts moving (before
 * release) — the only reliable proof a drag session actually *started*,
 * given scrollTop itself doesn't move mid-gesture (see the file doc comment
 * above). Returns whether the attribute was present at that midpoint.
 */
async function mouseDragChecked(
  page: Page,
  dialog: Locator,
  x: number,
  startY: number,
  endY: number,
  steps = 16,
): Promise<boolean> {
  await page.mouse.move(x, startY);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const y = startY + ((endY - startY) * i) / steps;
    await page.mouse.move(x, y);
  }
  const draggingMidGesture = await dialog.evaluate((el) =>
    el.hasAttribute("data-scrollsheet-dragging"),
  );
  for (let i = 0; i < 4; i++) await page.mouse.move(x, endY);
  await page.mouse.up();
  return draggingMidGesture;
}

/**
 * A real touch gesture via CDP `Input.dispatchTouchEvent` — unlike
 * `page.touchscreen` (tap only, no drag primitive) or `element.dispatchEvent`
 * (synthetic PointerEvents that bypass the browser's native touch-action
 * gesture pipeline entirely — confirmed against the CSS Touch Action spec
 * during the review this helper's tests fix a finding from), this drives
 * the actual input path a real finger would, through Chromium's normal
 * touch-to-pointer-event pipeline, so `touch-action` CSS is genuinely
 * honored. Chromium (CDP) only — every caller below skips on other engines.
 */
async function cdpTouchDrag(
  page: Page,
  x: number,
  startY: number,
  endY: number,
  steps = 16,
): Promise<void> {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: startY }],
    });
    for (let i = 1; i <= steps; i++) {
      const y = startY + ((endY - startY) * i) / steps;
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y }],
      });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await client.detach().catch(() => {});
  }
}

test.describe("largestUndimmedDetent", () => {
  test("backdrop stays opacity 0 at the undimmed threshold detent", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Undimmed backdrop sheet");
    // Opens at the first detent (0.3), exactly the largestUndimmedDetent value.
    const backdrop = dialog.locator(".scrollsheet-backdrop");
    await expect(backdrop).toHaveCSS("opacity", "0");
  });

  test("backdrop dims once the sheet travels above the threshold detent", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Undimmed backdrop sheet");
    const track = dialog.locator(".scrollsheet-track");
    const backdrop = dialog.locator(".scrollsheet-backdrop");

    // Handle click cycles 0.3 -> 0.6 -> full -> back to 0.3 — 0.6 is the next
    // resolved detent above the 0.3 undimmed threshold, so dim range is
    // fully covered by the time it lands there (progress reaches 1).
    await dialog.locator("[data-scrollsheet-handle]").click();
    await waitForStableScrollTop(track);

    const opacity = await backdrop.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).opacity),
    );
    expect(opacity).toBeGreaterThan(0.9);
  });
});

test.describe("vaul: fadeFromIndex", () => {
  test("omitted (with snapPoints set) defaults to the topmost snap point — backdrop stays transparent until then", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Drawer fadeFromIndex omitted sheet");
    const track = dialog.locator(".scrollsheet-track");
    const backdrop = dialog.locator(".scrollsheet-backdrop");

    // Opens at the first snap point (0.3) — real vaul's own default
    // (fadeFromIndex = snapPoints.length - 1, resolving to the last snap
    // point, 1) keeps the backdrop fully transparent here.
    await expect(backdrop).toHaveCSS("opacity", "0");

    // Handle click cycles 0.3 -> 0.6 -> 1 -> back to 0.3 — still transparent
    // at 0.6, the middle snap point, well below the (omitted) undimmed
    // threshold.
    const handle = dialog.locator("[data-scrollsheet-handle]");
    await handle.click();
    await waitForStableScrollTop(track);
    await expect(backdrop).toHaveCSS("opacity", "0");

    // Only dims once past 0.6, approaching the topmost (1) snap point —
    // the inverted-migration finding this locks in: before the fix, an
    // omitted fadeFromIndex left largestUndimmedDetent unset, which dims
    // from the very first pixel of travel instead.
    await handle.click();
    await waitForStableScrollTop(track);
    const opacity = await backdrop.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).opacity),
    );
    expect(opacity).toBeGreaterThan(0.9);
  });
});

test.describe("handleOnly", () => {
  test("a mouse drag on the panel body never starts a drag session", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Handle only sheet");
    const title = dialog.getByRole("heading", { name: "Handle only", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    const draggingMidGesture = await mouseDragChecked(
      page,
      dialog,
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.y + 300,
    );

    expect(draggingMidGesture).toBe(false);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("a mouse drag starting on the Handle starts a session and still dismisses", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Handle only sheet");
    const handle = dialog.locator("[data-scrollsheet-handle]");
    const box = await handle.boundingBox();
    if (!box) throw new Error("handle bounding box unavailable");

    const draggingMidGesture = await mouseDragChecked(
      page,
      dialog,
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.y + 300,
    );

    expect(draggingMidGesture).toBe(true);
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });
});

/**
 * handleOnly, modal touch: core.css's touch-action:none on track/canvas
 * (not just the panel) plus use-drag-engine.ts's allowedPointer handle
 * exemption — the fix for the "trivially bypassable via the uncovered
 * canvas strip" and "the handle carve-out is inert" findings. Needs a real
 * browser-level touch gesture (CDP `Input.dispatchTouchEvent`), which
 * respects `touch-action`, unlike a synthetic `dispatchEvent` — Chromium
 * only, so every test here is chromium-mobile-only (the mobile viewport
 * this file already runs under).
 */
test.describe("handleOnly modal touch", () => {
  test("a touch swipe on the panel body (not the handle) never moves the sheet", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "CDP touch dispatch requires Chromium.");
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Handle only sheet");
    const track = dialog.locator(".scrollsheet-track");
    const before = await track.evaluate((el) => el.scrollTop);

    const title = dialog.getByRole("heading", { name: "Handle only", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    // touch-action:none on track/canvas (core.css) blocks native scroll-snap
    // entirely, and allowedPointer (use-drag-engine.ts) only lets the JS
    // engine drive a touch that starts on the handle — a body swipe reaches
    // neither path, so the sheet must stay exactly where it opened.
    await cdpTouchDrag(page, box.x + box.width / 2, box.y + box.height / 2, box.y - 300);

    const after = await track.evaluate((el) => el.scrollTop);
    expect(after).toBe(before);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("a touch swipe starting on the Handle moves the sheet to the next detent", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "CDP touch dispatch requires Chromium.");
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Handle only sheet");
    const handle = dialog.locator("[data-scrollsheet-handle]");
    const box = await handle.boundingBox();
    if (!box) throw new Error("handle bounding box unavailable");

    // Opens at the 0.5 detent; a substantial upward swipe from the handle
    // should carry it to 'full' — also this fixture's tallest/max detent.
    await cdpTouchDrag(page, box.x + box.width / 2, box.y + box.height / 2, box.y - 400);

    await expect(dialog).toHaveAttribute("data-scrollsheet-at-max", "", {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("at max detent, a touch swipe on the panel's own content still scrolls it", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "CDP touch dispatch requires Chromium.");
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Handle only sheet");
    const handle = dialog.locator("[data-scrollsheet-handle]");
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error("handle bounding box unavailable");

    // Reach max detent via the handle first (the previous test's path).
    await cdpTouchDrag(
      page,
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
      handleBox.y - 400,
    );
    await expect(dialog).toHaveAttribute("data-scrollsheet-at-max", "", {
      timeout: SPRING_TIMEOUT,
    });

    const panel = dialog.locator(".scrollsheet-panel");
    const before = await panel.evaluate((el) => el.scrollTop);

    // A swipe on the panel's own (now-scrollable, 60-row) content: at max
    // detent, track/canvas's touch-action:none rule no longer applies (it's
    // scoped :not([data-scrollsheet-at-max]) — see core.css), so the panel's
    // own explicit touch-action:pan-y takes over uncontested and a real
    // finger scrolls the content natively.
    const title = dialog.getByRole("heading", { name: "Handle only", exact: true });
    const titleBox = await title.boundingBox();
    if (!titleBox) throw new Error("title bounding box unavailable");
    await cdpTouchDrag(
      page,
      titleBox.x + titleBox.width / 2,
      titleBox.y + titleBox.height / 2,
      titleBox.y - 300,
    );

    await expect.poll(async () => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
  });
});

test.describe("disableDrag", () => {
  test("blocks a mouse drag on the panel body — no session ever starts", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Disable drag sheet");
    const title = dialog.getByRole("heading", { name: "Disable drag", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    const draggingMidGesture = await mouseDragChecked(
      page,
      dialog,
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.y + 300,
    );

    expect(draggingMidGesture).toBe(false);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("also blocks a mouse drag starting on the Handle — handle included", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Disable drag sheet");
    const handle = dialog.locator("[data-scrollsheet-handle]");
    const box = await handle.boundingBox();
    if (!box) throw new Error("handle bounding box unavailable");

    const draggingMidGesture = await mouseDragChecked(
      page,
      dialog,
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.y + 300,
    );

    expect(draggingMidGesture).toBe(false);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });
});

test.describe("sequentialDetents", () => {
  test("a hard fling from the first detent lands on the adjacent detent, not full", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Sequential detents sheet");
    const track = dialog.locator(".scrollsheet-track");
    const viewportHeight = page.viewportSize()!.height;

    const title = dialog.getByRole("heading", { name: "Sequential detents", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    // A fast, un-damped upward flick (no settling moves at the end, unlike
    // mouseDrag above) — the drag helper's own multi-step move already
    // covers 35% -> 70%/full territory; skipping the damping tail preserves
    // fling velocity so, without clamping, this would project well past
    // "full". detents=[0.35, 0.7, 'full']: 0.7 is the only valid landing.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 500, { steps: 4 });
    await page.mouse.up();

    const scrollTop = await waitForStableScrollTop(track);
    const expected = Math.round(viewportHeight * 0.7);
    expect(Math.abs(scrollTop - expected)).toBeLessThanOrEqual(2);
  });
});

test.describe("closeThreshold", () => {
  // An *undamped* drag (no settling moves at the end, unlike `mouseDrag`
  // above) — release-time velocity, not `revealed`'s frozen starting
  // position (see the file doc comment), is what resolveDrag's projection
  // actually judges here. The fixture uses an extreme closeThreshold (0.99,
  // not just 0.9) specifically so a *small*, gentle drag reliably crosses
  // its dismiss line on both Chromium and WebKit without also crossing the
  // 0.5 default's much farther one — calibrated empirically against both
  // engines (a magnitude comfortable on one alone tended to be flaky on the
  // other). Same (0.5, 'full') detents on both fixtures, so the threshold is
  // what makes the difference, not the drag.
  const DRAG_PX = 25;

  async function undampedDrag(page: Page, x: number, startY: number, endY: number) {
    await page.mouse.move(x, startY);
    await page.mouse.down();
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x, startY + ((endY - startY) * i) / steps);
    }
    await page.mouse.up();
  }

  test("closeThreshold=0.99 dismisses from a release the 0.5 default would have kept open", async ({
    page,
  }) => {
    await page.goto("/");

    const defaultDialog = await openSheetByTrigger(page, "Full height sheet");
    const defaultTitle = defaultDialog.getByRole("heading", { name: "Full height", exact: true });
    const defaultBox = await defaultTitle.boundingBox();
    if (!defaultBox) throw new Error("title bounding box unavailable");
    await undampedDrag(
      page,
      defaultBox.x + defaultBox.width / 2,
      defaultBox.y + defaultBox.height / 2,
      defaultBox.y + DRAG_PX,
    );
    await expect(defaultDialog).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });

    const thresholdDialog = await openSheetByTrigger(page, "Close threshold sheet");
    const thresholdTitle = thresholdDialog.getByRole("heading", {
      name: "Close threshold",
      exact: true,
    });
    const thresholdBox = await thresholdTitle.boundingBox();
    if (!thresholdBox) throw new Error("title bounding box unavailable");
    await undampedDrag(
      page,
      thresholdBox.x + thresholdBox.width / 2,
      thresholdBox.y + thresholdBox.height / 2,
      thresholdBox.y + DRAG_PX,
    );
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });
});

test.describe("onRelease", () => {
  test("fires with willRemainOpen=true when the release keeps the sheet open", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "onRelease sheet");
    const title = dialog.getByRole("heading", { name: "onRelease", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    // A short drag, well short of the dismiss threshold.
    await mouseDrag(page, box.x + box.width / 2, box.y + box.height / 2, box.y - 20);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");

    const calls = await page.evaluate(
      () =>
        (window as unknown as { __onReleaseCalls: Array<{ willRemainOpen: boolean }> })
          .__onReleaseCalls,
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]!.willRemainOpen).toBe(true);
  });

  test("fires with willRemainOpen=false when the release dismisses the sheet", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "onRelease sheet");
    const title = dialog.getByRole("heading", { name: "onRelease", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    await mouseDrag(page, box.x + box.width / 2, box.y + box.height / 2, box.y + 320);
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });

    const calls = await page.evaluate(
      () =>
        (window as unknown as { __onReleaseCalls: Array<{ willRemainOpen: boolean }> })
          .__onReleaseCalls,
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]!.willRemainOpen).toBe(false);
  });
});
