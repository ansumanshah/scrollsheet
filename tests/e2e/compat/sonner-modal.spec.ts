import { expect, type Page, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * A modal `<dialog>` paints over everything outside the top layer and makes
 * the rest of the document inert, so the page-level Toaster has to live inside
 * the topmost modal to be seen, clicked, and announced.
 */

const ROW = "[data-sonner-toaster] .scrollsheet-toast[data-mounted]";

/** True when a real click at the row's center would land on the row itself. */
async function rowIsHit(page: Page, title: string): Promise<boolean> {
  const row = page.locator(ROW, { hasText: title });
  await expect(row).toHaveCSS("opacity", "1", { timeout: SPRING_TIMEOUT });
  return row.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return !!hit && el.contains(hit);
  });
}

test.describe("sonner compat: page-level Toaster with a modal sheet", () => {
  test("a toast fired inside a modal sheet paints above it and takes real clicks", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Sonner modal: open sheet");
    await page.getByRole("button", { name: "Sonner modal: fire from sheet", exact: true }).click();

    expect(await rowIsHit(page, "From the sheet")).toBe(true);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(ROW, { hasText: "From the sheet" })).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    expect(
      await page.evaluate(
        () => (window as unknown as { __sonnerModalAction?: number }).__sonnerModalAction,
      ),
    ).toBe(1);
    // The click stayed on the toast: no backdrop dismissal of the sheet.
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("toast events don't replay to the React parents of the sheet hosting them", async ({
    page,
  }) => {
    await page.goto("/");
    await openSheetByTrigger(page, "Sonner modal: open sheet");
    await page.getByRole("button", { name: "Sonner modal: fire from sheet", exact: true }).click();
    await expect(page.locator(ROW, { hasText: "From the sheet" })).toHaveCSS("opacity", "1", {
      timeout: SPRING_TIMEOUT,
    });
    const clicks = () =>
      page.evaluate(
        () => (window as unknown as { __sheetParentClicks?: number }).__sheetParentClicks ?? 0,
      );
    const before = await clicks();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(ROW, { hasText: "From the sheet" })).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    expect(await clicks()).toBe(before);
  });

  test("Esc with focus in a toast acts on the toast and leaves the sheet open", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Sonner modal: open sheet");
    await page.getByRole("button", { name: "Sonner modal: fire from sheet", exact: true }).click();
    await expect(page.locator(ROW, { hasText: "From the sheet" })).toHaveCSS("opacity", "1", {
      timeout: SPRING_TIMEOUT,
    });
    await page.getByRole("button", { name: "Undo", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(ROW, { hasText: "From the sheet" })).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    await page.waitForTimeout(700);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("a toast can be swiped away inside a modal sheet", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Sonner modal: open sheet");
    await page.getByRole("button", { name: "Sonner modal: fire from sheet", exact: true }).click();
    const row = page.locator(ROW, { hasText: "From the sheet" });
    await expect(row).toHaveCSS("opacity", "1", { timeout: SPRING_TIMEOUT });
    const box = await row.boundingBox();
    if (!box) throw new Error("no toast");
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 40, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, y, { steps: 3 });
    await page.mouse.move(box.x + 160, y, { steps: 3 });
    await page.mouse.up();
    await expect(row).toHaveCount(0, { timeout: SPRING_TIMEOUT });
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("a toast already showing stays usable when a sheet opens over it, and after it closes", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sonner modal: fire from page", exact: true }).click();
    expect(await rowIsHit(page, "From the page")).toBe(true);

    const dialog = await openSheetByTrigger(page, "Sonner modal: open sheet");
    expect(await rowIsHit(page, "From the page")).toBe(true);

    // Not a real click: the toast now legitimately sits over this button.
    await dialog
      .getByRole("button", { name: "Sonner modal: close sheet", exact: true })
      .dispatchEvent("click");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    expect(await rowIsHit(page, "From the page")).toBe(true);
  });

  test("the toast follows the topmost sheet in and out of a nested stack", async ({ page }) => {
    await page.goto("/");
    await openSheetByTrigger(page, "Sonner modal: open sheet");
    const nested = await openSheetByTrigger(page, "Sonner modal: open nested sheet", 1);

    await page
      .getByRole("button", { name: "Sonner modal: fire from nested sheet", exact: true })
      .click();
    expect(await rowIsHit(page, "From the nested")).toBe(true);

    await nested
      .getByRole("button", { name: "Sonner modal: close nested sheet", exact: true })
      .dispatchEvent("click");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(1, {
      timeout: SPRING_TIMEOUT,
    });
    expect(await rowIsHit(page, "From the nested")).toBe(true);
  });

  test("a consumer's native dialog works too: show order wins, and removal while open recovers", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sonner modal: fire from page", exact: true }).click();
    expect(await rowIsHit(page, "From the page")).toBe(true);

    // The later-shown dialog sits EARLIER in the document: document order
    // alone would pick the blocked one.
    await page.evaluate(() => {
      for (const [id, place] of [
        ["shown-last", "prepend"],
        ["shown-first", "append"],
      ] as const) {
        const d = document.createElement("dialog");
        d.id = id;
        document.body[place](d);
      }
      (document.getElementById("shown-first") as HTMLDialogElement).showModal();
    });
    await expect(page.locator("#shown-first [data-sonner-toaster]").first()).toBeAttached();
    await page.evaluate(() =>
      (document.getElementById("shown-last") as HTMLDialogElement).showModal(),
    );
    expect(await rowIsHit(page, "From the page")).toBe(true);

    // Removed without close(), taking anything left inside it along.
    await page.evaluate(() => document.getElementById("shown-last")?.remove());
    expect(await rowIsHit(page, "From the page")).toBe(true);
    await page.evaluate(() => document.getElementById("shown-first")?.remove());
    expect(await rowIsHit(page, "From the page")).toBe(true);
  });
});
