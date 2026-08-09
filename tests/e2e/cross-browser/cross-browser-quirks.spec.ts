import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * Engine-difference probes, run on every project (mobile *and* desktop —
 * see the shared `cross-browser-*.spec.ts` naming carve-out in
 * playwright.config.ts's testMatch/testIgnore). Each test here targets a
 * specific behavior the report calls out as engine-sensitive: scrollend
 * support and native <dialog> focus restoration. The desktop-only wheel /
 * scroll-snap-settling probe lives in desktop-drag.spec.ts instead (see the
 * note at the bottom of this file for why).
 */

test.describe("scrollend feature-detection fallback", () => {
  test.beforeEach(async ({ page }) => {
    // Force env().scrollend to false by hiding the feature before any app
    // script runs — deleting the own property removes it from `in` checks
    // in Chromium, WebKit and Firefox alike (verified: it's an own property
    // on `window`, not inherited off a shared prototype). This exercises the
    // exact code path real older WebKit builds (pre-Safari 26.2) take.
    await page.addInitScript(() => {
      // biome-ignore lint: test-only feature-detection probe
      delete (window as unknown as Record<string, unknown>).onscrollend;
    });
  });

  test("dismiss still fires via the debounce fallback with no scrollend support", async ({
    page,
  }) => {
    await page.goto("/");
    expect(
      await page.evaluate(() => "onscrollend" in window),
      "onscrollend must be hidden for this probe to be meaningful",
    ).toBe(false);

    const dialog = await openSheetByTrigger(page, "Basic sheet");
    const track = dialog.locator(".scrollsheet-track");

    // A real (not synthetic-event) scrollTop mutation — the browser fires its
    // own native 'scroll' event for this, same as a genuine gesture would.
    // We deliberately do NOT dispatch a synthetic 'scrollend': the fallback
    // must settle on the 'scroll' + debounce timer alone.
    await track.evaluate((el) => {
      el.scrollTop = 0;
    });

    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("detent settle (non-dismiss) still fires via the debounce fallback", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const viewportHeight = page.viewportSize()!.height;
    const target = Math.round(viewportHeight * 0.7);

    await track.evaluate((el, top) => {
      el.scrollTop = top;
    }, target);

    // The debounce fallback's only job is to call settle(), which promotes
    // the nearest resolved detent into React state — visible in the
    // fixtures' "Active detent: <code>…</code>" text.
    await expect(dialog.locator("code")).toHaveText("0.7", { timeout: SPRING_TIMEOUT });
  });
});

test.describe("native <dialog> focus restoration", () => {
  /**
   * Opens via keyboard (Tab-equivalent .focus() + Enter), not .click().
   *
   * WebKit-only finding, verified via Playwright: a mouse .click() on a
   * plain <button> does *not* focus it on WebKit — only keyboard activation
   * does, matching native AppKit button convention (also why "Full Keyboard
   * Access" is off by default on macOS). Opening via .click() therefore
   * leaves WebKit with nothing to restore focus *to* on close — not a bug,
   * just not a meaningful way to probe focus restoration on that engine.
   * Keyboard activation is also the realistic path for the population this
   * behavior actually matters to (keyboard/AT users), so it's the right
   * probe on every engine, not just a WebKit workaround.
   */
  async function openViaKeyboard(page: import("@playwright/test").Page, triggerName: string) {
    const trigger = page.getByRole("button", { name: triggerName, exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.locator("dialog.scrollsheet-dialog").first();
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    return { trigger, dialog };
  }

  test("focus returns to the trigger button after Esc-dismiss", async ({ page }) => {
    await page.goto("/");
    const { trigger } = await openViaKeyboard(page, "Basic sheet");

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });

    await expect(trigger).toBeFocused();
  });

  // "…after Sheet.Close click" was shed: both tests' own framing is native
  // <dialog> behavior — dialog.close() is the sole trigger for focus-restore
  // regardless of which UI path calls it. See test-shed-audit.md row 1.
});

// The wheel-driven scroll-snap settling-precision probe lives in
// desktop-drag.spec.ts, not here: a mouse wheel is a desktop-only input
// device (real mobile Safari has no wheel events), and racing it against
// WebKit's touch-viewport emulation produced flaky results unrelated to any
// real user path — see that file for the actual (desktop-only) probe and
// the Firefox-settling finding it documents.
