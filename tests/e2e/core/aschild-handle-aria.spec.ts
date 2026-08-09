import { expect, test } from "@playwright/test";

import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/** asChild composition (Trigger/Close/Handle) and the Handle's slider semantics. */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Trigger asChild renders the child link with the trigger's behavior merged in", async ({
  page,
}) => {
  const link = page.locator("#aschild-trigger");
  await expect(link).toHaveAttribute("aria-haspopup", "dialog");
  await expect(link).toHaveAttribute("aria-expanded", "false");
  // className merges: the slot's own class plus the child's.
  await expect(link).toHaveClass("btn link");

  await link.click();
  const dialog = page.locator("dialog.scrollsheet-dialog").first();
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  await expect(link).toHaveAttribute("aria-expanded", "true");
});

test("Close asChild renders the consumer's own button and still closes", async ({ page }) => {
  const link = page.locator("#aschild-trigger");
  await link.click();
  const dialog = page.locator("dialog.scrollsheet-dialog").first();
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  await page.locator("#aschild-close").click();
  await expect(dialog).toHaveCount(0, { timeout: SPRING_TIMEOUT });
});

test("multi-detent Handle exposes slider semantics and moves with arrows/Home/End", async ({
  page,
}) => {
  await openSheetByTrigger(page, "Detents (35% / 70% / full)");
  const handle = page.locator("[data-scrollsheet-handle]").first();
  await expect(handle).toHaveRole("slider");
  await expect(handle).toHaveAttribute("aria-orientation", "vertical");
  await expect(handle).toHaveAttribute("aria-valuemin", "0");
  await expect(handle).toHaveAttribute("aria-valuemax", "2");
  await expect(handle).toHaveAttribute("aria-valuenow", "0");
  await expect(handle).toHaveAttribute("aria-valuetext", "35%");

  await handle.focus();
  await handle.press("ArrowUp");
  await expect(handle).toHaveAttribute("aria-valuenow", "1", { timeout: SPRING_TIMEOUT });
  await expect(handle).toHaveAttribute("aria-valuetext", "70%");

  await handle.press("End");
  await expect(handle).toHaveAttribute("aria-valuenow", "2", { timeout: SPRING_TIMEOUT });
  await expect(handle).toHaveAttribute("aria-valuetext", "Full");

  await handle.press("Home");
  await expect(handle).toHaveAttribute("aria-valuenow", "0", { timeout: SPRING_TIMEOUT });
});

// "single-detent Handle stays a plain button — no slider role, no value
// attributes" was demoted to tests/unit/handle-close-variants.test.tsx — a
// pure render-time check (handle.tsx's `multi` flag), no drag/animation/
// native-dialog semantics exercised. See test-shed-audit.md row 12.
