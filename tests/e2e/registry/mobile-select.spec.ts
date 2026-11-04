import { expect, test, type Page } from "@playwright/test";
import { SPRING_TIMEOUT } from "../helpers";

async function openSelect(page: Page, name: string) {
  await page.getByRole("button", { name }).click();
  const dialog = page.locator("dialog.scrollsheet-dialog");
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  return dialog;
}

test.describe("mobile-select", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/registry");
  });

  test("opens as a dialog with a combobox over a listbox", async ({ page }) => {
    const dialog = await openSelect(page, "Pick a country");
    const input = dialog.getByRole("combobox", { name: "Search" });
    const list = dialog.getByRole("listbox", { name: "Country" });
    await expect(input).toHaveAttribute("aria-controls", (await list.getAttribute("id")) ?? "");
    await expect(input).toHaveAttribute("aria-autocomplete", "list");
    await expect(dialog.getByRole("group", { name: "Europe" })).toBeVisible();
    await expect(dialog.getByRole("option", { name: "Chile" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("filters accent-insensitively and by keyword, announcing the count", async ({ page }) => {
    const dialog = await openSelect(page, "Pick a country");
    const input = dialog.getByRole("combobox");
    await input.fill("espana");
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await expect(dialog.getByRole("option", { name: /España/ })).toBeVisible();
    await expect(dialog.getByRole("status").filter({ hasText: "1 result" })).toHaveCount(1);

    await input.fill("deutsch");
    await expect(dialog.getByRole("option", { name: "Germany" })).toBeVisible();

    await input.fill("zzzz");
    await expect(dialog.getByRole("option")).toHaveCount(0);
    await expect(dialog.getByText("No results")).toBeVisible();
  });

  test("arrow keys move aria-activedescendant, skip disabled, Enter selects", async ({ page }) => {
    const dialog = await openSelect(page, "Pick a country");
    const input = dialog.getByRole("combobox");
    await input.focus();
    const active = async () => {
      const id = await input.getAttribute("aria-activedescendant");
      return page.locator(`[id="${id}"]`).getAttribute("data-value");
    };
    expect(await active()).toBe("br");
    await page.keyboard.press("ArrowDown");
    expect(await active()).toBe("ca");
    await page.keyboard.press("ArrowDown");
    expect(await active()).toBe("de"); // Chile is disabled
    await page.keyboard.press("ArrowUp");
    expect(await active()).toBe("ca");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp"); // wraps to the last enabled option
    expect(await active()).toBe("x29");

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    await expect(page.getByTestId("select-value")).toHaveText("ca");
    await expect(page.getByRole("button", { name: "Canada" })).toBeFocused();
    await expect(page.locator('input[type="hidden"][name="country"]')).toHaveValue("ca");
  });

  test("keeps the active option inside the list's own viewport", async ({ page }) => {
    const dialog = await openSelect(page, "Pick a country");
    const input = dialog.getByRole("combobox");
    await input.focus();
    await page.keyboard.press("ArrowUp"); // last option, far below the fold
    const inside = await page.evaluate(() => {
      const list = document.querySelector('[role="listbox"]') as HTMLElement;
      const node = document.querySelector('[role="option"][data-active]') as HTMLElement;
      const l = list.getBoundingClientRect();
      const n = node.getBoundingClientRect();
      return n.top >= l.top - 1 && n.bottom <= l.bottom + 1;
    });
    expect(inside).toBe(true);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("tapping an option selects it and closes", async ({ page }) => {
    const dialog = await openSelect(page, "Pick a country");
    await dialog.getByRole("option", { name: "Japan" }).click();
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    await expect(page.getByTestId("select-value")).toHaveText("jp");
  });

  test("a disabled option does not select", async ({ page }) => {
    const dialog = await openSelect(page, "Pick a country");
    await dialog.getByRole("option", { name: "Chile" }).click({ force: true });
    await expect(page.getByTestId("select-value")).toHaveText("none");
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("Escape closes without changing the value", async ({ page }) => {
    await openSelect(page, "Pick a country");
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    await expect(page.getByTestId("select-value")).toHaveText("none");
  });

  test("reopening starts on the selected option with a fresh query", async ({ page }) => {
    let dialog = await openSelect(page, "Pick a country");
    await dialog.getByRole("combobox").fill("jap");
    await dialog.getByRole("option", { name: "Japan" }).click();
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    dialog = await openSelect(page, "Japan");
    await expect(dialog.getByRole("combobox")).toHaveValue("");
    await expect(dialog.getByRole("option", { name: "Japan" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(dialog.getByRole("option", { name: "Japan" })).toHaveAttribute("data-active", "");
  });

  test("without a search field the listbox takes keys and matches typed prefixes", async ({
    page,
  }) => {
    const dialog = await openSelect(page, "Plain list");
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    const list = dialog.getByRole("listbox");
    await list.focus();
    await page.keyboard.type("ja");
    await expect(list).toHaveAttribute("aria-activedescendant", /.+/);
    await expect(dialog.locator('[role="option"][data-active]')).toHaveAttribute(
      "data-value",
      "jp",
    );
    await page.keyboard.press("End");
    await expect(dialog.locator('[role="option"][data-active]')).toHaveAttribute(
      "data-value",
      "kr",
    );
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "South Korea" })).toBeVisible({
      timeout: SPRING_TIMEOUT,
    });
  });
});
