import { expect, test } from "@playwright/test";

import { assertNoLongTasksInWindow, installPerfObservers, pageNow } from "../fixtures/perf";
import { SPRING_TIMEOUT, openSheetByTrigger, waitForStableScrollTop } from "../helpers";

/**
 * Perf gate lane, chromium-only project — see playwright.config.ts's
 * 'perf' project. The wheel latch only ever touches the DOM on the
 * 150ms idle debounce (endWheelSession), never inside the wheel event
 * handler itself (onWheel is O(1): accumulate a delta, reset a timer) — so
 * the gesture window asserted over here must span past the debounce, not
 * just the wheel dispatch, to actually cover the DOM-touching work.
 */
test.describe("perf: wheel latch", () => {
  test("a wheel session that triggers a dismiss correction produces no long task", async ({
    page,
  }) => {
    await installPerfObservers(page);
    await page.goto("/");

    const dialog = await openSheetByTrigger(page, "Wheel latch high threshold");
    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    const maxDetent = await dialog.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).getPropertyValue("--scrollsheet-max-detent")),
    );

    const start = await pageNow(page);
    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    // Negative deltaY: the real dismiss direction for a bottom sheet.
    await page.mouse.wheel(0, -Math.round(maxDetent * 0.15));
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    const end = await pageNow(page);

    await assertNoLongTasksInWindow(page, start, end);
  });

  test("a wheel session that triggers a re-tween correction produces no long task", async ({
    page,
  }) => {
    await installPerfObservers(page);
    await page.goto("/");

    const dialog = await openSheetByTrigger(page, "Wheel latch low threshold");
    const track = dialog.locator(".scrollsheet-track");
    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");
    const maxDetent = await dialog.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).getPropertyValue("--scrollsheet-max-detent")),
    );

    const start = await pageNow(page);
    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    // Negative deltaY = real dismiss direction (confirmed empirically — see
    // drag.spec.ts). closeThreshold=0.1: native alone commits fully to the
    // dismiss stop, but the latch corrects it back — the startTween branch
    // of endWheelSession, the other correction path (the dismiss branch is
    // covered by the sibling test above).
    await page.mouse.wheel(0, -Math.round(maxDetent * 0.65));
    await waitForStableScrollTop(track);
    const end = await pageNow(page);

    await assertNoLongTasksInWindow(page, start, end);
  });

  test("a wheel session with no correction (native and latch already agree) produces no long task", async ({
    page,
  }) => {
    await installPerfObservers(page);
    await page.goto("/");

    const dialog = await openSheetByTrigger(page, "Basic sheet");
    const track = dialog.locator(".scrollsheet-track");
    const panelBox = await dialog.locator(".scrollsheet-panel").boundingBox();
    if (!panelBox) throw new Error("panel bounding box unavailable");

    const start = await pageNow(page);
    await page.mouse.move(panelBox.x + panelBox.width / 2, panelBox.y + 10);
    // A tiny nudge (real dismiss direction) at the default closeThreshold:
    // native re-snaps back open, the latch agrees — the correction pass's
    // own read-then-compare is a no-op, still gated the same way as the two
    // branches above.
    await page.mouse.wheel(0, -20);
    await waitForStableScrollTop(track);
    const end = await pageNow(page);

    await assertNoLongTasksInWindow(page, start, end);
  });
});
