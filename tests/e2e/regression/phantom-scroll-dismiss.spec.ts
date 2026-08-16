import { expect, test } from "@playwright/test";

import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * Regression: settle() used to trust ANY settling scroll position, so a
 * scroll nobody performed could dismiss an open sheet. Found live
 * 2026-08-16 in liars.party's question tray: Playwright's own actionability
 * pass (CDP scrollIntoViewIfNeeded, confused by device-scale emulation)
 * shoved the mandatory-snap track from its resting detent to scroll 0 in a
 * single programmatic step, the re-snap's scrollend fired at phase "open",
 * and settle() read "below the close threshold" as the user dismissing.
 * The same hole is reachable by find-in-page, focus scrolls, and
 * extensions.
 *
 * The fix is a two-factor phantom classifier (content-helpers'
 * PHANTOM_SCROLL_JUMP_PX + USER_SCROLL_ATTRIBUTION_MS): only a scroll
 * event that BOTH teleports farther than any finger step AND arrives with
 * no recent input on the dialog is wound back to the resting detent.
 * Trains of ordinary steps stay trusted no matter how input-stale, so
 * gestures that produce no DOM input events — a screen reader's scroll, a
 * long native momentum coast — keep dismissing (review findings,
 * 2026-08-16). These specs pin all three sides of that boundary.
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

test("a single-step programmatic scroll to the closed stop does not dismiss", async ({
  page,
}) => {
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
    .poll(
      () => dialog.evaluate((el) => el.querySelector(".scrollsheet-track")?.scrollTop ?? -1),
      { timeout: SPRING_TIMEOUT },
    )
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
  // Review finding (2026-08-16): assistive-tech scrolls and long momentum
  // coasts produce no DOM input events, yet are the user's own deliberate
  // motion — a staleness-only guard would have wound them back and left a
  // handle-less sheet undismissible for those users. The classifier must
  // judge step size, not staleness alone: this walks the track to the
  // closed stop in sub-threshold steps with the latch never stamped, and
  // the sheet must dismiss exactly as it always did.
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
