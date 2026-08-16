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

test("a tap in the previous presentation never vouches for a reopened sheet's teleport", async ({
  page,
}) => {
  // Review finding 2 (live-reproduced pre-fix): the input stamp survived a
  // close/reopen, so interact → close → reopen → phantom teleport inside
  // the 1.5s window dismissed the fresh presentation. The stamp now resets
  // per attachment.
  //
  // Reduced motion is load-bearing here, not a convenience: with real
  // animations, the earliest tween-free teleport lands ~1.3-1.5s after the
  // stamp — ON the attribution boundary, so the spec would pass with or
  // without the fix depending on machine speed (verified both ways while
  // authoring). Zero-duration legs collapse the cycle to ~300ms, deep
  // inside the window, with the phase machine and classifier untouched
  // (the travel:none/reduced-motion contract).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Reopen fixture");
  await page.waitForTimeout(300); // settled (zero-duration legs)

  // Stamp the latch with an inert synthetic keydown INSIDE the dialog —
  // the latch only needs a DOM input event on the dialog subtree, and a
  // real click here would also wake the drag engine (a zero-distance mouse
  // drag session whose settle races the close below). Test 2 covers the
  // real browser input pipeline; this spec's subject is the stamp's
  // lifetime, not its source. Same evaluate returns the stamp time so the
  // pair is atomic.
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
  // waitForFunction polls on rAF — the expect() matchers' ~100ms poll
  // steps would eat the attribution window this spec races against.
  // NOTE the selector: a titled sheet's dialog carries aria-labelledby,
  // never aria-label (content.tsx's sharedProps), so the dialog is found
  // through the panel's testid, not by label.
  await page.waitForFunction(
    () => !document.querySelector("dialog:has([data-testid='reopen-sheet'])"),
    undefined,
    { timeout: SPRING_TIMEOUT },
  );
  await setOpen(true);
  // state "open" = the enter leg settled: no tween owns the track anymore,
  // and a brief rest absorbs any trailing correction frame.
  await page.waitForFunction(
    () =>
      document
        .querySelector("dialog:has([data-testid='reopen-sheet'])")
        ?.getAttribute("data-scrollsheet-state") === "open",
    undefined,
    { timeout: SPRING_TIMEOUT },
  );
  await page.waitForTimeout(150);

  // The regression only bites while the stale stamp is still inside the
  // attribution window — on a run slow enough to lapse it, the spec can't
  // distinguish fixed from broken, so it declines the verdict instead of
  // hollow-passing (bite verified against the reverted fix at authoring).
  const elapsed = (await page.evaluate(() => performance.now())) - tapAt;
  test.skip(elapsed > 1400, `close/reopen cycle took ${Math.round(elapsed)}ms — stamp went stale`);

  await phantomScrollTo(dialog, 0);
  // Assert the SETTLED outcome, not a snapshot: an immediate
  // state-attribute read races the dismissal (the assertion would catch
  // "open" before the settle processes and pass against broken code —
  // verified while authoring). Let the settle land first, then require
  // the sheet alive and wound back to its detent.
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
  await page.waitForTimeout(1700); // same input-staleness rest as test 1

  await phantomScrollTo(dialog, 0);
  // Identical displacement to test 1 — but with the guard off, the settle
  // judges the position as it always did and the sheet dismisses.
  await expect(dialog).not.toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
});

test("compact sheets stay classifier-exempt: a sub-floor closed-stop hop dismisses (screen-reader parity)", async ({
  page,
}) => {
  // Review finding 1, pinned as DESIGNED behavior, not fixed: a sheet whose
  // resting detent stands under PHANTOM_SCROLL_JUMP_PX has a closed-stop
  // hop geometrically identical to an assistive single-jump dismiss.
  // Winding it back would trap AT users, so the guard stands down there
  // (content-helpers' PHANTOM_SCROLL_JUMP_PX doc). If this spec starts
  // failing, that a11y tradeoff was changed — re-decide it consciously.
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Fill sheet");
  // Shrink the fill'd content to a compact height; the fill-aware
  // ResizeObserver retargets detent measurement to the wrapper.
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
