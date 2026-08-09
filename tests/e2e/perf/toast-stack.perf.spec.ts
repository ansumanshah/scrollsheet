import { expect, test } from "@playwright/test";

import { assertNoLongTasksInWindow, installPerfObservers, pageNow } from "../fixtures/perf";
import { openToasterByTrigger } from "../helpers";

/**
 * Perf gate lane, chromium-only project — see playwright.config.ts's
 * 'perf' project. "Sonner: show many toasts" fires three toasts
 * synchronously in one click (tests/e2e/fixtures/app.tsx) — the same
 * fixture tests/e2e/visual/sonner-stack.spec.ts uses for its own toast-stack
 * screenshot.
 *
 * Every toast is now a real, persistent DOM row (hide-not-evict, no
 * decorative ghosts) — arguably a MORE relevant perf gate post-port than
 * before: real content/icon/actions markup for all three costs more than
 * two blank ghost divs did, so this budget is worth holding, not loosening.
 */
test.describe("perf: toast stack", () => {
  test("firing a burst of toasts produces no long task over budget", async ({ page }) => {
    await installPerfObservers(page);
    await page.goto("/");

    const start = await pageNow(page);
    const overlay = await openToasterByTrigger(page, "Sonner: show many toasts");
    // Settle: all three real rows have mounted (openToasterByTrigger's own
    // wait already covers the front row's opacity settling).
    await expect(overlay.locator(".sonner-toast[data-mounted]")).toHaveCount(3);
    const end = await pageNow(page);

    await assertNoLongTasksInWindow(page, start, end);
  });
});
