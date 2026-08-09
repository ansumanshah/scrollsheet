import { type CDPSession, type Locator, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * Nested-scroll handoff — a
 * `[data-scrollsheet-nested-scroll]`-marked descendant of `Sheet.Content`
 * scrolls natively on its own; once a touch that STARTED inside it is live
 * and the element sits at its own top scroll boundary (`scrollTop <= 0`),
 * content.tsx's delegated dialog-level listener sets
 * `data-scrollsheet-at-nested-boundary` on the dialog, which re-admits
 * track/canvas's touch-action under handleOnly/disableDrag (core.css) so the
 * SAME swipe can continue driving native scroll-snap.
 *
 * Real touch only — CDP `Input.dispatchTouchEvent`, same technique
 * detent-options.spec.ts's `cdpTouchDrag` uses, for the same reason: a
 * synthetic `element.dispatchEvent` bypasses the browser's native
 * touch-action gesture pipeline entirely, and this feature IS that pipeline.
 * Chromium (CDP) only — every test here skips on other engines rather than
 * faking the gesture with `page.mouse`, which always synthesizes
 * pointerType 'mouse' and never exercises touch-action at all.
 *
 * History: scenario (b)'s end-to-end half shipped as a `test.skip` because
 * the panel's `overscroll-behavior: contain` under handleOnly/disableDrag
 * was unconditional, containing the chained scroll before it could reach
 * the track (same root cause as the B19 regression, on a second code path).
 * core.css now pauses that containment while
 * `data-scrollsheet-at-nested-boundary` is live, and the (b, end-to-end)
 * test below is the regression lock for exactly that scoping.
 */

/** Chromium-only guard, matching detent-options.spec.ts's own precedent for CDP touch dispatch. */
function skipUnlessChromium(browserName: string) {
  test.skip(browserName !== "chromium", "CDP touch dispatch requires Chromium.");
}

async function readNestedBoundaryAttr(dialog: Locator): Promise<boolean> {
  return dialog.evaluate((el) => el.hasAttribute("data-scrollsheet-at-nested-boundary"));
}

async function touchStart(client: CDPSession, x: number, y: number): Promise<void> {
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
}

async function touchMoveSteps(
  client: CDPSession,
  x: number,
  fromY: number,
  toY: number,
  steps = 20,
): Promise<void> {
  for (let i = 1; i <= steps; i++) {
    const y = fromY + ((toY - fromY) * i) / steps;
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
}

async function touchEnd(client: CDPSession): Promise<void> {
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test.describe("nested-scroll handoff", () => {
  test("(a) mid-list: a swipe scrolls the nested content, the dialog attribute never sets, and the sheet doesn't travel", async ({
    page,
    browserName,
  }) => {
    skipUnlessChromium(browserName);
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Nested scroll handoff sheet");
    const track = dialog.locator(".scrollsheet-track");
    const list = dialog.locator("[data-scrollsheet-nested-scroll]");

    // Well clear of the top boundary — isAtScrollBoundary("top") never fires.
    await list.evaluate((el) => {
      el.scrollTop = 200;
    });
    const trackBefore = await track.evaluate((el) => el.scrollTop);
    const listBefore = await list.evaluate((el) => el.scrollTop);

    const box = await list.boundingBox();
    if (!box) throw new Error("nested list bounding box unavailable");
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    const client = await page.context().newCDPSession(page);
    try {
      await touchStart(client, x, startY);
      expect(await readNestedBoundaryAttr(dialog)).toBe(false);
      await touchMoveSteps(client, x, startY, startY - 150);
      expect(await readNestedBoundaryAttr(dialog)).toBe(false);
      await touchEnd(client);
    } finally {
      await client.detach().catch(() => {});
    }

    expect(await readNestedBoundaryAttr(dialog)).toBe(false);
    const listAfter = await list.evaluate((el) => el.scrollTop);
    expect(listAfter).not.toBe(listBefore); // the list itself did scroll normally
    const trackAfter = await track.evaluate((el) => el.scrollTop);
    expect(trackAfter).toBe(trackBefore); // the sheet never moved
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("(b) at top: a continuing swipe sets the dialog attribute for the duration of the gesture", async ({
    page,
    browserName,
  }) => {
    skipUnlessChromium(browserName);
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Nested scroll handoff sheet");
    const list = dialog.locator("[data-scrollsheet-nested-scroll]");

    // A freshly-opened list already rests at scrollTop 0 — no setup needed.
    expect(await list.evaluate((el) => el.scrollTop)).toBe(0);

    const box = await list.boundingBox();
    if (!box) throw new Error("nested list bounding box unavailable");
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    const client = await page.context().newCDPSession(page);
    try {
      await touchStart(client, x, startY);
      // Set immediately at touchstart (the element is already at rest at the
      // boundary) — see content.tsx's own doc comment: "a list already at
      // rest at touchstart hands off immediately".
      expect(await readNestedBoundaryAttr(dialog)).toBe(true);
      // Continuing to swipe down: the list can't scroll past 0, so no
      // 'scroll' event ever fires to re-evaluate it away — stays on for the
      // whole gesture.
      await touchMoveSteps(client, x, startY, startY + 250);
      expect(await readNestedBoundaryAttr(dialog)).toBe(true);
      expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
      await touchEnd(client);
    } finally {
      await client.detach().catch(() => {});
    }
  });

  test("(b, end-to-end) at top: a continuing swipe actually carries the sheet's own track", async ({
    page,
    browserName,
  }) => {
    skipUnlessChromium(browserName);
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Nested scroll handoff sheet");
    const track = dialog.locator(".scrollsheet-track");
    const list = dialog.locator("[data-scrollsheet-nested-scroll]");

    expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
    const trackBefore = await track.evaluate((el) => el.scrollTop);

    const box = await list.boundingBox();
    if (!box) throw new Error("nested list bounding box unavailable");
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    const client = await page.context().newCDPSession(page);
    try {
      await touchStart(client, x, startY);
      await touchMoveSteps(client, x, startY, startY + 250);
      await touchEnd(client);
    } finally {
      await client.detach().catch(() => {});
    }

    // The chained scroll must reach the track: the sheet either travelled
    // meaningfully toward its dismiss stop (scrollTop shrinks for a bottom
    // sheet) or dismissed outright. Regression lock for the panel's
    // overscroll-behavior containment pausing during a live handoff window.
    await expect
      .poll(
        async () => {
          if ((await page.locator("dialog.scrollsheet-dialog").count()) === 0) return true;
          const now = await track.evaluate((el) => el.scrollTop);
          return trackBefore - now > 50;
        },
        { timeout: SPRING_TIMEOUT },
      )
      .toBe(true);
  });

  test("(c) the attribute clears the instant the touch ends", async ({ page, browserName }) => {
    skipUnlessChromium(browserName);
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Nested scroll handoff sheet");
    const list = dialog.locator("[data-scrollsheet-nested-scroll]");
    const box = await list.boundingBox();
    if (!box) throw new Error("nested list bounding box unavailable");
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    const client = await page.context().newCDPSession(page);
    try {
      await touchStart(client, x, startY);
      await touchMoveSteps(client, x, startY, startY + 150);
      expect(await readNestedBoundaryAttr(dialog)).toBe(true);
      await touchEnd(client);
    } finally {
      await client.detach().catch(() => {});
    }

    expect(await readNestedBoundaryAttr(dialog)).toBe(false);
  });

  test("(d) a gesture starting outside the marked element never hands off, even elsewhere in the same handleOnly sheet", async ({
    page,
    browserName,
  }) => {
    skipUnlessChromium(browserName);
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Nested scroll handoff sheet");
    const track = dialog.locator(".scrollsheet-track");
    const title = dialog.getByRole("heading", { name: "Nested scroll handoff", exact: true });

    const trackBefore = await track.evaluate((el) => el.scrollTop);
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    const client = await page.context().newCDPSession(page);
    try {
      await touchStart(client, x, startY);
      expect(await readNestedBoundaryAttr(dialog)).toBe(false);
      await touchMoveSteps(client, x, startY, startY - 400);
      expect(await readNestedBoundaryAttr(dialog)).toBe(false);
      await touchEnd(client);
    } finally {
      await client.detach().catch(() => {});
    }

    expect(await readNestedBoundaryAttr(dialog)).toBe(false);
    const trackAfter = await track.evaluate((el) => el.scrollTop);
    expect(trackAfter).toBe(trackBefore);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("(e) reaching the top mid-gesture flips the attribute on via the scroll-event path, not just at touchstart", async ({
    page,
    browserName,
  }) => {
    skipUnlessChromium(browserName);
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Nested scroll handoff sheet");
    const list = dialog.locator("[data-scrollsheet-nested-scroll]");

    // Close to, but not already at, the boundary — touchstart's own
    // immediate evaluate() must find it NOT at boundary yet.
    await list.evaluate((el) => {
      el.scrollTop = 80;
    });

    const box = await list.boundingBox();
    if (!box) throw new Error("nested list bounding box unavailable");
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    const client = await page.context().newCDPSession(page);
    try {
      await touchStart(client, x, startY);
      expect(await readNestedBoundaryAttr(dialog)).toBe(false);
      // Swipe down far enough to scroll the list from 80 to 0 and hold
      // there — the 'scroll' event fired while crossing 0 is what flips the
      // attribute, not the touchstart read (which already ran and saw >0).
      await touchMoveSteps(client, x, startY, startY + 200, 30);
      expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
      expect(await readNestedBoundaryAttr(dialog)).toBe(true);
      await touchEnd(client);
    } finally {
      await client.detach().catch(() => {});
    }
  });

  test("(f) a morph removing the marked element mid-gesture clears the attribute (MutationObserver path)", async ({
    page,
    browserName,
  }) => {
    skipUnlessChromium(browserName);
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Nested scroll handoff sheet");
    const list = dialog.locator("[data-scrollsheet-nested-scroll]");
    const toggle = dialog.locator('[data-testid="nested-toggle"]');

    const box = await list.boundingBox();
    if (!box) throw new Error("nested list bounding box unavailable");
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    const client = await page.context().newCDPSession(page);
    try {
      await touchStart(client, x, startY);
      expect(await readNestedBoundaryAttr(dialog)).toBe(true);

      // The morph — a real React state update unmounting the marked
      // element — fires mid-gesture, no touchend for it ever delivered.
      await toggle.click();
      await expect(list).toHaveCount(0);

      await expect.poll(async () => readNestedBoundaryAttr(dialog)).toBe(false);

      await touchEnd(client);
    } finally {
      await client.detach().catch(() => {});
    }
  });

  test("(g) a session opening with zero marked elements picks up one added by a later morph (delegation)", async ({
    page,
    browserName,
  }) => {
    skipUnlessChromium(browserName);
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Nested scroll handoff sheet (starts empty)");
    await expect(dialog.locator("[data-scrollsheet-nested-scroll]")).toHaveCount(0);

    const toggle = dialog.locator('[data-testid="nested-toggle"]');
    await toggle.click();
    const list = dialog.locator("[data-scrollsheet-nested-scroll]");
    await expect(list).toHaveCount(1);
    expect(await list.evaluate((el) => el.scrollTop)).toBe(0);

    const box = await list.boundingBox();
    if (!box) throw new Error("nested list bounding box unavailable");
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    const client = await page.context().newCDPSession(page);
    try {
      // No listener was ever bound to a specific node — the dialog-level
      // delegated handler resolves the marked element per event via
      // event.target.closest(), so a touch on an element that didn't exist
      // when the session opened is caught all the same.
      await touchStart(client, x, startY);
      expect(await readNestedBoundaryAttr(dialog)).toBe(true);
      await touchEnd(client);
    } finally {
      await client.detach().catch(() => {});
    }

    expect(await readNestedBoundaryAttr(dialog)).toBe(false);
  });
});
