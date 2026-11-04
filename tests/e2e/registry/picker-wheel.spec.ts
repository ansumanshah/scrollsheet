import { expect, test, type Locator, type Page } from "@playwright/test";
import { SPRING_TIMEOUT } from "../helpers";

const ITEM = 40;

async function openByName(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name }).first().click();
  const dialog = page.locator("dialog.scrollsheet-dialog");
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  return dialog;
}

const top = (column: Locator) => column.evaluate((el) => el.scrollTop);

async function closed(page: Page) {
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
    timeout: SPRING_TIMEOUT,
  });
}

test.describe("picker-wheel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/registry");
  });

  test("columns are labelled listboxes that open scrolled to the value", async ({ page }) => {
    const dialog = await openByName(page, "Pick fruit");
    const fruit = dialog.getByRole("listbox", { name: "Fruit" });
    const size = dialog.getByRole("listbox", { name: "Size" });
    await expect(fruit.getByRole("option", { name: "Banana" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await top(fruit)).toBe(1 * ITEM);
    expect(await top(size)).toBe(1 * ITEM);
    await expect(fruit).toHaveCSS("scroll-snap-type", "y mandatory");
    await expect(fruit).toHaveCSS("overscroll-behavior-y", "contain");
  });

  test("a settled scroll becomes the value, applied by Done", async ({ page }) => {
    const dialog = await openByName(page, "Pick fruit");
    const fruit = dialog.getByRole("listbox", { name: "Fruit" });
    await fruit.evaluate((el, y) => el.scrollTo({ top: y, behavior: "instant" }), 4 * ITEM);
    await expect(fruit.getByRole("option", { name: "Elderberry" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("fruit-value")).toHaveText("banana/m");
    await dialog.getByRole("button", { name: "Done" }).click();
    await closed(page);
    await expect(page.getByTestId("fruit-value")).toHaveText("elderberry/m");
  });

  test("Cancel discards the draft", async ({ page }) => {
    const dialog = await openByName(page, "Pick fruit");
    await dialog.getByRole("option", { name: "Fig" }).click();
    await expect(dialog.getByRole("option", { name: "Fig" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await closed(page);
    await expect(page.getByTestId("fruit-value")).toHaveText("banana/m");
    const reopened = await openByName(page, "Pick fruit");
    await expect(reopened.getByRole("option", { name: "Banana" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("keys move the selection and spring the track to the row", async ({ page }) => {
    const dialog = await openByName(page, "Pick fruit");
    const fruit = dialog.getByRole("listbox", { name: "Fruit" });
    await fruit.focus();
    await page.keyboard.press("ArrowDown");
    await expect(fruit.getByRole("option", { name: "Cherry" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect.poll(() => top(fruit)).toBe(2 * ITEM);
    await page.keyboard.press("End");
    await expect.poll(() => top(fruit)).toBe(6 * ITEM);
    await page.keyboard.press("ArrowDown"); // stays at the end
    expect(await top(fruit)).toBe(6 * ITEM);
    await page.keyboard.press("Home");
    await expect.poll(() => top(fruit)).toBe(0);
    await page.keyboard.type("fi");
    await expect(fruit.getByRole("option", { name: "Fig" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(fruit).toHaveAttribute("aria-activedescendant", /.+/);
  });

  test("reduced motion jumps to the row with no tween", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const dialog = await openByName(page, "Pick fruit");
    const fruit = dialog.getByRole("listbox", { name: "Fruit" });
    await fruit.focus();
    await fruit.press("End");
    const immediately = await fruit.evaluate((el) => el.scrollTop);
    expect(immediately).toBe(6 * ITEM);
  });

  test("date wheels follow the locale order and clamp the day to the month", async ({ page }) => {
    const dialog = await openByName(page, /Jan 31, 2024/);
    const names = await dialog.getByRole("listbox").evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label")),
    );
    expect(names).toEqual(["Month", "Day", "Year"]);
    const day = dialog.getByRole("listbox", { name: "Day" });
    await expect(day.getByRole("option")).toHaveCount(31);

    await dialog.getByRole("option", { name: "February" }).click();
    await expect(day.getByRole("option")).toHaveCount(29); // 2024 is a leap year
    await expect(day.getByRole("option", { name: "29" })).toHaveAttribute("aria-selected", "true");

    await dialog.getByRole("option", { name: "2023" }).click();
    await expect(day.getByRole("option")).toHaveCount(28);
    await expect(day.getByRole("option", { name: "28" })).toHaveAttribute("aria-selected", "true");

    await dialog.getByRole("button", { name: "Done" }).click();
    await closed(page);
    await expect(page.getByTestId("date-value")).toHaveText("2023-02-28");
  });
});

test.describe("picker-wheel touch", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "needs CDP scroll gestures");

  test("flinging a wheel snaps to a row and never moves the sheet", async ({ page }) => {
    await page.goto("/registry");
    const dialog = await openByName(page, "Pick fruit");
    const fruit = dialog.getByRole("listbox", { name: "Fruit" });
    const panel = page.locator("[data-slot='picker-sheet-content']");
    const panelBefore = await panel.boundingBox();
    const box = await fruit.boundingBox();
    expect(box && panelBefore).toBeTruthy();
    if (!box) return;

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.synthesizeScrollGesture", {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
      yDistance: -120, // finger up: later rows
      speed: 600,
      gestureSourceType: "touch",
    });
    await expect.poll(async () => (await top(fruit)) % ITEM).toBe(0);
    expect(await top(fruit)).toBeGreaterThan(ITEM);
    const settled = Math.round((await top(fruit)) / ITEM);
    await expect(fruit.getByRole("option").nth(settled)).toHaveAttribute("aria-selected", "true");

    // Fling the other way past the first row: the wheel stops, the sheet stays.
    await cdp.send("Input.synthesizeScrollGesture", {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
      yDistance: 600,
      speed: 3000,
      gestureSourceType: "touch",
    });
    await expect.poll(() => top(fruit)).toBe(0);
    const panelAfter = await panel.boundingBox();
    expect(Math.abs((panelAfter?.y ?? 0) - (panelBefore?.y ?? 0))).toBeLessThan(2);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });
});
