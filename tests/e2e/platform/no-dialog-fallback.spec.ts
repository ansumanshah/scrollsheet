import { expect, test } from "@playwright/test";

/**
 * The no-<dialog> degradation path (src/internal/fallback-sheet.tsx).
 *
 * `hasDialogSupport()` probes `HTMLDialogElement.prototype.showModal`, so
 * deleting that one method before any app script runs is enough to put the
 * whole library on the fallback path — the same situation Opera Mini, some
 * old in-app WebViews, and iOS <=15.3 are in for real.
 *
 * What matters here is the promise the fallback makes: the content is
 * REACHABLE and the sheet is DISMISSIBLE. A checkout completes. Detents,
 * drag, and animation are gone by design and are not asserted.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Deleting from the prototype (not stubbing the global away entirely)
    // keeps `<dialog>` parseable as an element, which is exactly the shape
    // of a browser that has the tag but not the API.
    // biome-ignore lint: deliberate feature removal for this suite
    delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>).showModal;
  });
});

test.describe("no-<dialog> fallback", () => {
  test("renders the panel, reaches the content, and never mounts the engine", async ({ page }) => {
    await page.goto("/");
    expect(
      await page.evaluate(() => "showModal" in HTMLDialogElement.prototype),
      "showModal must be absent for this suite to be meaningful",
    ).toBe(false);

    await page.getByRole("button", { name: "Basic sheet" }).click();

    const panel = page.locator(".scrollsheet-fallback-panel");
    await expect(panel).toBeVisible();
    // The engine's own markup must be entirely absent — no dialog, no
    // scroll-snap track. If either shows up, `present` leaked true.
    await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0);
    await expect(page.locator(".scrollsheet-track")).toHaveCount(0);

    // Reachable content is the whole point of the fallback.
    await expect(panel).toContainText(/./);
    await expect(panel).toHaveAttribute("role", "dialog");
    await expect(panel).toHaveAttribute("aria-modal", "true");
  });

  test("moves focus to the panel on open and restores it to the trigger on close", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Basic sheet" });
    // Focus + Enter, not click: WebKit does not focus a <button> on click
    // (macOS/iOS convention), so a click would leave <body> as the element
    // to restore to and the restore half of this test would assert nothing.
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");

    const panel = page.locator(".scrollsheet-fallback-panel");
    await expect(panel).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("dismisses on backdrop tap", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Basic sheet" }).click();

    const panel = page.locator(".scrollsheet-fallback-panel");
    await expect(panel).toBeVisible();

    await page.locator(".scrollsheet-fallback-backdrop").click({ position: { x: 5, y: 5 } });
    await expect(panel).toHaveCount(0);
  });

  test("locks and restores body scroll around the open", async ({ page }) => {
    await page.goto("/");
    const overflowBefore = await page.evaluate(() => document.body.style.overflow);

    await page.getByRole("button", { name: "Basic sheet" }).click();
    await expect(page.locator(".scrollsheet-fallback-panel")).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(page.locator(".scrollsheet-fallback-panel")).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(overflowBefore);
  });
});
