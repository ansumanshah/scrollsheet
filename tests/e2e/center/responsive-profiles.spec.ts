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

test("a live center flip never wipes the input stamp (phantom guard)", async ({ page }) => {
  // Stamp under center, cross the breakpoint, teleport inside the window:
  // the jump must stay credited to the user and dismiss.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(ABOVE);
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, TRIGGER);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "center");
  await page.waitForTimeout(200);

  const stampAt = await dialog.evaluate((el) => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    return performance.now();
  });

  await page.setViewportSize(BELOW);
  await page.waitForFunction(
    () =>
      document
        .querySelector("dialog.scrollsheet-dialog")
        ?.getAttribute("data-scrollsheet-side") === "bottom",
    undefined,
    { timeout: SPRING_TIMEOUT },
  );
  await page.waitForTimeout(150);

  // Past the window, fixed and broken are indistinguishable — skip.
  const elapsed = (await page.evaluate(() => performance.now())) - stampAt;
  test.skip(elapsed > 1400, `flip took ${Math.round(elapsed)}ms — stamp went stale`);

  await dialog.evaluate((el) => {
    const track = el.querySelector(".scrollsheet-track");
    if (!track) throw new Error("no .scrollsheet-track");
    track.scrollTo({ top: 0, behavior: "instant" });
  });
  // Boolean poll: under reduced motion webkit unmounts before a negative
  // attribute matcher can resolve the locator (absence errors, not passes).
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const el = document.querySelector("dialog.scrollsheet-dialog");
          return !el || el.getAttribute("data-scrollsheet-state") !== "open";
        }),
      { timeout: SPRING_TIMEOUT },
    )
    .toBe(true);
});
