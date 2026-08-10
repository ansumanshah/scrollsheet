import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, waitForStableScrollTop } from "../helpers";

/**
 * actionsRef: `ActionsRefSheet` (e2e/fixtures/app.tsx) exposes
 * `window.__actionsRefSheet.{open,close,snapTo}` — thin wrappers over the
 * ref's own open()/close()/snapTo(), driven here via `page.evaluate` rather
 * than a real page button, since the sheet is modal: once open, its
 * `<dialog>` makes the rest of the page (any real button included) inert,
 * same reasoning as the `__setReopenSheet`/`__setStackingParentOpen`
 * fixtures elsewhere in this suite.
 */

type ActionsRefWindow = {
  __actionsRefSheet?: { open: () => void; close: () => void; snapTo: (detent: number) => void };
};

const DETENT_TOLERANCE = 2;

/**
 * page.goto resolves on load, which can beat React mounting the fixture —
 * and every call below optional-chains, so a too-early invocation was a
 * silent no-op and the sheet just never opened (this suite's one recurring
 * flake, terminal on CI's slower single-worker runners). Wait for the
 * fixture to actually publish the global before calling through it.
 */
async function actionsReady(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => !!(window as unknown as ActionsRefWindow).__actionsRefSheet);
}

test.describe("actionsRef", () => {
  test("open() opens the sheet", async ({ page }) => {
    await page.goto("/");
    await actionsReady(page);
    await page.evaluate(() => (window as unknown as ActionsRefWindow).__actionsRefSheet?.open());
    const dialog = page.locator("dialog.scrollsheet-dialog");
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("close() closes the sheet", async ({ page }) => {
    await page.goto("/");
    await actionsReady(page);
    await page.evaluate(() => (window as unknown as ActionsRefWindow).__actionsRefSheet?.open());
    const dialog = page.locator("dialog.scrollsheet-dialog");
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });

    await page.evaluate(() => (window as unknown as ActionsRefWindow).__actionsRefSheet?.close());
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("snapTo() travels to the target detent through the same path a controlled activeDetent change uses", async ({
    page,
  }) => {
    await page.goto("/");
    await actionsReady(page);
    await page.evaluate(() => (window as unknown as ActionsRefWindow).__actionsRefSheet?.open());
    const dialog = page.locator("dialog.scrollsheet-dialog");
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });

    const viewportHeight = page.viewportSize()!.height;
    const expected = Math.round(viewportHeight * 0.7);
    const track = dialog.locator(".scrollsheet-track");

    await page.evaluate(() =>
      (window as unknown as ActionsRefWindow).__actionsRefSheet?.snapTo(0.7),
    );

    // Poll toward the target rather than waiting for "stability" — a stable
    // read can win the race against the tween's first frame and report the
    // starting detent as settled.
    await expect
      .poll(async () => track.evaluate((el) => el.scrollTop), { timeout: SPRING_TIMEOUT })
      .toBeGreaterThan(expected - DETENT_TOLERANCE - 1);
    const scrollTop = await waitForStableScrollTop(track);
    expect(Math.abs(scrollTop - expected)).toBeLessThanOrEqual(DETENT_TOLERANCE);

    // onActiveDetentChange fired too — the fixture's own readout reflects it,
    // same as a controlled activeDetent prop change would.
    await expect(dialog.locator("code")).toHaveText("0.7");
  });

  test("snapTo() with a spec outside `detents` rests at the nearest configured detent, but activeDetent/aria-valuenow keep the literal unresolved value", async ({
    page,
  }) => {
    // Pins the documented (mis)behavior: only the panel's *rest position*
    // goes through the nearest-detent fallback (content.tsx's resolveSpec).
    // activeDetent/onActiveDetentChange and Handle's aria-valuenow/
    // aria-valuetext are never normalized — see the JSDoc on
    // SheetActions.snapTo (root.tsx) and warnUnresolvableSnapToDetent
    // (internal/env.ts).
    await page.goto("/");
    await actionsReady(page);
    await page.evaluate(() => (window as unknown as ActionsRefWindow).__actionsRefSheet?.open());
    const dialog = page.locator("dialog.scrollsheet-dialog");
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });

    // fixture's detents=[0.3, 0.7]; 0.4 is not a member of that list. Not
    // 0.5: that sits EXACTLY equidistant between the two detents, and pixel
    // rounding then decides the winner per viewport height (which is how a
    // small-viewport project first caught this spec asserting a coin flip).
    const viewportHeight = page.viewportSize()!.height;
    const expected = Math.round(viewportHeight * 0.3);
    const track = dialog.locator(".scrollsheet-track");

    await page.evaluate(() =>
      (window as unknown as ActionsRefWindow).__actionsRefSheet?.snapTo(0.4),
    );

    // Visual rest position resolves to the nearest configured detent (0.3).
    const scrollTop = await waitForStableScrollTop(track);
    expect(Math.abs(scrollTop - expected)).toBeLessThanOrEqual(DETENT_TOLERANCE);

    // activeDetent/onActiveDetentChange keep the literal, unresolved 0.4.
    await expect(dialog.locator("code")).toHaveText("0.4");

    // Handle's slider value goes missing rather than announcing a
    // fabricated detent — aria-valuenow/aria-valuetext are both omitted.
    const handle = dialog.locator(".scrollsheet-handle");
    await expect(handle).not.toHaveAttribute("aria-valuenow");
    await expect(handle).not.toHaveAttribute("aria-valuetext");
  });
});
