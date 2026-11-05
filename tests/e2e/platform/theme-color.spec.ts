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
  await expect.poll(() => page.evaluate(readMeta), { timeout: SPRING_TIMEOUT }).not.toBe("#ffffff");
  const dimmed = await page.evaluate(readMeta);
  expect(dimmed).not.toBeNull();

  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
    timeout: SPRING_TIMEOUT,
  });
  await expect.poll(() => page.evaluate(readMeta), { timeout: SPRING_TIMEOUT }).toBe("#ffffff");
});

test("center: the meta dims via the open sequence, with no travel frames to carry it", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Theme color center dialog");
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "center");
  await expect
    .poll(() => page.evaluate(readMeta), { timeout: SPRING_TIMEOUT })
    .not.toBe("#ffffff");

  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
    timeout: SPRING_TIMEOUT,
  });
  await expect.poll(() => page.evaluate(readMeta), { timeout: SPRING_TIMEOUT }).toBe("#ffffff");
});

/**
 * A nested sheet snapshots the meta while its parent has it dimmed, so the two
 * must restore child first when a close takes both down in one commit.
 */
for (const action of [
  "Close nested theme parent",
  "Close nested theme both",
  "Unmount nested theme root",
]) {
  test(`nested sheets: "${action}" restores the meta`, async ({ page }) => {
    await page.goto("/");
    const parent = await openSheetByTrigger(page, "Nested theme parent");
    await expect.poll(() => page.evaluate(readMeta), { timeout: SPRING_TIMEOUT }).not.toBe("#ffffff");
    const firstDim = await page.evaluate(readMeta);

    await parent.getByRole("button", { name: "Open nested theme child", exact: true }).click();
    const child = page.locator("dialog.scrollsheet-dialog").nth(1);
    await expect(child).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    await child.getByRole("button", { name: action, exact: true }).click();
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    await expect.poll(() => page.evaluate(readMeta), { timeout: SPRING_TIMEOUT }).toBe("#ffffff");
    // Past any late travel frame, and the next open starts from the real base.
    await page.waitForTimeout(150);
    expect(await page.evaluate(readMeta)).toBe("#ffffff");
    if (action === "Unmount nested theme root") return;

    await openSheetByTrigger(page, "Nested theme parent");
    await expect.poll(() => page.evaluate(readMeta), { timeout: SPRING_TIMEOUT }).toBe(firstDim);
  });
}

test("nested sheets: closing only the child hands the meta back to the parent's dim", async ({
  page,
}) => {
  await page.goto("/");
  const parent = await openSheetByTrigger(page, "Nested theme parent");
  await expect.poll(() => page.evaluate(readMeta), { timeout: SPRING_TIMEOUT }).not.toBe("#ffffff");
  const parentDim = await page.evaluate(readMeta);
  await parent.getByRole("button", { name: "Open nested theme child", exact: true }).click();
  const child = page.locator("dialog.scrollsheet-dialog").nth(1);
  await expect(child).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  await child.getByRole("button", { name: "Close nested theme child", exact: true }).click();
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(1, {
    timeout: SPRING_TIMEOUT,
  });
  await expect.poll(() => page.evaluate(readMeta), { timeout: SPRING_TIMEOUT }).toBe(parentDim);
});
