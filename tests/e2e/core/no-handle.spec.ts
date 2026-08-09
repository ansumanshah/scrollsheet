import { type Page, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger, openOverlayByTrigger } from "../helpers";

/**
 * Sheet.Handle is optional — the drag engine listens on the whole panel
 * (content.tsx), not the handle itself (see the doc comment added to
 * src/handle.tsx). These fixtures (e2e/fixtures/app.tsx's NoHandleSheet)
 * render no <Sheet.Handle> at all, across every side and both modal states,
 * to prove drag-to-dismiss on the bare panel doesn't secretly depend on it.
 *
 * Covers the side x modal cross-product via 5 representative cases rather
 * than the full 8 (4 sides x 2 modal states): side-awareness (geometry.ts)
 * and modal-awareness (the pointer-type gate in the drag engine) are two
 * independent, non-interacting code paths, so one non-modal case (bottom)
 * plus all 4 modal sides is full coverage of both axes without redundantly
 * re-testing their combination.
 */

async function mouseDragBy(page: Page, x: number, startY: number, dx: number, dy: number) {
  await page.mouse.move(x, startY);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, startY + (dy * i) / steps);
  }
  await page.mouse.up();
}

test.describe("Handle is optional — modal sides, mouse drag on the bare panel", () => {
  test("No handle bottom: dragging the panel down dismisses it", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "No handle bottom");
    const title = dialog.getByRole("heading", { name: "No handle bottom", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    await mouseDragBy(page, box.x + box.width / 2, box.y + box.height / 2, 0, 400);
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("No handle top: dragging the panel up dismisses it", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "No handle top");
    const title = dialog.getByRole("heading", { name: "No handle top", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    await mouseDragBy(page, box.x + box.width / 2, box.y + box.height / 2, 0, -400);
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("No handle left: dragging the panel left dismisses it", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "No handle left");
    const title = dialog.getByRole("heading", { name: "No handle left", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    // Left/right detents are fractions of the *viewport width* (390px on
    // this project), not height (844px) — a 400px drag, fine for the
    // bottom/top cases above, pushes the mouse coordinate well past the
    // right/left edge of a 390px-wide viewport here. 250px comfortably
    // clears the dismiss threshold (half of the 0.5 first detent, ~98px)
    // without leaving the viewport.
    await mouseDragBy(page, box.x + box.width / 2, box.y + box.height / 2, -250, 0);
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("No handle right: dragging the panel right dismisses it", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "No handle right");
    const title = dialog.getByRole("heading", { name: "No handle right", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    // The heading's own *layout* box (350px, panel's fixed max-detent width
    // minus padding) is wider than the 195px currently *revealed* at this
    // 0.5 detent — its reported center therefore lands right at the
    // viewport's own right edge (clipped, unreliable to click/drag from).
    // A fixed offset from the box's near edge (which panel's overflow does
    // keep on-screen) is a stable start point instead.
    await mouseDragBy(page, box.x + 30, box.y + box.height / 2, 250, 0);
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });
});

test.describe("Handle is optional — non-modal, mouse drag on the bare panel", () => {
  test("No handle non-modal: dragging the panel down dismisses it (mouse always allowed, modal or not)", async ({
    page,
  }) => {
    await page.goto("/");
    const overlay = await openOverlayByTrigger(page, "No handle non-modal");
    const title = overlay.getByRole("heading", { name: "No handle non-modal", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");

    await mouseDragBy(page, box.x + box.width / 2, box.y + box.height / 2, 0, 400);
    await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0, { timeout: SPRING_TIMEOUT });
  });
});
