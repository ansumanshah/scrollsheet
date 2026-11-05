import { type Locator, type Page, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * Behaviours reported against vaul (emilkowalski/vaul#346, linked from
 * shadcn-ui/ui#8455) exercised on scrollsheet's Drawer. Mouse input only:
 * touch long-press selection and real Safari are not reproducible here.
 */
const selectedText = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? "");

async function copyBox(dialog: Locator) {
  const box = await dialog.getByTestId("selectable-copy").boundingBox();
  if (!box) throw new Error("copy bounding box unavailable");
  return box;
}

const trackScroll = (dialog: Locator) =>
  dialog.locator(".scrollsheet-track").evaluate((el) => (el as HTMLElement).scrollTop);

for (const [trigger, label] of [
  ["Drawer selectable text sheet", "default"],
  ["Drawer selectable text handleOnly sheet", "handleOnly"],
] as const) {
  test.describe(`vaul#346 text selection in a Drawer (${label})`, () => {
    test("body text is not user-select:none while open", async ({ page }) => {
      await page.goto("/");
      const dialog = await openSheetByTrigger(page, trigger);
      const values = await dialog.evaluate((el) => {
        const p = el.querySelector<HTMLElement>("[data-testid=selectable-copy]");
        const panel = el.querySelector<HTMLElement>(".scrollsheet-panel");
        return [p, panel].map((n) => (n ? getComputedStyle(n).userSelect : "missing"));
      });
      expect(values).not.toContain("none");
      expect(values).not.toContain("missing");
    });

    test("a horizontal mouse drag across the text selects it and leaves the drawer open and still", async ({
      page,
    }) => {
      await page.goto("/");
      const dialog = await openSheetByTrigger(page, trigger);
      const box = await copyBox(dialog);
      const before = await trackScroll(dialog);
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + 2, y);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(box.x + 2 + ((box.width - 4) * i) / 12, y);
      }
      await page.mouse.up();
      expect(await selectedText(page)).toContain("alpha bravo");
      await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
      expect(await trackScroll(dialog)).toBe(before);
    });

    test("double-click selects a word and the drawer stays open", async ({ page }) => {
      await page.goto("/");
      const dialog = await openSheetByTrigger(page, trigger);
      const box = await copyBox(dialog);
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
      expect((await selectedText(page)).trim().length).toBeGreaterThan(2);
      await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
    });
  });
}

test("vaul#346 counterpart: selection support does not kill the sheet's own mouse drag from body text", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Drawer selectable text sheet");
  const box = await copyBox(dialog);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(x, y + i * 20);
  await page.mouse.up();
  await expect(dialog).not.toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
});

// scrollsheet does sniff iOS, but only to load its body-freeze module (env.ts isIOS); the
// drag engine has no platform branches. This pins that the iOS path leaves dragging intact.
test.describe("shadcn#8455 drag stays intact on the iOS code path (iPhone user agent)", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });

  test("handle drag still dismisses with navigator.platform = iPhone", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "platform", { get: () => "iPhone" });
    });
    await page.goto("/");
    expect(await page.evaluate(() => navigator.platform)).toBe("iPhone");
    const dialog = await openSheetByTrigger(page, "Drawer selectable text sheet");
    const handle = dialog.locator("[data-scrollsheet-handle]").first();
    const hb = await handle.boundingBox();
    if (!hb) throw new Error("handle box unavailable");
    const x = hb.x + hb.width / 2;
    const y = hb.y + hb.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(x, y + i * 20);
    await page.mouse.up();
    await expect(dialog).not.toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
  });
});
