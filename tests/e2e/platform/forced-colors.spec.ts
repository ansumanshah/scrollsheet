import { type Page, expect, test } from "@playwright/test";
import { openSheetByTrigger } from "../helpers";

/**
 * The exact color a forced-colors system keyword resolves to is
 * implementation- and OS-contrast-theme-defined (Chromium's own forced-colors
 * emulation renders `Highlight` with a baked-in alpha channel, e.g.
 * `rgba(5, 0, 73, 0.8)`, so a blanket "must be a solid rgb(), not rgba()"
 * check is wrong for that keyword specifically — verified empirically, not
 * assumed). Rendering a throwaway element with the literal keyword in the
 * same page/emulation and comparing computed values sidesteps guessing at
 * that representation entirely.
 */
async function resolvedSystemColor(page: Page, keyword: string): Promise<string> {
  return page.evaluate((kw) => {
    const probe = document.createElement("div");
    probe.style.background = kw;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }, keyword);
}

/**
 * @media (forced-colors: active) — Windows High Contrast and similar modes.
 *
 * Two facts verified empirically against real Chromium forced-colors
 * emulation before writing core.css's block (not assumed from the spec):
 * box-shadow always computes to "none" here regardless of its authored
 * value, and a translucent background-color has its RGB channels replaced
 * by the browser's forced palette while alpha survives — so a backdrop and
 * the panel behind it resolve to the identical forced color, and dimming
 * disappears even though the animated opacity is still doing its job.
 *
 * Assertions below avoid hardcoding what Canvas/CanvasText/ButtonBorder/
 * Highlight actually resolve to (implementation- and OS-theme-defined) and
 * instead check the theme-independent facts the fix is actually responsible
 * for: box-shadow gone + a real border/outline in its place, and the
 * backdrop's authored rgba surviving byte-for-byte (proof forced-color-adjust:
 * none is actually applied, not just that some color changed).
 */

test.describe("forced-colors: active", () => {
  // Chromium-only: `forced-colors` is a Windows-High-Contrast-driven media
  // feature that WebKit doesn't implement (and Playwright's WebKit build has
  // no way to force it), so it never matches there — every assertion below
  // would fail not because the fix is broken, but because the block never
  // activates. firefox-desktop doesn't run this file at all (playwright.config.ts
  // testMatch restricts that project to desktop-*/cross-browser-* specs).
  test.skip(({ browserName }) => browserName !== "chromium", "forced-colors is Chromium-only");

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
  });

  test("panel: box-shadow is replaced by a real border, not silently dropped", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const panel = dialog.locator(".scrollsheet-panel");

    const styles = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return { boxShadow: s.boxShadow, borderWidth: s.borderWidth, borderStyle: s.borderStyle };
    });
    // The plain 0 -8px 32px rgba(...) shadow this panel ships by default is
    // exactly what forced-colors discards outright.
    expect(styles.boxShadow).toBe("none");
    expect(styles.borderStyle).toBe("solid");
    expect(styles.borderWidth).not.toBe("0px");
  });

  test("backdrop: forced-color-adjust: none preserves the authored dimming instead of losing it to the forced palette", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const backdrop = dialog.locator(".scrollsheet-backdrop");

    const styles = await backdrop.evaluate((el) => {
      const s = getComputedStyle(el);
      return { backgroundColor: s.backgroundColor, forcedColorAdjust: s.forcedColorAdjust };
    });
    expect(styles.forcedColorAdjust).toBe("none");
    // Exactly the authored default (rgb(0 0 0 / 0.32)) — without the opt-out
    // this would come back RGB-forced to whatever the active contrast
    // theme's Canvas is, which is indistinguishable from the panel/page
    // behind it and erases the dimming cue entirely.
    expect(styles.backgroundColor).toBe("rgba(0, 0, 0, 0.32)");
  });

  test("handle pill: ButtonBorder, not a translucent color that can flatten into the panel behind it", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const handle = dialog.locator(".scrollsheet-handle");

    const bg = await handle.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(await resolvedSystemColor(page, "ButtonBorder"));
    // Distinct from the light-mode default's rgb(0 0 0 / 0.2) either way.
    expect(bg).not.toBe("rgba(0, 0, 0, 0.2)");
  });

  test("handle focus ring: a real outline, since the box-shadow ring is discarded like every other one", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const handle = dialog.locator(".scrollsheet-handle");

    // A programmatic .focus() call inherits whatever input modality the page
    // last saw (the click that opened the sheet, i.e. "mouse") and does NOT
    // reliably set :focus-visible — verified empirically against this exact
    // fixture. A real Tab keypress both establishes keyboard modality and
    // moves focus, so :focus-visible engages the way a real user's Tab would.
    await page.keyboard.press("Tab");
    await expect(handle).toBeFocused();

    const styles = await handle.evaluate((el) => {
      const s = getComputedStyle(el);
      return { boxShadow: s.boxShadow, outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth };
    });
    expect(styles.boxShadow).toBe("none");
    expect(styles.outlineStyle).toBe("solid");
    expect(styles.outlineWidth).not.toBe("0px");
  });

  test("overlay scrollbar thumb: Highlight instead of a translucent color", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const scrollbar = dialog.locator(".scrollsheet-scrollbar");

    const bg = await scrollbar.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(await resolvedSystemColor(page, "Highlight"));
  });

  test("no-<dialog> fallback panel: the same box-shadow-to-border swap and backdrop opt-out apply on this path too", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // Same technique as e2e/no-dialog-fallback.spec.ts: puts the whole
      // library on the fallback path.
      // biome-ignore lint: deliberate feature removal for this suite
      delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>).showModal;
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Basic sheet" }).click();

    const panel = page.locator(".scrollsheet-fallback-panel");
    await expect(panel).toBeVisible();
    const panelStyles = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return { boxShadow: s.boxShadow, borderWidth: s.borderWidth, borderStyle: s.borderStyle };
    });
    expect(panelStyles.boxShadow).toBe("none");
    expect(panelStyles.borderStyle).toBe("solid");
    expect(panelStyles.borderWidth).not.toBe("0px");

    const backdrop = page.locator(".scrollsheet-fallback-backdrop");
    const backdropStyles = await backdrop.evaluate((el) => {
      const s = getComputedStyle(el);
      return { backgroundColor: s.backgroundColor, forcedColorAdjust: s.forcedColorAdjust };
    });
    expect(backdropStyles.forcedColorAdjust).toBe("none");
    expect(backdropStyles.backgroundColor).toBe("rgba(0, 0, 0, 0.32)");
  });
});
