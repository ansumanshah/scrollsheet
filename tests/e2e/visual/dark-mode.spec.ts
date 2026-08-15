import { expect, test } from "@playwright/test";
import { openSheetByTrigger, setScrollsheetTheme } from "../helpers";

/**
 * Theming contract: light is the shipped default everywhere — bare OS dark
 * scheme with no data-scrollsheet-theme attribute must NOT flip the panel
 * dark. Dark is opt-in via data-scrollsheet-theme="dark" on an ancestor
 * (documented as <html>). Same trigger motion/visual-defaults.spec.ts's
 * "default look" describe block opens — a settled bottom sheet at its
 * resting (non-max) detent.
 */

test.use({ colorScheme: "dark" });

test.describe("dark OS scheme, no attribute: light default", () => {
  test("panel and handle render the light defaults", async ({ page }) => {
    await page.goto("/");
    await openSheetByTrigger(page, "Full height sheet");
    await expect(page).toHaveScreenshot("dark-scheme-light-default.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});

test.describe('data-scrollsheet-theme="dark": opt-in dark', () => {
  test.beforeEach(async ({ page }) => {
    await setScrollsheetTheme(page, "dark");
  });

  test("panel and handle render the dark defaults", async ({ page }) => {
    await page.goto("/");
    await openSheetByTrigger(page, "Full height sheet");
    await expect(page).toHaveScreenshot("dark-opt-in-bottom-sheet.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
