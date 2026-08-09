import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger, waitForStableScrollTop } from "../helpers";

/**
 * PWA / standalone-mode smoke test.
 *
 * Emulates `display-mode: standalone` by overriding `matchMedia` before any
 * app script runs, which is the same technique the app itself would use to
 * detect standalone mode. scrollsheet's own source has zero references to
 * matchMedia/display-mode/standalone (confirmed via `rg`) — it doesn't
 * branch on this at all — so what this suite actually verifies is that the
 * underlying mechanics (native <dialog>, visualViewport-driven layout,
 * safe-area CSS custom property) keep working when the *page* reports
 * standalone, which is the situation a real "Add to Home Screen" install
 * puts the page in.
 *
 * Honest limitation: this is matchMedia emulation in a normal headless
 * browser tab, not a real installed iOS home-screen PWA. It cannot
 * reproduce WebKit's actual standalone-WKWebView-specific behavior (the
 * root cause several of the B09/B10/B11 scenarios below hypothesize about)
 * — those need a real device check, noted per-test below.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const realMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query.includes("display-mode") && query.includes("standalone")) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        } as MediaQueryList;
      }
      return realMatchMedia(query);
    };
  });
});

test.describe("PWA standalone smoke", () => {
  test("sheet opens, detents snap, and dismiss works under emulated standalone display-mode", async ({
    page,
  }) => {
    await page.goto("/");
    expect(
      await page.evaluate(() => window.matchMedia("(display-mode: standalone)").matches),
      "standalone emulation must be active for this suite to be meaningful",
    ).toBe(true);

    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");
    const viewportHeight = page.viewportSize()!.height;

    // Opens at the first detent.
    let scrollTop = await track.evaluate((el) => el.scrollTop);
    expect(Math.abs(scrollTop - Math.round(viewportHeight * 0.35))).toBeLessThanOrEqual(2);

    // Detent snapping still works (Handle click travels to next stop).
    await dialog.locator("[data-scrollsheet-handle]").click();
    scrollTop = await waitForStableScrollTop(track);
    expect(Math.abs(scrollTop - Math.round(viewportHeight * 0.7))).toBeLessThanOrEqual(2);
    // waitForStableScrollTop only requires two consecutive polls (100ms+
    // apart) to read the same value — under heavy CPU contention (many
    // parallel workers/projects sharing one machine, confirmed via direct
    // instrumentation as the trigger) a still-in-flight tween can stall for
    // that whole window and read back "stable" prematurely, well before its
    // own real wall-clock duration (TRAVEL_MS) has elapsed. Its next frame,
    // once it actually gets scheduled, then overwrites the scrollTop=0 write
    // below out from under this test. A short buffer past TRAVEL_MS gives it
    // real wall-clock time to finish first, regardless of frame timing.
    await page.waitForTimeout(500);

    // Dismiss (scroll-to-0 + scrollend) still works and unmounts the dialog.
    await track.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scrollend"));
    });
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });

  test("track height matches the viewport exactly — no reliance on URL-bar-dependent units (100vh etc.)", async ({
    page,
  }) => {
    // A standalone PWA has no browser URL bar at all, so any sizing that
    // was accidentally computed against a *shrunk-for-chrome* viewport
    // value (rather than the true available height) would show up here as
    // a height mismatch — track is fixed+inset:0 sized off the real
    // rendered layout, not a cached 100vh figure.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");
    const track = dialog.locator(".scrollsheet-track");
    const viewportSize = page.viewportSize()!;

    const trackBox = await track.boundingBox();
    if (!trackBox) throw new Error("track bounding box unavailable");
    expect(Math.round(trackBox.height)).toBe(viewportSize.height);
    expect(Math.round(trackBox.width)).toBe(viewportSize.width);
  });

  test("--scrollsheet-safe-area applies as panel bottom padding when the consumer sets it", async ({
    page,
  }) => {
    // Standalone PWAs are exactly the case where safe-area insets (home
    // indicator, notch) matter most — no browser chrome to naturally clear
    // them. The consumer recipe (README): set
    // --scrollsheet-safe-area: env(safe-area-inset-bottom). env() evaluates
    // to 0 in this non-notched headless environment, so this test sets an
    // explicit px value instead, to deterministically verify the CSS custom
    // property actually cascades into the panel's padding rather than
    // relying on real device hardware insets.
    await page.goto("/");
    await page.addStyleTag({
      content: `.scrollsheet-panel { --scrollsheet-safe-area: 24px; }`,
    });

    const dialog = await openSheetByTrigger(page, "Basic sheet");
    const panel = dialog.locator(".scrollsheet-panel");
    const paddingBottom = await panel.evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(paddingBottom).toBe("24px");
  });
});

test.describe("B09 — keyboard never appears for sheet inputs in standalone PWA", () => {
  test("B09 (partial): an input inside a sheet still receives real DOM focus under emulated standalone display-mode", async ({
    page,
  }) => {
    // scrollsheet has no code path gated on visualViewport/standalone
    // detection that could no-op or eat the focus event (confirmed: no
    // matchMedia/display-mode references in src/ at all) — focusing an
    // input is a plain, unconditional DOM operation. This confirms focus
    // itself isn't silently swallowed under standalone emulation; it cannot
    // confirm the actual software keyboard visually appears, since
    // Playwright/headless WebKit has no real on-screen keyboard and this
    // isn't a real installed home-screen WKWebView — that half needs a
    // physical device check.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Keyboard");
    const input = dialog.getByLabel("Demo text input");

    await input.click();
    await expect(input).toBeFocused();
    await input.fill("hello");
    await expect(input).toHaveValue("hello");
  });
});

test.describe("B10 — select interactions in standalone PWA shift the sheet, blocking taps", () => {
  test("B10 (closest testable proxy): a visualViewport resize while standalone-emulated repositions the track without corrupting subsequent hit-testing", async ({
    page,
  }) => {
    // The real trigger (native <select> focus firing a visualViewport
    // resize specifically in standalone-mode WebKit) can't be reproduced —
    // headless/CI WebKit doesn't render the real native select picker UI in
    // a way that fires such an event, and this isn't a real installed
    // WKWebView. This is the closest testable proxy: force the same kind of
    // visualViewport resize relayout() reacts to (see B06/B08 in
    // regressions.spec.ts) under standalone emulation, and confirm a
    // subsequent tap on real sheet content still lands correctly afterward
    // — i.e. the relayout doesn't leave hit-testing in a bad state.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
    const track = dialog.locator(".scrollsheet-track");

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight - 200, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });

    // A real tap on the Handle must still register correctly afterward.
    await dialog.locator("[data-scrollsheet-handle]").click();
    const scrollTop = await waitForStableScrollTop(track);
    const viewportHeight = page.viewportSize()!.height;
    expect(Math.abs(scrollTop - Math.round(viewportHeight * 0.7))).toBeLessThanOrEqual(2);
  });
});

test.describe("B11 — sheet fails to render/open at all on iPhone, in every browser and as a PWA", () => {
  test("B11 (WebKit-engine smoke): the sheet renders and opens under emulated standalone display-mode", async ({
    page,
    browserName,
  }) => {
    // No specific root cause was ever identified in the source issue — it's
    // flagged as a smoke test, not a targeted mechanism. This confirms the
    // sheet actually becomes visible under standalone emulation on whatever
    // engine this project runs (webkit-mobile is the real signal here,
    // since Chrome-on-iOS/every other iOS browser is WebKit under the hood
    // per App Store policy — WebKit-engine coverage is a reasonable proxy
    // for "every iOS browser"). Full iPhone/home-screen-PWA confirmation
    // still needs a physical device.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
    void browserName;
  });
});
