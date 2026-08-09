import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger, waitForStableScrollTop } from "../helpers";

/**
 * The `fill` prop (content.tsx / use-content-morph.ts / core.css).
 * Fixture: tests/e2e/fixtures/app.tsx's FillSheet — detents=['content'],
 * Sheet.Content fill, body's only child a 200px (400px once toggled)
 * explicit-height wrapper (data-testid="fill-wrapper") around a taller
 * flex:1/overflow-y:auto inner list (data-testid="fill-inner-list").
 *
 * The planned scenario ("fill absent: zero behavior change")
 * isn't a case in this file — it's the untouched tests/e2e/core/detents.spec.ts
 * and basic-sheet.spec.ts staying green with no edits, run as part of this
 * change's own verification pass rather than duplicated here.
 */

const DETENT_TOLERANCE = 2;
const TRIGGER = "Fill sheet";

test.describe("fill", () => {
  test("content detent resolves to the first child's height, not the fill'd panel height", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, TRIGGER);
    const track = dialog.locator(".scrollsheet-track");
    const wrapper = dialog.getByTestId("fill-wrapper");

    const scrollTop = await waitForStableScrollTop(track);
    const wrapperHeight = await wrapper.evaluate((el) => el.offsetHeight);
    const viewportHeight = page.viewportSize()!.height;

    // The regression this feature exists to prevent: a fill'd body stretched
    // to the panel would report the full panel height here instead.
    expect(Math.abs(scrollTop - wrapperHeight)).toBeLessThanOrEqual(DETENT_TOLERANCE);
    expect(scrollTop).toBeLessThan(viewportHeight - DETENT_TOLERANCE);
  });

  test("the inner scrollable child scrolls independently of the outer track", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, TRIGGER);
    const track = dialog.locator(".scrollsheet-track");
    const innerList = dialog.getByTestId("fill-inner-list");

    const trackScrollTopBefore = await waitForStableScrollTop(track);

    await innerList.evaluate((el) => {
      el.scrollTop = 80;
      el.dispatchEvent(new Event("scroll"));
    });

    await expect(innerList).toHaveJSProperty("scrollTop", 80);

    const trackScrollTopAfter = await track.evaluate((el) => el.scrollTop);
    expect(Math.abs(trackScrollTopAfter - trackScrollTopBefore)).toBeLessThanOrEqual(
      DETENT_TOLERANCE,
    );
  });

  test("content-morph refires when the first child is swapped for a taller one", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, TRIGGER);
    const track = dialog.locator(".scrollsheet-track");

    const shortScrollTop = await waitForStableScrollTop(track);

    await dialog.getByRole("button", { name: "Toggle height", exact: true }).click();
    const tallScrollTop = await waitForStableScrollTop(track);

    expect(tallScrollTop).toBeGreaterThan(shortScrollTop);

    const wrapperHeight = await dialog
      .getByTestId("fill-wrapper")
      .evaluate((el) => el.offsetHeight);
    expect(Math.abs(tallScrollTop - wrapperHeight)).toBeLessThanOrEqual(DETENT_TOLERANCE);

    // Toggle back — proves the morph isn't a one-shot, matching
    // multi-view.spec.ts's own back-and-forth shape.
    await dialog.getByRole("button", { name: "Toggle height", exact: true }).click();
    const backScrollTop = await waitForStableScrollTop(track, SPRING_TIMEOUT);
    expect(Math.abs(backScrollTop - shortScrollTop)).toBeLessThanOrEqual(DETENT_TOLERANCE);
  });
});
