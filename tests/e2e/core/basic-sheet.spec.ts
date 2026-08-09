import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, clickAboveThePanel, openSheetByTrigger } from "../helpers";

test.describe("basic sheet open/close", () => {
  test("opens via trigger into a native, open dialog", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0);

    const dialog = await openSheetByTrigger(page, "Basic sheet");
    await expect(dialog).toHaveAttribute("open", "");
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("closes on Escape and unmounts the dialog", async ({ page }) => {
    await page.goto("/");
    await openSheetByTrigger(page, "Basic sheet");

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("closes on the Sheet.Close button and unmounts", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");

    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("dismisses on a click above the panel (track/canvas)", async ({ page }) => {
    await page.goto("/");
    await openSheetByTrigger(page, "Basic sheet");

    await clickAboveThePanel(page);
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("Esc and backdrop-click dismiss without any reliance on the closedby attribute", async ({
    page,
  }) => {
    // The library now sets `closedby` where the engine supports it
    // (platform/platform-dismissal.spec.ts owns that contract), but light
    // dismiss is still our own track/canvas click handler and Esc our own
    // onCancel — both must keep working on engines without `closedby`
    // support. Stripping the attribute after open emulates exactly that.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");
    await dialog.evaluate((el) => el.removeAttribute("closedby"));

    await clickAboveThePanel(page);
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });

    const dialog2 = await openSheetByTrigger(page, "Basic sheet");
    await dialog2.evaluate((el) => el.removeAttribute("closedby"));

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });
});

test.describe("basic sheet accessibility", () => {
  test("dialog aria-labelledby resolves to the Sheet.Title text", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");

    const labelledBy = await dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();

    // useId() ids can contain ":" — use an attribute selector, not a #id CSS selector.
    const title = page.locator(`[id="${labelledBy}"]`);
    await expect(title).toHaveText("Basic");
  });

  test("the panel is role=document and focus lands inside the dialog after open", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");

    const panel = dialog.locator('.scrollsheet-panel[role="document"]');
    await expect(panel).toBeVisible();

    const focusInsideDialog = await page.evaluate(() => {
      const dialogEl = document.querySelector("dialog.scrollsheet-dialog");
      return !!dialogEl && dialogEl.contains(document.activeElement);
    });
    expect(focusInsideDialog).toBe(true);
  });
});
