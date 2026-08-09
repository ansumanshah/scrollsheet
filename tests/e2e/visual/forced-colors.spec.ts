import { expect, test } from "@playwright/test";
import { openSheetByTrigger } from "../helpers";

/**
 * forced-colors: active (Windows-High-Contrast-style emulation) — same
 * trigger and emulateMedia call platform/forced-colors.spec.ts uses. Chromium-
 * only feature (see that file's comment); this whole lane already runs
 * chromium-only, so no browserName skip is needed here.
 */

test.describe("forced-colors: active, settled bottom sheet", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
  });

  test("panel border, backdrop, and handle render the forced-colors defaults", async ({ page }) => {
    await page.goto("/");
    await openSheetByTrigger(page, "Full height sheet");
    await expect(page).toHaveScreenshot("forced-colors-bottom-sheet.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
