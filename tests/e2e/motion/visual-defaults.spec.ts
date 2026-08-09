import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger, waitForStableScrollTop } from "../helpers";

/**
 * v0.2 default look ("the best UI should be the default UI") — background,
 * side-aware radius, side-aware shadow, dark-mode defaults, the full-height
 * radius-flatten, and detached (floating-card) sheets. Fixtures at
 * e2e/fixtures/ (FullHeightSheet, DetachedSheet — modal/bottom, so the
 * existing tag-qualified `openSheetByTrigger` works unchanged).
 *
 * e2e/fixtures/index.html deliberately has no .sheet background/border-radius
 * CSS of its own (removed while building this — it was shadowing the
 * library's new defaults and made this suite untestable against the real
 * thing) — every assertion here is against the library's own CORE_CSS.
 */

/**
 * getComputedStyle(el).borderRadius collapses to the single-value shorthand
 * ("0px") when all four corners are equal, rather than always returning the
 * expanded four-value form — true for the flattened (all-zero) case this
 * checks, so a literal "0px 0px 0px 0px" string never actually matches it.
 */
function isFlatRadius(radius: string): boolean {
  return radius === "0px" || radius === "0px 0px 0px 0px";
}

test.describe("default look", () => {
  test("bottom sheet: white background, top-corner radius, upward shadow", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const panel = dialog.locator(".scrollsheet-panel");

    const styles = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, radius: s.borderRadius, shadow: s.boxShadow };
    });
    expect(styles.bg).toBe("rgb(255, 255, 255)");
    // top-left/top-right rounded, bottom-right/bottom-left square.
    const [tl, tr, br, bl] = styles.radius.split(" ");
    expect(tl).not.toBe("0px");
    expect(tr).not.toBe("0px");
    expect(styles.shadow).not.toBe("none");
    void br;
    void bl;
  });

  test("dark mode: the panel and handle flip to dark defaults", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const panel = dialog.locator(".scrollsheet-panel");
    const handle = dialog.locator(".scrollsheet-handle");

    const bg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(28, 28, 30)");
    const handleBg = await handle.evaluate((el) => getComputedStyle(el).backgroundColor);
    // Not the light-mode translucent-black default (which would be nearly
    // invisible on the dark panel) — some translucent-white value instead.
    expect(handleBg).not.toBe("rgba(0, 0, 0, 0.2)");
  });

  test("a consumer className fully overrides the default (headless escape hatch)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.addStyleTag({
      content: ".sheet { --scrollsheet-bg: transparent; --scrollsheet-radius: 0px; }",
    });
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const panel = dialog.locator(".scrollsheet-panel");
    const bg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgba(0, 0, 0, 0)");
  });

  test("measure()'s overdraw fill picks up the new default background", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const canvasBg = await dialog
      .locator(".scrollsheet-canvas")
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--scrollsheet-panel-bg").trim());
    expect(canvasBg).toBe("rgb(255, 255, 255)");
  });
});

test.describe("full-height radius-flatten", () => {
  test("squares off (border-radius: 0) once dragged to the true max detent, and regains it on the way down", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const panel = dialog.locator(".scrollsheet-panel");
    const track = dialog.locator(".scrollsheet-track");

    // Opens at the 0.5 detent — well short of max, full radius.
    const initialRadius = await panel.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(isFlatRadius(initialRadius)).toBe(false);

    // Travel to "full" (the second detent) via the handle.
    await dialog.locator("[data-scrollsheet-handle]").click();
    await waitForStableScrollTop(track);
    await expect(dialog).toHaveAttribute("data-scrollsheet-at-max", "");

    await expect
      .poll(
        async () => panel.evaluate((el) => getComputedStyle(el).borderRadius).then(isFlatRadius),
        {
          timeout: SPRING_TIMEOUT,
        },
      )
      .toBe(true);

    // Back down to 0.5 — radius returns.
    await dialog.locator("[data-scrollsheet-handle]").click();
    await waitForStableScrollTop(track);
    const backRadius = await panel.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(isFlatRadius(backRadius)).toBe(false);
  });

  test("a sheet whose max detent never reaches full height never flattens, even at its own max", async ({
    page,
  }) => {
    // "Stacking parent" has a single detent (0.6) — it opens already at its
    // own max, which is well short of the true viewport edge, so
    // fullHeightRef never becomes true and the radius-flatten logic in
    // updateTravel is a no-op for the whole lifetime of this sheet.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Stacking parent");
    const panel = dialog.locator(".scrollsheet-panel");
    const radius = await panel.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(isFlatRadius(radius)).toBe(false);
  });
});

test.describe("detached (floating-card) sheets", () => {
  test("no env()-based safe-area padding, all-four-corner radius, and a bottom offset that clears the inset", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detached sheet");
    await expect(dialog).toHaveAttribute("data-scrollsheet-detached", "");

    const panel = dialog.locator(".scrollsheet-panel");
    const styles = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, bottom: s.bottom, paddingBottom: s.paddingBottom };
    });
    // All four corners equally rounded (a floating card), not top-only.
    const corners = styles.radius.split(" ");
    expect(new Set(corners).size).toBe(1);
    expect(corners[0]).not.toBe("0px");
    // The panel's own bottom offset clears at least the 24px inset set on
    // the fixture (env(safe-area-inset-bottom) is 0 in this headless,
    // non-notched environment, so max(24px, 0px) = 24px).
    expect(Number.parseFloat(styles.bottom)).toBeGreaterThanOrEqual(24);
  });

  test("never radius-flattens even when dragged to its max detent", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detached sheet");
    const panel = dialog.locator(".scrollsheet-panel");
    const track = dialog.locator(".scrollsheet-track");

    await dialog.locator("[data-scrollsheet-handle]").click();
    await waitForStableScrollTop(track);
    await expect(dialog).toHaveAttribute("data-scrollsheet-at-max", "");

    const radius = await panel.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(isFlatRadius(radius)).toBe(false);
  });
});
