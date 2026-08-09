import { type Locator, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * Travel-linked stacking (see sides/stacking-travel.spec.ts) — parent fully
 * receded (data-scrollsheet-behind, scale(.94), dimmed) once the child
 * settles open. "Stacking parent" / "Open stacking child" fixtures, same
 * open sequence stacking-travel.spec.ts uses: parent is dialog #0, child is
 * dialog #1 in document order.
 */

/**
 * Same technique as helpers.ts's waitForStableScrollTop, generalized to a
 * computed style string: block until two consecutive expect.poll cycles read
 * the identical value, i.e. the recede transition (transform + opacity,
 * driven by --scrollsheet-dur) has actually finished rather than just
 * started.
 */
async function waitForStableTransform(el: Locator, timeout = SPRING_TIMEOUT): Promise<void> {
  let previous: string | null = null;
  await expect
    .poll(
      async () => {
        const current = await el.evaluate((node) => getComputedStyle(node).transform);
        const matched = previous !== null && current === previous;
        previous = current;
        return matched;
      },
      { timeout },
    )
    .toBe(true);
}

test.describe("stacked sheets: parent receded behind an open child", () => {
  test("parent scales/dims behind, child rests open in front", async ({ page }) => {
    await page.goto("/");
    const parent = await openSheetByTrigger(page, "Stacking parent", 0);
    await parent.getByRole("button", { name: "Open stacking child", exact: true }).click();

    const child = page.locator("dialog.scrollsheet-dialog").nth(1);
    await expect(child).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    await expect(parent).toHaveAttribute("data-scrollsheet-behind", "");

    const parentPanel = parent.locator(".scrollsheet-panel");
    await waitForStableTransform(parentPanel);

    await expect(page).toHaveScreenshot("stacked-sheets-parent-receded.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
