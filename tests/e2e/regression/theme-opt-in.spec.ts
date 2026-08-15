import { expect, test } from "@playwright/test";
import { openSheetByTrigger, setScrollsheetTheme } from "../helpers";

/**
 * data-scrollsheet-theme contract: light is the default everywhere. Dark is
 * opt-in via data-scrollsheet-theme="dark" on an ancestor (documented as
 * <html>); "system" restores the old OS-scheme-tracking behavior. Probe-based
 * (getComputedStyle), not screenshots — that lane is tests/e2e/visual/dark-mode.spec.ts.
 */

test.describe("dark OS scheme, no attribute", () => {
  test.use({ colorScheme: "dark" });

  test("panel stays light", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const panel = dialog.locator(".scrollsheet-panel");
    const bg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(255, 255, 255)");
  });
});

test.describe('data-scrollsheet-theme="dark"', () => {
  test.beforeEach(async ({ page }) => {
    await setScrollsheetTheme(page, "dark");
  });

  test("panel is dark regardless of OS scheme", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const panel = dialog.locator(".scrollsheet-panel");
    const bg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(28, 28, 30)");
  });
});

test.describe('no-<dialog> fallback panel honors the attribute', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Same feature removal tests/e2e/platform/no-dialog-fallback.spec.ts
      // uses: dropping showModal from the prototype routes the library onto
      // the fallback path while <dialog> stays parseable as an element.
      // biome-ignore lint: deliberate feature removal for this suite
      delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>).showModal;
    });
    await setScrollsheetTheme(page, "dark");
  });

  test("fallback panel is dark under the dark attribute", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Full height sheet" }).click();
    const panel = page.locator(".scrollsheet-fallback-panel");
    await expect(panel).toBeVisible();
    const bg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(28, 28, 30)");
  });
});

test.describe('data-scrollsheet-theme="system"', () => {
  test.use({ colorScheme: "dark" });

  test.beforeEach(async ({ page }) => {
    await setScrollsheetTheme(page, "system");
  });

  test("panel is dark under a dark OS scheme (old tracking behavior, now opt-in)", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const panel = dialog.locator(".scrollsheet-panel");
    const bg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(28, 28, 30)");
  });
});
