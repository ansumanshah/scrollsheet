import { expect, test } from "@playwright/test";

import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * Native-<dialog> desync class (the bug class Radix cited when declining to
 * build on <dialog>): a browser-initiated close is uncancellable, so React
 * state must resync to whatever the platform did. Plus hard React-level
 * teardown and multi-dialog edges.
 */

type StackingWindow = { __setStackingParentOpen?: (open: boolean) => void };
type MountWindow = { __setSheetMounted?: (mounted: boolean) => void };

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("a native dialog.close() from outside the library resyncs state and allows reopen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await openSheetByTrigger(page, "Basic sheet");
  await page.evaluate(() =>
    document.querySelector<HTMLDialogElement>("dialog.scrollsheet-dialog")?.close(),
  );
  // The exit animation is necessarily skipped (the dialog is already gone
  // from the top layer), but state must resync and unmount cleanly.
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
    timeout: SPRING_TIMEOUT,
  });
  // And a fresh open right after must not throw a stale showModal().
  await openSheetByTrigger(page, "Basic sheet");
  expect(errors).toEqual([]);
});

test("hard-unmounting the whole sheet mid-animation leaves no residue on the page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.getByRole("button", { name: "Mount toggle sheet", exact: true }).click();
  const dialog = page.locator("dialog.scrollsheet-dialog");
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", /opening|open/);
  // Remove <Sheet.Root> from the tree entirely — not via its open prop.
  await page.evaluate(() => (window as unknown as MountWindow).__setSheetMounted?.(false));
  await expect(dialog).toHaveCount(0);
  const body = await page.evaluate(() => ({
    inert: (document.body as HTMLElement & { inert?: boolean }).inert ?? false,
    pointerEvents: getComputedStyle(document.body).pointerEvents,
    overflow: getComputedStyle(document.body).overflow,
  }));
  expect(body.inert).toBe(false);
  expect(body.pointerEvents).toBe("auto");
  expect(body.overflow).not.toBe("hidden");
  // Remount and open cleanly.
  await page.evaluate(() => (window as unknown as MountWindow).__setSheetMounted?.(true));
  await openSheetByTrigger(page, "Mount toggle sheet");
  expect(errors).toEqual([]);
});

test("closing the parent while its child sheet is still open tears both down cleanly", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.getByRole("button", { name: "Stacking parent", exact: true }).click();
  const parent = page.locator("dialog.scrollsheet-dialog").first();
  await expect(parent).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  await page.getByRole("button", { name: "Open stacking child", exact: true }).click();
  const child = page.locator("dialog.scrollsheet-dialog").nth(1);
  await expect(child).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  await page.evaluate(() => (window as unknown as StackingWindow).__setStackingParentOpen?.(false));
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
    timeout: SPRING_TIMEOUT,
  });
  expect(errors).toEqual([]);
});

test("a parent reopened mid-close stays receded under its still-open child", async ({ page }) => {
  await page.getByRole("button", { name: "Stacking parent", exact: true }).click();
  const parent = page.locator("dialog.scrollsheet-dialog").first();
  await expect(parent).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  await page.getByRole("button", { name: "Open stacking child", exact: true }).click();
  const child = page.locator("dialog.scrollsheet-dialog").nth(1);
  await expect(child).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  const parentScale = () =>
    parent
      .locator(".scrollsheet-panel")
      .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  await expect.poll(parentScale, { timeout: SPRING_TIMEOUT }).toBeLessThan(0.99);

  await page.evaluate(() => (window as unknown as StackingWindow).__setStackingParentOpen?.(false));
  await expect(parent).toHaveAttribute("data-scrollsheet-state", "closing");
  await page.waitForTimeout(120); // partway into the exit leg
  await page.evaluate(() => (window as unknown as StackingWindow).__setStackingParentOpen?.(true));
  await expect(parent).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  // The reopen leg's WAAPI animation masked the child's recede writes while
  // it ran; its finish must re-apply them — the parent may not land
  // full-scale under an open child.
  await expect.poll(parentScale, { timeout: SPRING_TIMEOUT }).toBeLessThan(0.99);
});
