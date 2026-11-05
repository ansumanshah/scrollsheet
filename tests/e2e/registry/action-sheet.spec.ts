import { expect, test, type Page } from "@playwright/test";
import { SPRING_TIMEOUT } from "../helpers";

async function openActions(page: Page) {
  await page.getByRole("button", { name: "Photo actions" }).click();
  const dialog = page.locator("dialog.scrollsheet-dialog");
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  return dialog;
}

async function closed(page: Page) {
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
    timeout: SPRING_TIMEOUT,
  });
}

test.describe("action-sheet", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/registry");
  });

  test("names the dialog from its title and describes it", async ({ page }) => {
    const dialog = await openActions(page);
    await expect(dialog).toHaveAccessibleName("Photo");
    await expect(dialog).toHaveAccessibleDescription("Choose what to do with this photo");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("an action runs its handler and dismisses the sheet", async ({ page }) => {
    const dialog = await openActions(page);
    await dialog.getByRole("button", { name: "Share" }).click();
    await closed(page);
    await expect(page.getByTestId("action-picked")).toHaveText("share");
  });

  test("Cancel dismisses without running anything", async ({ page }) => {
    const dialog = await openActions(page);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await closed(page);
    await expect(page.getByTestId("action-picked")).toHaveText("none");
  });

  test("a disabled action is inert and destructive is marked", async ({ page }) => {
    const dialog = await openActions(page);
    await expect(dialog.getByRole("button", { name: "Copy link" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "data-destructive",
      "",
    );
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("arrow keys move focus between enabled buttons and wrap", async ({ page }) => {
    const dialog = await openActions(page);
    await page.keyboard.press("ArrowDown");
    await expect(dialog.getByRole("button", { name: "Share" })).toBeFocused();
    await page.keyboard.press("ArrowDown"); // skips the disabled Copy link
    await expect(dialog.getByRole("button", { name: "Delete" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(dialog.getByRole("button", { name: "Share" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Enter");
    await closed(page);
    await expect(page.getByTestId("action-picked")).toHaveText("none");
  });

  test("Escape dismisses", async ({ page }) => {
    await openActions(page);
    await page.keyboard.press("Escape");
    await closed(page);
  });
});
