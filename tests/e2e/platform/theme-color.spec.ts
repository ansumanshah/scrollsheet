import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * themeColorDimming rides a lazily loaded module (theme-color.ts sits behind
 * a dynamic import so non-users never ship it). This spec pins the async
 * path end to end: the controller must arrive after the import resolves and
 * still dim the page's `<meta name="theme-color">` on a travel frame, then
 * restore it on close. A regression that drops the preload, loses the
 * resolved module, or tears down before creation resolves shows up here as
 * a meta that never changes (or never restores).
 */

const readMeta = () =>
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? null;

test("the theme-color meta dims while the sheet is open and restores on close", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Theme color sheet");

  // The fixture's own tag starts white; the controller blends it toward
  // black by the dim progress. Poll, not a fixed wait: creation resolves a
  // microtask (or one chunk fetch) after open, and the write lands on the
  // next travel/settle frame after that.
  await expect
    .poll(() => page.evaluate(readMeta), { timeout: SPRING_TIMEOUT })
    .not.toBe("#ffffff");
  const dimmed = await page.evaluate(readMeta);
  expect(dimmed).not.toBeNull();

  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
    timeout: SPRING_TIMEOUT,
  });
  await expect
    .poll(() => page.evaluate(readMeta), { timeout: SPRING_TIMEOUT })
    .toBe("#ffffff");
});
