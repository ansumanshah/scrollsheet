import { expect, test } from "@playwright/test";

import { assertNoLongTasksInWindow, installPerfObservers, pageNow } from "../fixtures/perf";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * Perf gate lane, chromium-only project — see playwright.config.ts's
 * 'perf' project. Open, wait for settle, close, wait for settle: the most
 * common round trip this library performs, so it's the first thing gated.
 */
test.describe("perf: open/close", () => {
  test("the open/close round trip produces no long task over budget", async ({ page }) => {
    await installPerfObservers(page);
    await page.goto("/");

    const start = await pageNow(page);
    // openSheetByTrigger waits for data-scrollsheet-state="open", which the
    // enter leg only sets once its spring settles — this already IS "wait
    // for settle", not just the click.
    const dialog = await openSheetByTrigger(page, "Basic sheet");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    const end = await pageNow(page);

    await assertNoLongTasksInWindow(page, start, end);
  });
});
