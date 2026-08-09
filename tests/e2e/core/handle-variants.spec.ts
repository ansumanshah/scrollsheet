import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * Handle variants. The outside pill is the risky one: it portals to the
 * canvas layer (outside the panel's overflow clip), and the drag engine's
 * listeners moved from the panel to the dialog so the pill can start drags
 * and receive its captured moves — these specs pin both halves.
 */

async function cdpTouchDrag(
  page: import("@playwright/test").Page,
  x: number,
  startY: number,
  endY: number,
  steps = 16,
): Promise<void> {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: startY }],
    });
    for (let i = 1; i <= steps; i++) {
      const y = startY + ((endY - startY) * i) / steps;
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y }],
      });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await client.detach().catch(() => {});
  }
}

test.describe("Handle variant='outside'", () => {
  test("the pill renders at the canvas layer, above the panel's top edge", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Outside handle sheet");
    const handle = dialog.locator("[data-scrollsheet-handle]");
    await expect(handle).toHaveAttribute("data-scrollsheet-handle-variant", "outside");

    const placement = await page.evaluate(() => {
      const pill = document.querySelector<HTMLElement>("[data-scrollsheet-handle]");
      const panel = document.querySelector<HTMLElement>(".scrollsheet-panel");
      if (!pill || !panel) return null;
      return {
        inPanel: !!pill.closest(".scrollsheet-panel"),
        inCanvas: pill.parentElement?.classList.contains("scrollsheet-canvas") ?? false,
        pillBottom: pill.getBoundingClientRect().bottom,
        panelTop: panel.getBoundingClientRect().top,
      };
    });
    expect(placement).not.toBeNull();
    expect(placement?.inPanel).toBe(false);
    expect(placement?.inCanvas).toBe(true);
    // Above the sheet, with the designed gap (10px, ±2 for rounding).
    expect(placement!.pillBottom).toBeLessThanOrEqual(placement!.panelTop - 8);
  });

  test("a touch drag starting on the pill moves the sheet between detents", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "CDP touch dispatch is Chromium-only");
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Outside handle sheet");
    const track = dialog.locator(".scrollsheet-track");
    const before = await track.evaluate((el) => el.scrollTop);

    const box = await dialog.locator("[data-scrollsheet-handle]").boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await cdpTouchDrag(page, x, y, y - 250);

    await expect(async () => {
      const after = await track.evaluate((el) => el.scrollTop);
      expect(after).toBeGreaterThan(before + 100);
    }).toPass({ timeout: SPRING_TIMEOUT });
  });

  test("clicking the pill still cycles detents through the portal", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Outside handle sheet");
    const track = dialog.locator(".scrollsheet-track");
    const before = await track.evaluate((el) => el.scrollTop);
    await dialog.locator("[data-scrollsheet-handle]").click();
    await expect(async () => {
      const after = await track.evaluate((el) => el.scrollTop);
      expect(Math.abs(after - before)).toBeGreaterThan(50);
    }).toPass({ timeout: SPRING_TIMEOUT });
  });
});

test.describe("Handle variant='outside' on a detached (inset) sheet", () => {
  test("the pill honors the panel-scoped inset via measure()'s canvas mirror", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Outside handle detached sheet");
    const placement = await page.evaluate(() => {
      const pill = document.querySelector<HTMLElement>("[data-scrollsheet-handle]");
      const panel = document.querySelector<HTMLElement>(".scrollsheet-panel");
      if (!pill || !panel) return null;
      return {
        pillBottom: pill.getBoundingClientRect().bottom,
        panelTop: panel.getBoundingClientRect().top,
      };
    });
    expect(placement).not.toBeNull();
    // The panel sits 24px higher than an attached sheet; without the inset
    // mirror the pill computed its offset from 0 and landed a full inset
    // low, overlapping the card. The designed gap is 10px (±3 rounding).
    const gap = placement!.panelTop - placement!.pillBottom;
    expect(gap).toBeGreaterThanOrEqual(7);
    expect(gap).toBeLessThanOrEqual(13);
    await dialog.press("Escape");
  });
});

test.describe("Handle variant='floating'", () => {
  test("the pill overlays the panel instead of taking flow space", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Floating handle sheet");
    const handle = dialog.locator("[data-scrollsheet-handle]");
    await expect(handle).toHaveAttribute("data-scrollsheet-handle-variant", "floating");
    const overlays = await page.evaluate(() => {
      const pill = document.querySelector<HTMLElement>("[data-scrollsheet-handle]");
      const panel = pill?.closest<HTMLElement>(".scrollsheet-panel");
      if (!pill || !panel) return null;
      const pillRect = pill.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      return {
        absolute: getComputedStyle(pill).position === "absolute",
        nearTop: Math.abs(pillRect.top - panelRect.top - 8) <= 2,
      };
    });
    expect(overlays?.absolute).toBe(true);
    expect(overlays?.nearTop).toBe(true);
  });
});
