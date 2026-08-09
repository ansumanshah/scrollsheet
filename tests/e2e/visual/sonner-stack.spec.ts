import { expect, test } from "@playwright/test";
import { openToasterByTrigger } from "../helpers";

/**
 * sonner compat toast stack, collapsed — the "Sonner: show many toasts"
 * fixture fires three toasts with a 60s duration (auto-dismiss out of the
 * way), Toaster visibleToasts=3, so the stack shows the front row
 * ("Third") fully, with two collapsed, blanked-chrome rows receded behind
 * it (same shape desktop/sonner.spec.ts asserts). Every row is a real,
 * persistent DOM node now — no decorative ghost divs, no collapsed-front-
 * card-plus-ghosts swap — replacing the pre-shell baseline outright rather
 * than diffing against it.
 */

test.describe("sonner: collapsed toast stack", () => {
  test("front row, plus two collapsed rows receded behind it", async ({ page }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show many toasts");
    await expect(overlay.locator(".sonner-toast")).toHaveCount(3);
    await expect(
      overlay.locator('.sonner-toast[data-front="true"] .sonner-toast-title'),
    ).toHaveText("Third");
    // openToasterByTrigger only waits out the FRONT row's own enter fade —
    // the two collapsed rows behind it mount on their own double-rAF timer
    // too, just not gated by that helper. Wait for all three before the
    // screenshot so it doesn't race their own settle.
    await expect(overlay.locator(".sonner-toast[data-mounted]")).toHaveCount(3);
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot("sonner-toast-stack.png", { maxDiffPixelRatio: 0.01 });
  });
});
