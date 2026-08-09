import { expect, test } from "@playwright/test";
import { openSheetByTrigger } from "../helpers";

/**
 * Left/right side sheets, settled at their resting (first) detent — the
 * "Side left" / "Side right" fixtures (SideSheet, detents=[0.4, 0.8], modal
 * default true, so the tag-qualified openSheetByTrigger works unchanged).
 */

test.describe("side sheets: settled at rest", () => {
  test("left", async ({ page }) => {
    await page.goto("/");
    await openSheetByTrigger(page, "Side left");
    await expect(page).toHaveScreenshot("side-sheet-left.png", { maxDiffPixelRatio: 0.01 });
  });

  test("right", async ({ page }) => {
    await page.goto("/");
    await openSheetByTrigger(page, "Side right");
    await expect(page).toHaveScreenshot("side-sheet-right.png", { maxDiffPixelRatio: 0.01 });
  });
});
