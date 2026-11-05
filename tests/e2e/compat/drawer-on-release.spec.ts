import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openOverlayByTrigger } from "../helpers";

test("onRelease={false} doesn't throw in the release path", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Drawer onRelease false sheet");
  const box = await overlay.locator("[data-scrollsheet-handle]").boundingBox();
  if (!box) throw new Error("handle has no box");
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, page.viewportSize()!.height - 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0, { timeout: SPRING_TIMEOUT });
  expect(errors).toEqual([]);
});
