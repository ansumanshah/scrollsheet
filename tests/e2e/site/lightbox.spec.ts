import { type Page, expect, test } from "@playwright/test";

/**
 * Lightbox morph regression coverage, against the real built site (see
 * playwright.site.config.ts) — the gallery uses real photographs
 * (docs/public/img), and the two bugs these tests guard only show up with
 * real <img> decode timing, not the inline-SVG placeholders the example
 * used before. Mobile viewport: the reported bugs were device-only.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const MORPH_TIMEOUT = 3000;

/**
 * While a View Transition is active, the browser's own top-layer overlay
 * intercepts pointer events meant for the page underneath — the sheet's own
 * `data-scrollsheet-state` reaches "open" almost immediately (its phase
 * machine settles in zero time under --scrollsheet-travel: none), well
 * before the transition's own photo morph — a click issued in that gap
 * lands on the overlay, not the button. Real taps mid-entrance aren't this
 * test's concern; waiting the transition out first is.
 */
async function waitForNoActiveTransition(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.matches(":active-view-transition")), {
      timeout: MORPH_TIMEOUT,
    })
    .toBe(false);
}

/**
 * A plain in-page .click() rather than Playwright's own locator click.
 * Playwright's click first hovers (a real mousemove) and waits for the
 * target to be "stable" across two animation frames — on this page, with
 * an active-or-just-finished View Transition's top-layer overlay nearby,
 * that pre-click routine intermittently mistakes the overlay's teardown
 * for instability and the click never lands (flake reproduced directly:
 * "<html> intercepts pointer events", then the dialog never closes within
 * the timeout). The button itself is a plain onClick handler with no
 * dependency on pointer coordinates or trusted-event gating, so a direct
 * DOM click exercises the exact same code path a real tap would.
 */
async function clickClose(page: Page) {
  await page.evaluate(() => document.querySelector<HTMLButtonElement>(".ex-lb-close")?.click());
}

test("close keeps the sheet's surface open until the photo finishes traveling back to the grid", async ({
  page,
}) => {
  // Regression test for: the sheet appeared to close, and only afterward did
  // the photo morph back to its thumbnail — two motions instead of one. Root
  // cause was --scrollsheet-travel: none settling the sheet's own phase
  // machine in zero time, far faster than the View Transition photo morph,
  // so the dialog closed for real while the photo was still visibly mid-
  // flight. The fix defers the sheet's own `open` prop (sheetOpen in
  // lightbox.tsx) until the transition's `finished` promise resolves.
  await page.goto("/#lightbox");
  await page.getByRole("button", { name: "Open Frangipani" }).click();
  await waitForNoActiveTransition(page);

  const dialog = page.locator("dialog.scrollsheet-dialog");
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");

  await clickClose(page);

  // A close's own View Transition group runs for several hundred ms (a
  // spring, not a fixed short duration) — the dialog must still be in the
  // DOM well into that window, not gone within the first frame or two.
  await page.waitForTimeout(120);
  await expect(dialog).toHaveCount(1);

  // It does eventually close once the morph actually lands.
  await expect(dialog).toHaveCount(0, { timeout: MORPH_TIMEOUT });
});

test("open shows a decoded photo during the entrance, not a blank frame", async ({ page }) => {
  // Regression test for: the entrance wasn't perceptible at all. Root cause
  // was the full-size <img> only starting its network fetch the instant the
  // View Transition's "new" snapshot was captured — an undecoded image
  // paints blank, so the morph cross-faded a crisp thumbnail into nothing.
  // decodeFullShot (background-warmed on mount, and awaited with a bounded
  // budget before the transition starts) should mean the photo is already
  // decoded well before the morph settles.
  await page.goto("/#lightbox");
  await page.getByRole("button", { name: "Open Frangipani" }).click();

  // Every shot's slide is always mounted (the track pages between them), so
  // .ex-lb-full alone matches all six — only the active one is unhidden.
  const photo = page.locator('.ex-lb-slide[aria-hidden="false"] .ex-lb-full');
  await expect(photo).toBeVisible({ timeout: MORPH_TIMEOUT });

  // Sampled shortly after the click, mid-morph rather than after it settles —
  // this is the frame that would show blank pixels if decode lost the race.
  await page.waitForTimeout(150);
  const decoded = await photo.evaluate((img: HTMLImageElement) => img.naturalWidth > 0);
  expect(decoded).toBe(true);

  await waitForNoActiveTransition(page);
});

test("prefers-reduced-motion skips the morph entirely, no lingering surface either way", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/#lightbox");
  await page.getByRole("button", { name: "Open Frangipani" }).click();

  const dialog = page.locator("dialog.scrollsheet-dialog");
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: MORPH_TIMEOUT,
  });

  await clickClose(page);
  // No transition to defer behind: closes clean, no leftover empty dialog.
  await expect(dialog).toHaveCount(0, { timeout: MORPH_TIMEOUT });

  await context.close();
});
