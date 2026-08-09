import { expect, test } from "@playwright/test";
import { openSheetByTrigger, waitForStableScrollTop } from "../helpers";

/**
 * Visual-regression lane (see playwright.config.ts's visual-mobile/visual-desktop
 * projects — chromium-only, local-only). Screenshots the bottom sheet at each
 * of its three detents (35% / 70% / full) using the existing "Detents (35% /
 * 70% / full)" fixture (ThreeDetentSheet) — its Sheet.Handle click cycles
 * forward through detents (see src/handle.tsx), same mechanism
 * motion/visual-defaults.spec.ts uses to reach "full".
 *
 * No reducedMotion emulation anywhere in this lane: openSheetByTrigger's own
 * wait for data-scrollsheet-state="open" already blocks until the WAAPI
 * open/close leg has finished, and waitForStableScrollTop blocks until the
 * scroll-snap settle (the detent-change mechanism) stops moving — both
 * observe the library's real animated end-state rather than skipping it.
 */

test.describe("bottom sheet: settled at each detent", () => {
  test("35% (initial), 70%, and full detents", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const handle = dialog.locator("[data-scrollsheet-handle]");

    // Opens at the first detent (35%) — no drag/click needed to settle here.
    await expect(dialog.locator("code")).toHaveText("0.35");
    await expect(page).toHaveScreenshot("bottom-sheet-detent-35.png", { maxDiffPixelRatio: 0.01 });

    // Click cycles forward: 0.35 -> 0.7.
    await handle.click();
    await waitForStableScrollTop(track);
    await expect(dialog.locator("code")).toHaveText("0.7");
    await expect(page).toHaveScreenshot("bottom-sheet-detent-70.png", { maxDiffPixelRatio: 0.01 });

    // Click cycles forward again: 0.7 -> full.
    await handle.click();
    await waitForStableScrollTop(track);
    await expect(dialog.locator("code")).toHaveText("full");
    await expect(dialog).toHaveAttribute("data-scrollsheet-at-max", "");
    await expect(page).toHaveScreenshot("bottom-sheet-detent-full.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
