import { expect, test, type Page } from "@playwright/test";
import { SPRING_TIMEOUT } from "../helpers";

async function openPalette(page: Page) {
  await page.getByRole("button", { name: "Open palette" }).click();
  const dialog = page.locator("dialog.scrollsheet-dialog");
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  return dialog;
}

test.describe("command-palette", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/registry");
  });

  test("renders grouped commands behind a labelled combobox", async ({ page }) => {
    const dialog = await openPalette(page);
    const input = dialog.getByRole("combobox", { name: "Command menu" });
    await expect(input).toHaveAttribute("aria-controls", /.+/);
    await expect(dialog.getByRole("group", { name: "File" })).toBeVisible();
    await expect(dialog.getByRole("group", { name: "View" })).toBeVisible();
    await expect(dialog.getByRole("option", { name: "Save all" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("ranks a label prefix above a later word match", async ({ page }) => {
    const dialog = await openPalette(page);
    await dialog.getByRole("combobox").fill("open");
    const labels = await dialog.getByRole("option").allTextContents();
    expect(labels[0]).toContain("Open recent");
    expect(labels).toContain("Open new tab");
    await dialog.getByRole("combobox").fill("history");
    await expect(dialog.getByRole("option")).toHaveCount(1);
  });

  test("Enter runs the highlighted command and closes", async ({ page }) => {
    const dialog = await openPalette(page);
    const input = dialog.getByRole("combobox");
    await input.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    await expect(page.getByTestId("palette-ran")).toHaveText("open");
  });

  test("arrow navigation skips disabled commands and tapping runs one", async ({ page }) => {
    const dialog = await openPalette(page);
    const input = dialog.getByRole("combobox");
    await input.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const id = await input.getAttribute("aria-activedescendant");
    await expect(page.locator(`[id="${id}"]`)).toHaveText(/Toggle theme/);

    await dialog.getByRole("option", { name: "Zoom in" }).click();
    await expect(page.getByTestId("palette-ran")).toHaveText("zoom");
  });

  test("shows an empty state and Escape closes without running anything", async ({ page }) => {
    const dialog = await openPalette(page);
    await dialog.getByRole("combobox").fill("qqqq");
    await expect(dialog.getByText("No results")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    await expect(page.getByTestId("palette-ran")).toHaveText("none");
  });

  test("presents as a bottom sheet at phone width", async ({ page }) => {
    const dialog = await openPalette(page);
    await expect(dialog).toHaveAttribute("data-scrollsheet-side", "bottom");
  });
});
