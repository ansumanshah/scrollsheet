import { expect, test } from "@playwright/test";
import { openSheetByTrigger, waitForStableScrollTop } from "../helpers";

test.describe("multi-view sheet content morph", () => {
  test("scrollTop animates to the new content height on view switch, and back again", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Multi-view sheet");
    const track = dialog.locator(".scrollsheet-track");

    const menuScrollTop = await waitForStableScrollTop(track);

    await dialog.getByRole("button", { name: "View Private Key", exact: true }).click();
    const keyScrollTop = await waitForStableScrollTop(track);
    expect(keyScrollTop).not.toBe(menuScrollTop);

    await dialog.getByRole("button", { name: "Back", exact: true }).click();
    const backScrollTop = await waitForStableScrollTop(track);
    expect(Math.abs(backScrollTop - menuScrollTop)).toBeLessThanOrEqual(2);
  });
});
