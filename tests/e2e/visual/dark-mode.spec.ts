import { expect, test } from "@playwright/test";
import { openSheetByTrigger } from "../helpers";

/**
 * Dark-mode default look (colorScheme: 'dark'), same trigger
 * motion/visual-defaults.spec.ts's "dark mode" test opens — a settled bottom
 * sheet at its resting (non-max) detent.
 */

test.use({ colorScheme: "dark" });

test.describe("dark mode: settled bottom sheet", () => {
  test("panel and handle render the dark defaults", async ({ page }) => {
    await page.goto("/");
    await openSheetByTrigger(page, "Full height sheet");
    await expect(page).toHaveScreenshot("dark-mode-bottom-sheet.png", { maxDiffPixelRatio: 0.01 });
  });
});
