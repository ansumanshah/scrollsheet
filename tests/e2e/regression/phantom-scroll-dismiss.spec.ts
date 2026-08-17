import { expect, test } from "@playwright/test";

import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * Regression: settle() used to trust ANY settling scroll position, so a
 * scroll nobody performed could dismiss an open sheet — found live when a
 * consumer app's sheet closed itself under Playwright device emulation
 * (CDP scrollIntoViewIfNeeded teleported the mandatory-snap track to the
 * closed stop in one step). Same hole: find-in-page, focus scrolls,
 * extensions.
 *
 * The two-factor classifier (PHANTOM_SCROLL_JUMP_PX +
 * USER_SCROLL_ATTRIBUTION_MS) winds back only a scroll event that BOTH
 * teleports AND arrives input-stale; trains stay trusted so input-eventless
 * gestures (screen readers, momentum coasts) keep dismissing. These specs
 * pin all sides of that boundary.
 */

/** Instantly scroll the sheet's track to a raw offset with no input events —
 *  the same single-step displacement CDP's scrollIntoViewIfNeeded produced. */
async function phantomScrollTo(
  dialog: import("@playwright/test").Locator,
  top: number,
): Promise<void> {
  await dialog.evaluate((el, y) => {
    const track = el.querySelector(".scrollsheet-track");
    if (!track) throw new Error("no .scrollsheet-track");
    track.scrollTo({ top: y, behavior: "instant" });
  }, top);
}

test("a single-step programmatic scroll to the closed stop does not dismiss", async ({ page }) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Basic sheet");
  const restingTop = await dialog.evaluate(
    (el) => el.querySelector(".scrollsheet-track")?.scrollTop ?? -1,
  );
  expect(restingTop).toBeGreaterThan(0);

  // The trigger click lives OUTSIDE the dialog subtree, so the latch has
  // never stamped — this scroll is phantom from t=0. The wait just lets the
  // entrance and its own tweens fully rest first.
  await page.waitForTimeout(1700);
  await phantomScrollTo(dialog, 0);

  // The sheet survives and winds back to its detent instead of closing.
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  await expect
    .poll(() => dialog.evaluate((el) => el.querySelector(".scrollsheet-track")?.scrollTop ?? -1), {
      timeout: SPRING_TIMEOUT,
    })
    .toBeGreaterThan(restingTop - 2);
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
});

test("the same teleport WITH recent touch input is credited to the user and dismisses", async ({
  page,
}) => {
  test.skip(
    test.info().project.use.hasTouch !== true,
    "needs touch input; the touch-enabled projects cover it",
  );
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Basic sheet");
  await page.waitForTimeout(1700); // same full-rest wait as above

  const panel = dialog.locator(".scrollsheet-panel");
  const box = (await panel.boundingBox())!;
  // A real tap on the panel stamps the latch through the browser's own
  // touch pipeline — the identical single-step scroll is now credited.
  await page.touchscreen.tap(box.x + box.width / 2, box.y + 24);
  await phantomScrollTo(dialog, 0);

  await expect(dialog).not.toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
});

test("an input-stale TRAIN of ordinary steps still dismisses (screen-reader / momentum-coast shape)", async ({
  page,
}) => {
  // Staleness alone must never condemn a scroll: assistive-tech gestures
  // and momentum coasts produce no DOM input events. Sub-threshold steps
  // with the latch never stamped must still dismiss.
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Basic sheet");
  await page.waitForTimeout(1700); // ensure input-staleness (latch never stamped anyway)

  await dialog.evaluate(async (el) => {
    const track = el.querySelector(".scrollsheet-track") as HTMLElement | null;
    if (!track) throw new Error("no .scrollsheet-track");
    // 40px steps: well under PHANTOM_SCROLL_JUMP_PX, the shape of a real
    // coast tail or an AT scroll animation. Snap is suspended for the
    // train's duration the same way the drag engine suspends it for a
    // finger — native momentum isn't re-snapped mid-flight either, and
    // without this Chromium's re-snap-after-programmatic-scroll pulls
    // every intermediate step back to a stop (see use-drag-engine's
    // snapSuspended comment) and the train never travels.
    track.style.scrollSnapType = "none";
    for (let top = track.scrollTop; top > 0; top -= 40) {
      track.scrollTo({ top: Math.max(0, top), behavior: "instant" });
      await new Promise((r) => setTimeout(r, 30));
    }
    track.scrollTo({ top: 0, behavior: "instant" });
    track.style.scrollSnapType = "";
  });

  await expect(dialog).not.toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
});

test("a move keeps a held gesture fresh past the attribution window", async ({ page }) => {
  // A continuous >1.5s hold can coalesce a >120px frame under jank; the
  // move events must keep crediting it. Hover moves (buttons: 0) must not.
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Basic sheet");
  await page.waitForTimeout(1700);

  await dialog.evaluate((el) => {
    el.dispatchEvent(new TouchEvent("touchmove", { bubbles: true }));
  });
  await phantomScrollTo(dialog, 0);
  // Credited: the move refreshed the stamp, so the jump dismisses.
  await expect(dialog).not.toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
});

