import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openToasterByTrigger } from "../helpers";

/**
 * sonner compat: hover-driven expand needs a real mouse (mobile-viewport
 * projects run with hasTouch and no reliable hover), so this lives in its
 * own desktop-* spec — see playwright.config.ts's testMatch for desktop-*.
 *
 * Every toast is a real, persistent row from the moment it mounts — no
 * decorative ghosts, no collapsed-front-card-plus-ghosts swap. Hovering the
 * `<ol data-sonner-toaster>` just flips `data-expanded` on the already-
 * mounted rows: a non-front, collapsed row's own content is blanked via CSS
 * (`.sonner-toast[data-front="false"][data-expanded="false"] > *
 * {opacity:0}`), and expanding un-blanks it in place — never a remount,
 * never a crossfade between two different DOM shapes.
 */

test.describe("sonner compat: expand on hover", () => {
  test("hovering the stack expands every row, revealing each one's own full content", async ({
    page,
  }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show many toasts");
    await expect(
      overlay.locator('.sonner-toast[data-front="false"][data-expanded="false"]'),
    ).toHaveCount(2);

    await overlay.locator(".sonner-toast").first().hover();

    await expect(overlay.locator('.sonner-toast[data-expanded="true"]')).toHaveCount(3);
    // Newest-first: the same order the collapsed front card already implied
    // via data-index — DOM order never changes between collapsed/expanded,
    // only which rows' own content is blanked.
    await expect(overlay.locator(".sonner-toast-title")).toHaveText(["Third", "Second", "First"]);
  });

  test("closing one expanded row leaves the others exactly as they were", async ({ page }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show many toasts");
    await overlay.locator(".sonner-toast").first().hover();
    await expect(overlay.locator(".sonner-toast-title")).toHaveText(["Third", "Second", "First"]);

    const secondRow = overlay.locator(".sonner-toast").filter({ hasText: "Second" });
    // dispatchEvent, not click(): a real click() moves the mouse across the
    // toaster first — harmless here (it's already hovered/expanded), but
    // dispatchEvent keeps this test's own intent (close ONE row, check the
    // rest) isolated from any incidental pointer-boundary confound.
    await secondRow.locator(".sonner-toast-close").dispatchEvent("click");

    // Scoped to live (non-exiting) rows: "Second" plays its own EXIT_MS
    // exit-hold (data-removed) on its own already-mounted node rather than
    // unmounting immediately.
    const liveTitles = overlay.locator(".sonner-toast:not([data-removed]) .sonner-toast-title");
    await expect(liveTitles).toHaveText(["Third", "First"]);
  });

  test("moving the mouse away re-collapses every row back to blanked chrome", async ({ page }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show many toasts");
    await overlay.locator(".sonner-toast").first().hover();
    await expect(overlay.locator('.sonner-toast[data-expanded="true"]')).toHaveCount(3);

    // Chromium's synthetic pointer boundary events (CDP
    // Input.dispatchMouseEvent) are flaky for a mouse.move() issued
    // immediately after a hover()'s own move settles — pointerleave
    // sometimes never fires at all if the two synthetic moves land in the
    // same task. A brief settle wait, not a product timing dependency.
    await page.waitForTimeout(100);
    // Away from the toaster entirely, onto plain page background.
    await page.mouse.move(5, 5);

    await expect(overlay.locator('.sonner-toast[data-expanded="true"]')).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    await expect(
      overlay.locator('.sonner-toast[data-front="false"][data-expanded="false"]'),
    ).toHaveCount(2);
  });
});
