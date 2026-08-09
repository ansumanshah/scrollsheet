import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openToasterByTrigger } from "../helpers";

/**
 * Per-row swipe-to-dismiss (src/toast/shell/use-toast-swipe.ts). The hook
 * binds plain Pointer Events (onPointerDown/Move/Up/Cancel — never gated to
 * touch), so a real `page.mouse` drag exercises the exact same listeners a
 * touch drag would; this lives under desktop/ anyway because a mouse is the
 * more precise way to control drag distance relative to
 * SWIPE_DISMISS_THRESHOLD_PX (45px).
 *
 * No hover-then-wait step here (unlike the old Sheet-backed Toaster's own
 * swipe spec, which needed one to dodge a collapse/expand crossfade
 * remount): every row is a real, persistent, individually interactive DOM
 * node from the moment it mounts — swipe is armed regardless of
 * data-expanded, and there's no crossfade left to race.
 *
 * bottom-right (the fixture's own Toaster position) defaults its own swipe
 * directions to ['bottom', 'right'] (shell/swipe-math.ts's
 * getDefaultSwipeDirections) — a rightward drag is the allowed-direction
 * case these two tests exercise; new coverage for 2-axis/dampening/velocity
 * beyond this is a later stage's job (the port design's own "New coverage"
 * step), not this port.
 */

/**
 * Manual per-step `mouse.move()` calls (not the `steps` option), plus a few
 * repeated moves at the final position before returning — mirrors
 * desktop/drag.spec.ts's own `mouseDrag` helper exactly. Verified
 * empirically (this suite's own investigation) to matter on firefox-desktop
 * specifically: a single `mouse.move(..., {steps})` call there can drop
 * every pointermove after the first and the trailing pointerup along with
 * it, leaving the row's pointer capture stuck rather than releasing
 * cleanly — this shape doesn't.
 */
async function dragTo(
  page: import("@playwright/test").Page,
  startX: number,
  startY: number,
  endX: number,
  steps = 8,
) {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const x = startX + ((endX - startX) * i) / steps;
    await page.mouse.move(x, startY);
  }
  for (let i = 0; i < 4; i++) await page.mouse.move(endX, startY);
}

test.describe("sonner compat: swipe-to-dismiss", () => {
  test("swiping past the 45px threshold dismisses the row", async ({ page }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show toast");

    const row = overlay.locator(".scrollsheet-toast").first();
    // Dual naming (neutral primary + sonner compat, stamped on every
    // element): a migrant's existing `.sonner-toast` selector still matches
    // the SAME row this spec drives via the neutral one.
    await expect(row).toHaveClass(/\bsonner-toast\b/);
    const box = await row.boundingBox();
    if (!box) throw new Error("no bounding box for the toast row");
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await dragTo(page, startX, startY, startX + 60);

    // Mid-drag: the live offset lands directly on --scrollsheet-toast-swipe-x
    // (no React state per move — see use-toast-swipe.ts's own doc comment),
    // and data-swiping="true" disables the CSS transition while live.
    const swipingRow = page.locator('.scrollsheet-toast[data-swiping="true"]');
    await expect(swipingRow).toHaveCount(1);
    const swipeX = await swipingRow.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--scrollsheet-toast-swipe-x"),
    );
    expect(swipeX.trim()).toBe("60px");

    await page.mouse.up();
    // Past SWIPE_DISMISS_THRESHOLD_PX (45): release plays the
    // scrollsheet-toast-swipe-out CSS animation, then fires onSwipeDismiss on
    // animationend — the toast (and, being the only one, the whole
    // toaster) disappears.
    await expect(page.locator("[data-scrollsheet-toaster]")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("swiping less than the 45px threshold, slowly, springs back without dismissing", async ({
    page,
  }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show toast");

    const row = overlay.locator(".scrollsheet-toast").first();
    const box = await row.boundingBox();
    if (!box) throw new Error("no bounding box for the toast row");
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await dragTo(page, startX, startY, startX + 20);
    // Deliberately slow (well under SWIPE_VELOCITY_THRESHOLD too, not just
    // the distance threshold) — this test is specifically about the
    // "neither trigger crossed" case, not the velocity trigger.
    await page.waitForTimeout(300);
    await page.mouse.up();

    // Below both triggers: release() snaps --scrollsheet-toast-swipe-x back
    // to 0 instead of setting data-swipe-out — no dismissal.
    await page.waitForTimeout(300);
    await expect(page.locator("[data-scrollsheet-toaster]")).toHaveCount(1);
    await expect(row).not.toHaveAttribute("data-swipe-out", "true");
    const finalSwipeX = await row.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--scrollsheet-toast-swipe-x"),
    );
    expect(finalSwipeX.trim()).toBe("0px");
  });
});
