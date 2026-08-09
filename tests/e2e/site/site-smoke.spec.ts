import { type Page, expect, test } from "@playwright/test";

/**
 * Smoke test for the real built site (see playwright.site.config.ts), not
 * the e2e/fixtures/ harness the rest of this suite runs against. Just
 * enough to catch "the site shipped broken": the homepage hero wires up a
 * live phone frame at desktop widths, and the page it embeds
 * (docs/src/pages/embed/hero.astro) opens a real, draggable dialog on
 * load. Not a re-run of the library's own behavioral coverage.
 */

const SPRING_TIMEOUT = 3000;

/**
 * Same technique as the desktop-drag mouse helper in e2e/desktop-drag.spec.ts:
 * a stepped mouse drag ending with a few repeated moves at the final
 * position so the drag engine's rolling velocity sample settles near zero
 * before release, instead of a fast synthetic drag overshooting on fling.
 */
async function mouseDrag(page: Page, x: number, startY: number, endY: number, steps = 16) {
  await page.mouse.move(x, startY);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const y = startY + ((endY - startY) * i) / steps;
    await page.mouse.move(x, y);
  }
  for (let i = 0; i < 4; i++) await page.mouse.move(x, endY);
  await page.mouse.up();
}

test("homepage hero wires the phone frame to the live embed at desktop widths", async ({
  page,
}) => {
  await page.goto("/");

  const iframe = page.locator(".phone-frame-iframe");
  await expect(iframe).toBeVisible();
  // The hero's inline script only points the iframe at the embed once
  // matchMedia confirms there's room for the phone frame (>=980px) — this
  // config's 1280x800 viewport clears that, so a mobile visitor never pays
  // for the fetch this assertion is waiting on.
  await expect(iframe).toHaveAttribute("src", /\/embed\/hero$/, { timeout: SPRING_TIMEOUT });

  // The inline mobile-trigger fallback stays out of the layout at this
  // width; it should not be the thing rendering here.
  await expect(page.locator(".hero-inline-demo")).toBeHidden();
});

test("the embed page opens a real dialog on load, already draggable", async ({ page }) => {
  await page.goto("/embed/hero");

  const dialog = page.locator("dialog.scrollsheet-dialog");
  await expect(dialog).toHaveAttribute("open", "", { timeout: SPRING_TIMEOUT });
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  // Opened at its mid (0.5) detent, not the "full" one.
  await expect(dialog).not.toHaveAttribute("data-scrollsheet-at-max", "");

  const grab = dialog.getByRole("heading").first();
  const box = await grab.boundingBox();
  if (!box) throw new Error("heading bounding box unavailable");

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewport size unavailable");

  // Drag up 60% of the viewport height, past the second detent's threshold,
  // to reach the "full" detent.
  const dragDistance = viewport.height * 0.6;
  await mouseDrag(
    page,
    box.x + box.width / 2,
    box.y + box.height / 2,
    box.y + box.height / 2 - dragDistance,
  );
  await expect(dialog).toHaveAttribute("data-scrollsheet-at-max", "", { timeout: SPRING_TIMEOUT });

  // The demo sheet is non-dismissible (there is no trigger in the frame to
  // reopen it), so a drag back down past where a dismiss threshold would
  // normally fire must leave it open, snapped back to a resting detent.
  const dragBack = viewport.height * 0.6;
  await mouseDrag(
    page,
    box.x + box.width / 2,
    box.y + box.height / 2,
    box.y + box.height / 2 + dragBack,
  );
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
});
