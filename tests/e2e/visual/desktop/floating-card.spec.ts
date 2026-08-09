import { expect, test } from "@playwright/test";
import { openSheetByTrigger } from "../../helpers";

/**
 * Desktop floating-card (detached) presentation — the "Detached sheet"
 * fixture (--scrollsheet-inset-bottom/-x set), settled at rest, docked at
 * the desktop drawer's right edge (see desktop/detached-presentation.spec.ts
 * for the dock-position assertions this shot is the visual counterpart of).
 * Lives under visual/desktop/ so playwright.config.ts's visual-desktop
 * project (1280x800, the same viewport chromium-desktop uses) is the only
 * one that runs it — see that project's comment for the wiring.
 */

test.describe("desktop: floating-card sheet, settled at rest", () => {
  test("detached panel, right-docked", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detached sheet");
    await expect(dialog).toHaveAttribute("data-scrollsheet-detached", "");
    await expect(page).toHaveScreenshot("desktop-floating-card.png", { maxDiffPixelRatio: 0.01 });
  });
});
