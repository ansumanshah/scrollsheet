import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * desktopSide="center" on the "Responsive profile sheet" fixture (side=
 * "bottom", default 768px breakpoint): a bottom sheet below the line, a
 * centered dialog at/above it, resolved through a matchMedia subscription.
 * Crossing the breakpoint while the sheet is open re-presents instantly —
 * no morph, just a new presentation — and must never crash or drop the
 * sheet's open state mid-flip.
 */

const TRIGGER = "Responsive profile sheet";
const BELOW = { width: 500, height: 800 };
const ABOVE = { width: 900, height: 800 };

test("below the breakpoint, the base side presentation applies", async ({ page }) => {
  await page.setViewportSize(BELOW);
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, TRIGGER);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "bottom");
});

test("at/above the breakpoint, desktopSide presents centered", async ({ page }) => {
  await page.setViewportSize(ABOVE);
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, TRIGGER);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "center");
});

test("crossing the breakpoint while open re-presents instantly without crashing", async ({
  page,
}) => {
  await page.setViewportSize(BELOW);
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, TRIGGER);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "bottom");

  await page.setViewportSize(ABOVE);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "center", {
    timeout: SPRING_TIMEOUT,
  });
  // Still the same open dialog — no crash, no dismiss, no remount.
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(1);

  // And back down — the flip is symmetric, not a one-way ratchet.
  await page.setViewportSize(BELOW);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "bottom", {
    timeout: SPRING_TIMEOUT,
  });
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
});
