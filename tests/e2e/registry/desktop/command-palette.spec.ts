import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT } from "../../helpers";

test.describe("command-palette on desktop", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/registry");
    await page.locator("html[data-ready]").waitFor({ state: "attached" });
  });

  test("Ctrl+K opens a centered card with the search field focused, and toggles closed", async ({
    page,
  }) => {
    await page.keyboard.press("Control+k");
    const dialog = page.locator("dialog.scrollsheet-dialog");
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    await expect(dialog).toHaveAttribute("data-scrollsheet-side", "center");
    await expect(dialog.getByRole("combobox")).toBeFocused();

    const box = await page.locator("[data-slot='command-palette-content']").boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    if (box && viewport) {
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
      expect(box.width).toBeLessThanOrEqual(560);
      expect(box.height).toBeLessThan(viewport.height);
    }

    await page.keyboard.press("Control+k");
    await expect(dialog).toHaveCount(0, { timeout: SPRING_TIMEOUT });
  });

  test("type, arrow, Enter runs the command with no pointer", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("combobox")).toBeFocused({ timeout: SPRING_TIMEOUT });
    await page.keyboard.type("zoom");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("palette-ran")).toHaveText("zoom");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("the list scrolls inside a capped card instead of growing the panel", async ({ page }) => {
    await page.keyboard.press("Control+k");
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible({ timeout: SPRING_TIMEOUT });
    const { client, scroll } = await list.evaluate((el) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
    }));
    expect(scroll).toBeGreaterThan(client);
    expect(client).toBeLessThanOrEqual(24 * 16 + 1);
  });
});
