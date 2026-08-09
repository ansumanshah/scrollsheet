import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger, waitForStableScrollTop } from "../helpers";

const DETENT_TOLERANCE = 2;
const TRIGGER = "Detents (35% / 70% / full)";

test.describe("detents", () => {
  test("opens at the first detent (35% of viewport height)", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, TRIGGER);
    const viewportHeight = page.viewportSize()!.height;
    const expected = Math.round(viewportHeight * 0.35);

    const track = dialog.locator(".scrollsheet-track");
    const scrollTop = await track.evaluate((el) => el.scrollTop);
    expect(Math.abs(scrollTop - expected)).toBeLessThanOrEqual(DETENT_TOLERANCE);
  });

  test("places snap sentinels at 0%, 35%, 70% and 100% of viewport height", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, TRIGGER);
    const viewportHeight = page.viewportSize()!.height;

    const tops = await dialog
      .locator(".scrollsheet-snap")
      .evaluateAll((els) =>
        els.map((el) => Number.parseFloat((el as HTMLElement).style.top)).sort((a, b) => a - b),
      );

    const expected = [0, 0.35, 0.7, 1].map((fraction) => Math.round(viewportHeight * fraction));
    expect(tops).toHaveLength(expected.length);
    for (const [index, top] of tops.entries()) {
      expect(Math.abs(top - expected[index]!)).toBeLessThanOrEqual(DETENT_TOLERANCE);
    }
  });

  test("clicking the handle travels to the next detent (70%)", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, TRIGGER);
    const viewportHeight = page.viewportSize()!.height;
    const expected = Math.round(viewportHeight * 0.7);
    const track = dialog.locator(".scrollsheet-track");

    await dialog.locator("[data-scrollsheet-handle]").click();
    const scrollTop = await waitForStableScrollTop(track);

    expect(Math.abs(scrollTop - expected)).toBeLessThanOrEqual(DETENT_TOLERANCE);
  });

  test("scrolling the track to 0 and a scrollend closes and unmounts the sheet", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, TRIGGER);
    const track = dialog.locator(".scrollsheet-track");

    // Programmatic stand-in for a swipe-down past the dismiss threshold: move
    // scrollTop below half the first detent, then fire the scrollend the real
    // gesture would produce once the finger lifts and the scroll settles.
    await track.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scrollend"));
    });

    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });
});
