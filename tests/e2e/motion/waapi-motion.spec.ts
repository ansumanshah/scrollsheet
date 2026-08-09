import { expect, test } from "@playwright/test";

import { SPRING_TIMEOUT, openSheetByTrigger, waitForStableScrollTop } from "../helpers";

/**
 * The WAAPI enter/exit legs (src/internal/animate.ts): exact completion
 * signals instead of duration+50ms timers, a velocity-carrying retarget on
 * reopen-mid-close, and a mid-entrance grab that hands the frozen position
 * to the drag/scroll engine.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("grabbing the sheet mid-entrance freezes it and hands off to the drag engine", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Detents (35% / 70% / full)", exact: true }).click();
  const dialog = page.locator("dialog.scrollsheet-dialog").first();
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", /opening|open/);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewport size unavailable");

  // The panel rises from the bottom edge — wait until its lead edge is under
  // the grab point (~40% through the ~508ms entrance), then grab. Grabbing
  // earlier would land on the empty track, whose click is light-dismiss.
  // x is offset from center so the grab lands on panel body, not the Handle.
  const grabY = viewport.height - 12;
  await page.waitForFunction(
    (y) => {
      const panel = document.querySelector(".scrollsheet-panel");
      return !!panel && panel.getBoundingClientRect().top <= y - 8;
    },
    grabY,
    { polling: "raf", timeout: 2000 },
  );
  await page.mouse.move(viewport.width / 2 - 80, grabY);
  await page.mouse.down();

  // Grabbed: the phase must flip to 'open' synchronously with the grab —
  // well before the entrance's remaining ~300ms would have elapsed.
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", { timeout: 250 });

  // Held still: the sheet must be frozen, not continuing its entrance.
  const panel = dialog.locator(".scrollsheet-panel");
  const before = await panel.evaluate((el) => el.getBoundingClientRect().top);
  await page.waitForTimeout(150);
  const after = await panel.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);

  // Released without moving: resumes to the intended first detent — never
  // dismissed on the partial position the grab happened to freeze.
  await page.mouse.up();
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  const track = dialog.locator(".scrollsheet-track");
  await waitForStableScrollTop(track);
  const revealed = await track.evaluate((el) => el.scrollTop);
  expect(revealed).toBeGreaterThan(0); // still open, not dismissed
  await expect(page.getByRole("heading", { name: "Detents" })).toBeVisible();
});

test("dragging after a mid-entrance grab moves the sheet immediately", async ({ page }) => {
  await page.getByRole("button", { name: "Detents (35% / 70% / full)", exact: true }).click();
  const dialog = page.locator("dialog.scrollsheet-dialog").first();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewport size unavailable");

  const grabY = viewport.height - 12;
  await page.waitForFunction(
    (y) => {
      const panel = document.querySelector(".scrollsheet-panel");
      return !!panel && panel.getBoundingClientRect().top <= y - 8;
    },
    grabY,
    { polling: "raf", timeout: 2000 },
  );
  await page.mouse.move(viewport.width / 2 - 80, grabY);
  await page.mouse.down();
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", { timeout: 250 });

  // Drag upward: the scroll engine must respond in the same gesture, with no
  // entrance animation left fighting it.
  const track = dialog.locator(".scrollsheet-track");
  const grabbedAt = await track.evaluate((el) => el.scrollTop);
  await page.mouse.move(viewport.width / 2, viewport.height - 240, { steps: 8 });
  const draggedTo = await track.evaluate((el) => el.scrollTop);
  expect(draggedTo).toBeGreaterThan(grabbedAt + 100);
  await page.mouse.up();
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
});

test("reopening mid-close retargets from the current position, not a cold restart", async ({
  page,
}) => {
  type ReopenWindow = { __setReopenSheet?: (open: boolean) => void };
  await openSheetByTrigger(page, "Reopen fixture");
  const dialog = page.locator("dialog.scrollsheet-dialog").first();
  const panel = dialog.locator(".scrollsheet-panel");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewport size unavailable");

  await page.evaluate(() => (window as unknown as ReopenWindow).__setReopenSheet?.(false));
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "closing");
  await page.waitForTimeout(150); // partway through the ~508ms exit

  const midExitTop = await panel.evaluate((el) => el.getBoundingClientRect().top);
  await page.evaluate(() => (window as unknown as ReopenWindow).__setReopenSheet?.(true));
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "opening");
  await page.waitForTimeout(80);
  const reopenedTop = await panel.evaluate((el) => el.getBoundingClientRect().top);

  // A cold restart would snap the panel back to fully offscreen (top ≈
  // viewport height) before animating in; a retarget continues from the
  // mid-exit position, so shortly after the reopen it can only be at or
  // above where the exit left it (plus a small settle margin).
  expect(reopenedTop).toBeLessThan(viewport.height - 10);
  expect(reopenedTop).toBeLessThanOrEqual(midExitTop + 60);

  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
});

test("prefers-reduced-motion opens and closes without the travel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Basic sheet", exact: true }).click();
  const dialog = page.locator("dialog.scrollsheet-dialog").first();
  // The instant leg settles in a microtask — far inside the 508ms spring.
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", { timeout: 400 });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 400 });
});

test("the enter leg is a real animation with real duration, not an instant snap", async ({
  page,
}) => {
  // Kill-rate guard: forcing every leg to durationMs 0 must fail this test.
  // Sample WAAPI animations right after the trigger click, while the enter
  // leg should still be in flight.
  await page.goto("/");
  await page.getByRole("button", { name: "Basic sheet", exact: true }).click();
  const found = await page.evaluate(
    () =>
      new Promise<{ count: number; maxDuration: number }>((resolve) => {
        const started = performance.now();
        const probe = () => {
          const panel = document.querySelector(".scrollsheet-panel");
          const animations = panel ? panel.getAnimations() : [];
          const durations = animations.map((a) => {
            const d = a.effect?.getComputedTiming().duration;
            return typeof d === "number" ? d : 0;
          });
          if (durations.length > 0) {
            resolve({ count: durations.length, maxDuration: Math.max(...durations) });
            return;
          }
          if (performance.now() - started > 1500) {
            resolve({ count: 0, maxDuration: 0 });
            return;
          }
          requestAnimationFrame(probe);
        };
        probe();
      }),
  );
  expect(found.count).toBeGreaterThan(0);
  expect(found.maxDuration).toBeGreaterThanOrEqual(150);
});

test("onOpenChangeComplete still fires at both ends of the WAAPI legs", async ({ page }) => {
  // The controlled sheet's open flag round-trips through open → close; the
  // completion callback is what unmounts it (state flips to 'pre'), so the
  // dialog disappearing at all proves the exit leg's finished signal fired.
  const dialog = await openSheetByTrigger(page, "Controlled (external state)");
  await page.getByRole("button", { name: "Close from outside", exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: SPRING_TIMEOUT });
});
