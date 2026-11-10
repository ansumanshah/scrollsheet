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

test("touch swipes page, short pulls spring back, and long pulls dismiss", async ({ page }) => {
  await page.goto("/#lightbox");
  await page.getByRole("button", { name: "Open Frangipani" }).click();
  await waitForNoActiveTransition(page);
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  const photo = viewer.locator('.ex-lb-slide[aria-hidden="false"] .ex-lb-zoom');
  const session = await page.context().newCDPSession(page);

  async function drag(dx: number, dy: number, duringDrag?: () => Promise<void>) {
    const box = await photo.boundingBox();
    if (!box) throw new Error("Active photo is missing");
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + (dx * step) / 8, y: y + (dy * step) / 8 }],
      });
    }
    await duringDrag?.();
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  const settleCarousel = () => viewer.locator(".ex-lb-track").evaluate((track) =>
    new Promise<void>((resolve) => {
      let timer = window.setTimeout(finish, 100);
      function finish() {
        track.removeEventListener("scroll", waitForQuiet);
        resolve();
      }
      function waitForQuiet() {
        window.clearTimeout(timer);
        timer = window.setTimeout(finish, 100);
      }
      track.addEventListener("scroll", waitForQuiet);
    }),
  );
  await drag(-170, 0);
  await expect(viewer.locator(".ex-lb-count")).toHaveText("2 / 6");
  await settleCarousel();
  const backdrop = viewer.locator("[data-scrollsheet-backdrop]");
  await expect(backdrop).toHaveCSS("background-color", "rgb(0, 0, 0)");
  const scrim = await backdrop.boundingBox();
  expect((scrim?.y ?? 0) + (scrim?.height ?? 0)).toBeGreaterThanOrEqual(page.viewportSize()!.height);
  await expect(viewer.locator(".ex-lb-panel")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await drag(0, 60, async () => {
    await expect(viewer).toHaveAttribute("data-ex-lb-pulling", "");
    expect(Number(await backdrop.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.8);
  });
  await expect(photo.locator(".ex-lb-media")).toHaveCSS("transform", "none");
  await expect(backdrop).toHaveCSS("opacity", "1");
  await expect(viewer).toBeVisible();

  const box = await photo.boundingBox();
  if (!box) throw new Error("Active photo is missing");
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  const fingers = (spread: number) => [{ id: 1, x: x - spread, y }, { id: 2, x: x + spread, y }];
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(20) });
  for (const spread of [30, 40, 60]) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(spread) });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(photo).toHaveAttribute("data-zoomed", "true");
  await drag(0, 155);
  await expect(viewer).toBeVisible();
  await photo.dblclick();
  await expect(photo).not.toHaveAttribute("data-zoomed");
  await drag(0, 155);
  await expect(viewer).toHaveCount(0, { timeout: MORPH_TIMEOUT });
  await expect(page.getByRole("button", { name: "Open Frangipani" })).toBeFocused();
});

test("the desktop stage fits the photo and supports keyboard zoom and trackpad dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#lightbox");
  const trigger = page.getByRole("button", { name: "Open Sea cliff" });
  await trigger.click();
  await waitForNoActiveTransition(page);
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer.locator(".ex-lb-count")).toHaveText("3 / 6");
  const photo = viewer.locator('.ex-lb-slide[aria-hidden="false"] .ex-lb-full');
  const box = await photo.boundingBox();
  expect(box?.width).toBeGreaterThan(800);
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(1000 / 667);

  const zoom = viewer.locator('.ex-lb-slide[aria-hidden="false"] .ex-lb-zoom');
  await viewer.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoom).toHaveAttribute("data-zoomed", "true");
  const initialPan = await zoom.evaluate((el) => el.scrollLeft);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => zoom.evaluate((el) => el.scrollLeft)).toBeGreaterThan(initialPan);
  await expect(viewer.locator(".ex-lb-count")).toHaveText("3 / 6");
  await page.keyboard.press("0");
  await expect(zoom).not.toHaveAttribute("data-zoomed");

  await zoom.hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -40);
  await page.keyboard.up("Control");
  await expect(zoom).toHaveAttribute("data-zoomed", "true");
  await page.keyboard.press("0");
  await expect(zoom).not.toHaveAttribute("data-zoomed");
  await page.mouse.wheel(0, 45);
  await expect(viewer).toHaveAttribute("data-ex-lb-pulling", "");
  await expect(viewer).not.toHaveAttribute("data-ex-lb-pulling");
  await expect(viewer).toBeVisible();
  await page.mouse.wheel(0, 150);
  await expect(viewer).toHaveCount(0, { timeout: MORPH_TIMEOUT });
  await expect(trigger).toBeFocused();
});

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
  const exit = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      duration: getComputedStyle(root, "::view-transition-group(ex-lb-shot)").animationDuration,
      outgoing: getComputedStyle(root, "::view-transition-old(ex-lb-shot)").animationName,
      incoming: getComputedStyle(root, "::view-transition-new(ex-lb-shot)").display,
    };
  });
  expect(exit.duration).toBe("0.36s");
  expect(exit.outgoing).toBe("none");
  expect(exit.incoming).toBe("none");

  // A close's own View Transition group runs for several hundred ms (a
  // spring, not a fixed short duration) — the dialog must still be in the
  // DOM well into that window, not gone within the first frame or two.
  await page.waitForTimeout(120);
  await expect(dialog).toHaveCount(1);
  await expect(dialog.locator("[data-scrollsheet-backdrop]")).toHaveCSS("opacity", "0");

  // It does eventually close once the morph actually lands.
  await expect(dialog).toHaveCount(0, { timeout: MORPH_TIMEOUT });
});

test("without View Transitions the viewer fades out in place", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(document, "startViewTransition", {
    value: undefined,
  }));
  await page.goto("/#lightbox");
  await page.getByRole("button", { name: "Open Frangipani" }).click();
  const dialog = page.getByRole("dialog", { name: "Photo viewer" });
  const panel = dialog.locator(".ex-lb-panel");
  await expect(panel).toHaveCSS("opacity", "1");
  const frames = await panel.evaluate((element) => {
    element.querySelector<HTMLButtonElement>(".ex-lb-close")?.click();
    return element.getAnimations().flatMap((animation) =>
      animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : [],
    );
  });
  expect(frames.map((frame) => frame.opacity)).toEqual(["1", "0"]);
  expect(frames.every((frame) => frame.transform === undefined)).toBe(true);
  await expect(dialog).toHaveCount(0);
});

test("opening and closing leaves the gallery at the same page position", async ({ page }) => {
  // Start without a fragment so the site's smooth anchor scroll cannot race
  // the explicit positioning used to measure the gallery.
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open Frangipani" });
  await trigger.evaluate(async (element) => {
    await document.fonts.ready;
    element.scrollIntoView({ block: "center", behavior: "instant" });
  });
  const position = () => page.locator(".ex-lb-grid").evaluate((element) => ({
    scroll: window.scrollY,
    top: element.getBoundingClientRect().top,
  }));
  const before = await position();
  await trigger.click();
  const dialog = page.locator("dialog.scrollsheet-dialog");
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  await waitForNoActiveTransition(page);
  const during = await position();
  expect(during.scroll).toBeCloseTo(before.scroll, 0);
  expect(during.top).toBeCloseTo(before.top, 0);
  await clickClose(page);
  await expect(dialog).toHaveCount(0);
  const after = await position();
  expect(after.scroll).toBeCloseTo(before.scroll, 0);
  expect(after.top).toBeCloseTo(before.top, 0);
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