test("a hover move (buttons: 0) never stamps — the guard stays awake under a resting cursor", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Basic sheet");
  const restingTop = await dialog.evaluate(
    (el) => el.querySelector(".scrollsheet-track")?.scrollTop ?? -1,
  );
  await page.waitForTimeout(1700);

  await dialog.evaluate((el) => {
    el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, buttons: 0 }));
  });
  await phantomScrollTo(dialog, 0);
  // Not credited: still phantom, wound back.
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  await expect
    .poll(() => dialog.evaluate((el) => el.querySelector(".scrollsheet-track")?.scrollTop ?? -1), {
      timeout: SPRING_TIMEOUT,
    })
    .toBeGreaterThan(restingTop - 2);
});

test("a tap in the previous presentation never vouches for a reopened sheet's teleport", async ({
  page,
}) => {
  // The stamp resets per presentation. Reduced motion is load-bearing:
  // with real animations the earliest tween-free teleport lands ON the
  // 1.5s attribution boundary, and the spec's verdict would depend on
  // machine speed.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Reopen fixture");
  await page.waitForTimeout(300);

  // Synthetic keydown, not a click: a click also wakes the drag engine,
  // whose settle races the close below. Test 2 covers the real pipeline.
  const tapAt = await dialog.evaluate((el) => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    return performance.now();
  });

  const setOpen = (open: boolean) =>
    page.evaluate(
      (o) =>
        (window as unknown as { __setReopenSheet?: (v: boolean) => void }).__setReopenSheet?.(o),
      open,
    );
  await setOpen(false);
  // rAF-polling waits (expect matchers' ~100ms steps would eat the window).
  // Testid selector: a titled sheet's dialog carries aria-labelledby, not
  // aria-label.
  await page.waitForFunction(
    () => !document.querySelector("dialog:has([data-testid='reopen-sheet'])"),
    undefined,
    { timeout: SPRING_TIMEOUT },
  );
  await setOpen(true);
  await page.waitForFunction(
    () =>
      document
        .querySelector("dialog:has([data-testid='reopen-sheet'])")
        ?.getAttribute("data-scrollsheet-state") === "open",
    undefined,
    { timeout: SPRING_TIMEOUT },
  );
  await page.waitForTimeout(150);

  // Past the window, fixed and broken are indistinguishable — skip, don't
  // hollow-pass.
  const elapsed = (await page.evaluate(() => performance.now())) - tapAt;
  test.skip(elapsed > 1400, `close/reopen cycle took ${Math.round(elapsed)}ms — stamp went stale`);

  await phantomScrollTo(dialog, 0);
  // Settled outcome: an immediate attribute read races the dismissal.
  await page.waitForTimeout(500);
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", { timeout: 1000 });
  await expect
    .poll(() => dialog.evaluate((el) => el.querySelector(".scrollsheet-track")?.scrollTop ?? -1), {
      timeout: SPRING_TIMEOUT,
    })
    .toBeGreaterThan(0);
});

test("phantomScrollGuard={false} restores pre-guard trust in any settling position", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Guard opt-out sheet");
  await page.waitForTimeout(1700); // input-staleness rest

  await phantomScrollTo(dialog, 0);
  await expect(dialog).not.toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
});

test("compact sheets stay classifier-exempt: a sub-floor closed-stop hop dismisses (screen-reader parity)", async ({
  page,
}) => {
  // DESIGNED behavior, not a gap: sub-floor hops are indistinguishable
  // from an assistive single-jump dismiss (PHANTOM_SCROLL_JUMP_PX doc).
  // If this fails, the a11y tradeoff was changed — re-decide it.
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Fill sheet");
  await dialog.evaluate((el) => {
    const wrapper = el.querySelector<HTMLElement>("[data-testid='fill-wrapper']");
    if (!wrapper) throw new Error("no fill-wrapper");
    wrapper.style.height = "90px";
    wrapper.style.minHeight = "0";
  });
  await expect
    .poll(() => dialog.evaluate((el) => el.querySelector(".scrollsheet-track")?.scrollTop ?? -1), {
      timeout: SPRING_TIMEOUT,
    })
    .toBeLessThan(121);
  await page.waitForTimeout(1700); // input-staleness rest

  const restingTop = await dialog.evaluate(
    (el) => el.querySelector(".scrollsheet-track")?.scrollTop ?? -1,
  );
  expect(restingTop).toBeGreaterThan(0);
  expect(restingTop).toBeLessThan(121);

  await phantomScrollTo(dialog, 0);
  await expect(dialog).not.toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
});
