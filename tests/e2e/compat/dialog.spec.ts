import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, clickAboveThePanel, openSheetByTrigger } from "../helpers";

/**
 * Radix Dialog compat (src/dialog) — the drop-in surface Root/Trigger/
 * Portal/Overlay/Content/Title/Description/Close render on scrollsheet's
 * side="center" presentation. Unit coverage (tests/unit/compat/
 * dialog-compat.test.tsx) exercises prop mapping, warn-once-strip behavior,
 * and the data-state bridge mechanism in isolation (a synthetic
 * data-scrollsheet-state flip, not real animation timing); this file proves
 * the same claims through a real mounted <dialog> with real WAAPI timing,
 * which the happy-dom unit suite can't reproduce deterministically — same
 * split as vaul.spec.ts / vaul-compat.test.tsx and center.spec.ts.
 *
 * The fixture (DialogAcceptanceModal, tests/e2e/fixtures/app.tsx) replicates
 * a typical design-system Modal: centered, consumer CSS max-width
 * (.fixture-dialog-panel, index.html), and a floating Dialog.Close button.
 */

test("renders scrollsheet's center presentation, centered, with the consumer's own max-width", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Dialog acceptance modal");
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "center");

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewport size unavailable");
  const box = await dialog
    .locator("[data-scrollsheet-panel]")
    .evaluate((el) => el.getBoundingClientRect());
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  expect(Math.abs(centerX - viewport.width / 2)).toBeLessThanOrEqual(2);
  expect(Math.abs(centerY - viewport.height / 2)).toBeLessThanOrEqual(2);
  // .fixture-dialog-panel's own max-width (index.html) — consumer CSS wins,
  // the same contract center.spec.ts pins for the native Sheet path.
  expect(box.width).toBeLessThanOrEqual(400);
});

test("Title/Description wire aria-labelledby/aria-describedby to real elements", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Dialog acceptance modal");
  const titleId = await dialog.evaluate((el) => el.getAttribute("aria-labelledby"));
  const descId = await dialog.evaluate((el) => el.getAttribute("aria-describedby"));
  expect(titleId).toBeTruthy();
  expect(descId).toBeTruthy();
  await expect(page.locator(`#${titleId}`)).toHaveText("Acceptance modal");
  await expect(page.locator(`#${descId}`)).toContainText("design-system Modal");
});

test('data-state is "open" while open and already "closed" while the exit animation is still playing', async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Dialog acceptance modal");
  const panel = dialog.locator("[data-scrollsheet-panel]");
  await expect(panel).toHaveAttribute("data-state", "open");

  await dialog.getByRole("button", { name: "Dismiss", exact: true }).click();
  // Flips quickly (content.tsx's own close-request effect, not the WAAPI
  // exit leg) — well before the ~500ms spring finishes.
  await expect(panel).toHaveAttribute("data-state", "closed");
  // Proves "closed" is stamped DURING the exit animation, not merely once
  // it's gone: the dialog must still be mounted at this instant.
  expect(await page.locator("dialog.scrollsheet-dialog").count()).toBe(1);

  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
    timeout: SPRING_TIMEOUT,
  });
});

test("the floating Dialog.Close button dismisses", async ({ page }) => {
  await page.goto("/");
  await openSheetByTrigger(page, "Dialog acceptance modal");
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
    timeout: SPRING_TIMEOUT,
  });
});

test.describe("backdropDismissible={false}: the non-dismissible-backdrop variant", () => {
  test("backdrop click does NOT close; Esc still does", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Dialog acceptance modal (backdrop blocked)");

    await clickAboveThePanel(page);
    await page.waitForTimeout(500);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });
});
