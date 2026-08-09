import { type Page, expect, test } from "@playwright/test";

import {
  INPUT_DELAY_BUDGET_MS,
  assertNoLongTasksInWindow,
  getEventTimings,
  inWindow,
  installPerfObservers,
  pageNow,
} from "../fixtures/perf";
import { openSheetByTrigger, waitForStableScrollTop } from "../helpers";

/**
 * Local copy of desktop/drag.spec.ts's mouseDrag — that file doesn't export
 * it, and the perf lane deliberately leaves tests/e2e/helpers.ts untouched. Same shape:
 * page.mouse (synthesizes pointerType 'mouse'), never page.mouse.wheel —
 * the pointer-engine path this spec targets. Repeats a few moves at endY so
 * the drag's rolling velocity sample settles before release.
 */
async function mouseDrag(page: Page, x: number, startY: number, endY: number, steps = 16) {
  await page.mouse.move(x, startY);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const y = startY + ((endY - startY) * i) / steps;
    await page.mouse.move(x, y);
  }
  for (let i = 0; i < 4; i++) await page.mouse.move(x, endY);
  await page.mouse.up();
}

/**
 * Perf gate lane, chromium-only project — see playwright.config.ts's
 * 'perf' project.
 */
test.describe("perf: drag", () => {
  test("a full drag-to-detent gesture produces no long task, pointerdown stays under budget", async ({
    page,
  }) => {
    await installPerfObservers(page);
    await page.goto("/");

    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const title = dialog.getByRole("heading", { name: "Detents", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    const start = await pageNow(page);
    // 35% -> comfortably closer to 70%, same drag shape as
    // desktop/drag.spec.ts's snap-to-higher-detent case.
    await mouseDrag(page, box.x + box.width / 2, box.y + box.height / 2, box.y - 200);
    await waitForStableScrollTop(track);
    const end = await pageNow(page);

    await assertNoLongTasksInWindow(page, start, end);

    // The brief's sketch asserts on the first pointermove's event-timing
    // duration, but the Event Timing API spec excludes continuous event
    // types (pointermove/mousemove/touchmove/wheel/drag) from
    // PerformanceEventTiming entries entirely — confirmed empirically here
    // (16+ synthetic moves during the drag, zero 'pointermove' entries ever
    // recorded, across every run). pointerdown is the nearest discrete,
    // spec-observable analog and is what actually starts the gesture from
    // the user's perspective, so it's the input-delay budget this asserts
    // against instead. Same "tripwire, not a target" caveat as the brief's
    // own #2: absence of an entry means it was already comfortably under
    // budget (Event Timing only reports entries >=16ms).
    const pointerDowns = inWindow(await getEventTimings(page), start, end)
      .filter((e) => e.name === "pointerdown")
      .sort((a, b) => a.startTime - b.startTime);
    if (pointerDowns.length > 0) {
      expect(pointerDowns[0]!.duration).toBeLessThan(INPUT_DELAY_BUDGET_MS);
    }
  });
});
