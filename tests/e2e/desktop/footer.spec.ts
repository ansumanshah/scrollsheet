import { type Locator, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openOverlayByTrigger } from "../helpers";

/** The desktop dock floats its panel, so the footer's two edges come apart here. */

const bottomOf = (locator: Locator) =>
  locator.evaluate((el) => el.getBoundingClientRect().bottom);

test("the docked drawer's footer rides the card's bottom edge at full height", async ({ page }) => {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Footer detents");
  const footer = overlay.getByTestId("footer");
  const panel = overlay.locator(".scrollsheet-panel");
  await overlay.locator("[data-scrollsheet-handle]").focus();
  await page.keyboard.press("End");
  await expect(overlay).toHaveAttribute("data-scrollsheet-at-max", "", {
    timeout: SPRING_TIMEOUT,
  });
  await expect
    .poll(async () => (await bottomOf(footer)) - (await bottomOf(panel)), {
      timeout: SPRING_TIMEOUT,
    })
    .toBeCloseTo(0, 0);
  const vp = await page.evaluate(() => window.innerHeight);
  expect(await bottomOf(footer)).toBeLessThan(vp);
});

test("at a partial detent it stays on screen, on the viewport's bottom edge", async ({ page }) => {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Footer detents");
  const footer = overlay.getByTestId("footer");
  const vp = await page.evaluate(() => window.innerHeight);
  await expect
    .poll(() => bottomOf(footer), { timeout: SPRING_TIMEOUT })
    .toBeCloseTo(vp, 0);
});

test("its button takes a mouse click without starting a drag", async ({ page }) => {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Footer detents");
  await overlay.getByTestId("footer-action").click();
  await expect(overlay.getByTestId("footer-clicks")).toHaveText("1");
});

test("dragging from the footer moves the sheet like any other part of the panel", async ({
  page,
}) => {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Footer detents");
  const footer = overlay.getByTestId("footer");
  const track = overlay.locator(".scrollsheet-track");
  const before = await track.evaluate((el) => el.scrollTop);
  const box = await footer.boundingBox();
  if (!box) throw new Error("footer has no box");
  // The far corner of the footer, clear of its button.
  const x = box.x + box.width - 8;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 120, { steps: 8 });
  expect(await track.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 60);
  await page.mouse.up();
});
