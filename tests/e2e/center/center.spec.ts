import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * side="center": a centered modal dialog with zoom+fade enter/exit, no
 * travel, no detents, no drag. The fixture's panel carries an explicit
 * consumer width (320px) and a Handle that center mode must hide.
 */

test("opens centered on both axes with the consumer's own width", async ({ page }) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Center dialog");
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "center");

  const viewport = page.viewportSize()!;
  const box = await dialog
    .locator("[data-scrollsheet-panel]")
    .evaluate((el) => el.getBoundingClientRect());
  // Consumer sizing wins: core sets width:auto plus a max-inline-size guard,
  // never a width — the 320 must land exactly.
  expect(Math.round(box.width)).toBe(320);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  expect(Math.abs(centerX - viewport.width / 2)).toBeLessThanOrEqual(2);
  expect(Math.abs(centerY - viewport.height / 2)).toBeLessThanOrEqual(2);
});

test("the enter leg is a zoom+fade animation, not a translate", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Center dialog", exact: true }).click();
  // Sample the panel's live animations during the opening leg. Poll: the
  // leg starts one phase-flip rAF after the trigger click.
  const channels = await page
    .locator("dialog.scrollsheet-dialog [data-scrollsheet-panel]")
    .evaluate(async (el) => {
      for (let i = 0; i < 30; i++) {
        const animations = el.getAnimations();
        if (animations.length > 0) {
          const effect = animations[0]!.effect as KeyframeEffect;
          const frames = effect.getKeyframes();
          return {
            props: Object.keys(frames[0] ?? {}).filter((k) => k === "transform" || k === "opacity"),
            firstTransform: String(frames[0]?.transform ?? ""),
          };
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return null;
    });
  expect(channels).not.toBeNull();
  expect(channels!.props).toContain("transform");
  expect(channels!.props).toContain("opacity");
  expect(channels!.firstTransform).toContain("scale");
  expect(channels!.firstTransform).not.toContain("translate");
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveAttribute(
    "data-scrollsheet-state",
    "open",
    { timeout: SPRING_TIMEOUT },
  );
});

test("backdrop click and Escape both dismiss; the backdrop is dimmed while open", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Center dialog");
  const backdrop = dialog.locator("[data-scrollsheet-backdrop]");
  await expect
    .poll(async () => backdrop.evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity)), {
      timeout: SPRING_TIMEOUT,
    })
    .toBeGreaterThan(0);

  // Click the track well away from the 320px-wide centered panel.
  await page.mouse.click(10, 10);
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
    timeout: SPRING_TIMEOUT,
  });

  const dialog2 = await openSheetByTrigger(page, "Center dialog");
  await dialog2.press("Escape");
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
    timeout: SPRING_TIMEOUT,
  });
});

test("dragging the panel does not move it and never dismisses", async ({ page }) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Center dialog");
  const panel = dialog.locator("[data-scrollsheet-panel]");
  const before = await panel.evaluate((el) => el.getBoundingClientRect().top);

  const box = await panel.boundingBox();
  if (!box) throw new Error("panel bounding box unavailable");
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, box.y + 20 + i * 20);
  await page.mouse.up();

  await page.waitForTimeout(150);
  const after = await panel.evaluate((el) => el.getBoundingClientRect().top);
  expect(after).toBe(before);
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
});

test("center mode hides the Handle", async ({ page }) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Center dialog");
  const handle = dialog.locator("[data-scrollsheet-handle]");
  await expect(handle).toHaveCount(1);
  await expect(handle).toBeHidden();
});
