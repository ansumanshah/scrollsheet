import { type Locator, type Page, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openOverlayByTrigger } from "../helpers";

/**
 * A press on a field or button skips the drag engine, so nothing captures the
 * pointer and a release outside the panel clicks their common ancestor: the
 * canvas, the same target a real outside click has.
 */

const center = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** A viewport point the hit test resolves to the track or canvas. */
const outsidePoint = (page: Page) =>
  page.evaluate(() => {
    for (const [x, y] of [
      [innerWidth / 2, 10],
      [10, innerHeight / 2],
      [innerWidth - 10, innerHeight / 2],
    ] as const) {
      if (document.elementFromPoint(x, y)?.matches(".scrollsheet-track, .scrollsheet-canvas")) {
        return { x, y };
      }
    }
    throw new Error("no outside point: the panel covers every candidate");
  });

async function pressAndReleaseOutside(page: Page, target: Locator) {
  const from = await center(target);
  const to = await outsidePoint(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

for (const [name, target] of [
  ["a field", (overlay: Locator) => overlay.getByRole("textbox", { name: "Top field" })],
  ["a button", (overlay: Locator) => overlay.getByTestId("footer-action")],
] as const) {
  test(`a press on ${name} released outside the panel keeps the sheet open`, async ({ page }) => {
    await page.goto("/");
    const overlay = await openOverlayByTrigger(page, "Footer detents");
    await pressAndReleaseOutside(page, target(overlay));
    await page.waitForTimeout(600);
    await expect(overlay).toHaveAttribute("data-scrollsheet-state", "open");
  });
}

test("a press that began outside still dismisses after a press inside was abandoned", async ({
  page,
}) => {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Footer detents");
  await pressAndReleaseOutside(page, overlay.getByRole("textbox", { name: "Top field" }));
  const { x, y } = await outsidePoint(page);
  await page.mouse.click(x, y);
  await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0, { timeout: SPRING_TIMEOUT });
});
