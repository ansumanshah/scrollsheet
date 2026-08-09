import { type Page, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * onTravel's richer 3rd argument
 * (TravelInfo: {range, progressAtDetents}). Fixture: OnTravelSheet in
 * e2e/fixtures/app.tsx, modeled on OnReleaseSheet — a handler pushes every
 * call onto `window.__onTravelCalls[trigger]`, spreading `range` into a
 * plain tuple and `progressAtDetents`'s entries into a plain array (neither
 * a live `Map` nor its identity survive page.evaluate's structured clone,
 * so both the shape conversion and the reused-object identity check happen
 * IN-BROWSER, at the point of capture — see the fixture's own doc comment).
 *
 * Drag mechanics: `page.mouse` always synthesizes pointerType 'mouse', which
 * works on every project this file runs in regardless of `hasTouch` (same
 * reasoning tests/e2e/core/detent-options.spec.ts's own mouseDrag doc
 * comment gives) — this file runs on chromium-mobile and webkit-mobile.
 * `use-drag-engine.ts` suspends scroll-snap for the whole drag session, so
 * scrollTop (and therefore `revealed`/`progressAtDetents`) tracks the
 * pointer synchronously mid-gesture — the same mechanism
 * desktop/drag.spec.ts's "the sheet follows the pointer mid-drag" test
 * already exercises.
 */

interface TravelCall {
  revealedPx: number;
  progress: number;
  range: [number, number];
  progressAtDetents: Array<[number, number]>;
  sameAsLast: boolean;
}

async function clearTravelCalls(page: Page, trigger: string): Promise<void> {
  await page.evaluate((t) => {
    (window as unknown as { __onTravelCalls: Record<string, TravelCall[]> }).__onTravelCalls[t] =
      [];
  }, trigger);
}

async function readTravelCalls(page: Page, trigger: string): Promise<TravelCall[]> {
  return page.evaluate(
    (t) =>
      (window as unknown as { __onTravelCalls: Record<string, TravelCall[]> }).__onTravelCalls[t] ??
      [],
    trigger,
  );
}

const SINGLE_TRIGGER = "onTravel single detent sheet";
const SINGLE_TITLE = "onTravel single";
const MULTI_TRIGGER = "onTravel multi detent sheet";
const MULTI_TITLE = "onTravel multi";

test.describe("onTravel: richer {range, progressAtDetents} payload", () => {
  test("single detent: the one progressAtDetents entry is non-decreasing across a drag and reaches 1.0 once settled", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, SINGLE_TRIGGER);
    const title = dialog.getByRole("heading", { name: SINGLE_TITLE, exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    // The sheet opens already settled at its only detent (progress already
    // 1.0 — an instantaneous jump, not a drag). Dip well below it first
    // (still holding the pointer), THEN clear the captured calls and record
    // only the upward leg — a real monotonic climb back to 1.0, not the
    // trivially-already-there resting state.
    await page.mouse.move(x, startY);
    await page.mouse.down();
    const dipY = startY + 200;
    for (let i = 1; i <= 8; i++) await page.mouse.move(x, startY + ((dipY - startY) * i) / 8);

    await clearTravelCalls(page, SINGLE_TRIGGER);

    const riseY = dipY - 400; // comfortably overshoots the single detent, which clamps revealed at its own height
    // A small wait per step (not just many back-to-back moves) so each move
    // lands in its own rAF tick even on WebKit's slower/coalescing pointer
    // pipeline — without it a burst of moves can collapse into too few
    // distinct updateTravel calls to prove monotonicity across several
    // frames (flaky: observed as low as 2 captured calls on webkit-mobile).
    for (let i = 1; i <= 16; i++) {
      await page.mouse.move(x, dipY + ((riseY - dipY) * i) / 16);
      await page.waitForTimeout(20);
    }
    for (let i = 0; i < 4; i++) await page.mouse.move(x, riseY);
    await page.mouse.up();

    const calls = await readTravelCalls(page, SINGLE_TRIGGER);
    expect(calls.length).toBeGreaterThan(2);
    for (const call of calls) expect(call.progressAtDetents.length).toBe(1);

    const values = calls.map((c) => c.progressAtDetents[0]![1]);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]!);
    }
    expect(values[values.length - 1]).toBe(1);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("multi-detent [0.5, 'full']: the lower detent's entry reaches 1.0 strictly before the higher; range[1] matches --scrollsheet-max-detent", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, MULTI_TRIGGER);
    const title = dialog.getByRole("heading", { name: MULTI_TITLE, exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    // Opens settled at the lower (0.5) detent — its entry is already 1.0 at
    // rest. Dip below BOTH detents first (both entries under 1.0), clear the
    // capture, then sweep all the way up past 'full' in one continuous
    // gesture — the lower detent's height is crossed before the higher's.
    await page.mouse.move(x, startY);
    await page.mouse.down();
    const dipY = startY + 250;
    for (let i = 1; i <= 8; i++) await page.mouse.move(x, startY + ((dipY - startY) * i) / 8);

    await clearTravelCalls(page, MULTI_TRIGGER);

    const riseY = Math.max(dipY - 700, 5); // sweeps well past 'full', clamped by the engine itself
    // See the single-detent test's comment above: a small wait per step
    // keeps each move in its own rAF tick across engines.
    for (let i = 1; i <= 24; i++) {
      await page.mouse.move(x, dipY + ((riseY - dipY) * i) / 24);
      await page.waitForTimeout(20);
    }
    for (let i = 0; i < 4; i++) await page.mouse.move(x, riseY);
    await page.mouse.up();

    const calls = await readTravelCalls(page, MULTI_TRIGGER);
    expect(calls.length).toBeGreaterThan(2);
    // Every call resolves exactly 2 entries (one per configured detent).
    for (const call of calls) expect(call.progressAtDetents.length).toBe(2);

    const heights = calls[0]!.progressAtDetents.map(([height]) => height).sort((a, b) => a - b);
    const [lowerHeight, higherHeight] = heights as [number, number];
    expect(lowerHeight).toBeLessThan(higherHeight);

    const reachesOne = (call: TravelCall, height: number) =>
      call.progressAtDetents.find(([h]) => h === height)?.[1] === 1;

    const lowerFirstIndex = calls.findIndex((c) => reachesOne(c, lowerHeight));
    const higherFirstIndex = calls.findIndex((c) => reachesOne(c, higherHeight));
    expect(lowerFirstIndex).toBeGreaterThanOrEqual(0);
    expect(higherFirstIndex).toBeGreaterThan(lowerFirstIndex);

    const maxDetent = await dialog.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).getPropertyValue("--scrollsheet-max-detent")),
    );
    const lastCall = calls[calls.length - 1]!;
    expect(lastCall.range[0]).toBe(0);
    expect(Math.abs(lastCall.range[1] - maxDetent)).toBeLessThanOrEqual(1);
    expect(lastCall.range[1]).toBe(higherHeight);
  });

  test("reused-object identity: consecutive travel frames' info reference is the same object (mutable reuse, not fresh-per-frame)", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, SINGLE_TRIGGER);
    const title = dialog.getByRole("heading", { name: SINGLE_TITLE, exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    // Clear right after open (the open-jump's own first-ever call compares
    // against a null lastInfoRef and would trivially read sameAsLast=false —
    // not interesting). Every call from here on, across the whole rest of
    // this sheet's lifetime, reuses content.tsx's single travelInfoRef
    // object, so a real multi-frame drag should show sameAsLast=true on
    // every captured frame.
    await clearTravelCalls(page, SINGLE_TRIGGER);

    await page.mouse.move(x, startY);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(x, startY + i * 15);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();

    const calls = await readTravelCalls(page, SINGLE_TRIGGER);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) expect(call.sameAsLast).toBe(true);
    await expect(dialog).toBeVisible({ timeout: SPRING_TIMEOUT });
  });
});
