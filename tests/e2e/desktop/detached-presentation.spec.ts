import { type Locator, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger, waitForStableScrollTop } from "../helpers";

/**
 * Desktop entry-axis fix: transformSide() and its CSS mirror used to key on
 * the 768px breakpoint alone, so EVERY bottom sheet got a right-axis
 * enter/exit on desktop — including one that opted out of the drawer
 * treatment entirely (`--scrollsheet-desktop-margin: 0`, still meeting the
 * bottom edge) and should have stayed on the bottom axis. Both now key on
 * data-scrollsheet-detached instead. These specs read the CSS resting
 * transforms directly (by toggling data-scrollsheet-state synchronously
 * inside a single page.evaluate, then restoring it) rather than timing the
 * WAAPI leg — deterministic, and exactly what changed: which CSS rule wins,
 * not how the animation plays.
 */

async function transformAt(panel: Locator, state: string): Promise<string> {
  return panel.evaluate((el, s) => {
    const dialog = el.closest(".scrollsheet-dialog");
    if (!dialog) throw new Error("no ancestor .scrollsheet-dialog");
    const previous = dialog.getAttribute("data-scrollsheet-state");
    dialog.setAttribute("data-scrollsheet-state", s);
    const transform = getComputedStyle(el).transform;
    if (previous === null) dialog.removeAttribute("data-scrollsheet-state");
    else dialog.setAttribute("data-scrollsheet-state", previous);
    return transform;
  }, state);
}

function translateX(matrix: string): number {
  if (matrix === "none") return 0;
  const m3d = matrix.match(/^matrix3d\(([^)]+)\)$/);
  if (m3d) return Number(m3d[1]!.split(",")[12]);
  const m2d = matrix.match(/^matrix\(([^)]+)\)$/);
  if (m2d) return Number(m2d[1]!.split(",")[4]);
  throw new Error(`unrecognized transform: ${matrix}`);
}

function translateY(matrix: string): number {
  if (matrix === "none") return 0;
  const m3d = matrix.match(/^matrix3d\(([^)]+)\)$/);
  if (m3d) return Number(m3d[1]!.split(",")[13]);
  const m2d = matrix.match(/^matrix\(([^)]+)\)$/);
  if (m2d) return Number(m2d[1]!.split(",")[5]);
  throw new Error(`unrecognized transform: ${matrix}`);
}

test.describe("desktop entry/exit axis mirrors data-scrollsheet-detached, not just the breakpoint", () => {
  test("an attached full-height sheet (--scrollsheet-desktop-margin: 0) stays on the bottom axis", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full-bleed desktop sheet");
    await expect(dialog).not.toHaveAttribute("data-scrollsheet-detached", "");

    const panel = dialog.locator(".scrollsheet-panel");
    const pre = await transformAt(panel, "pre");
    const closing = await transformAt(panel, "closing");

    // Bottom axis: translateX stays 0, translateY carries the offscreen travel.
    expect(translateX(pre)).toBe(0);
    expect(translateY(pre)).toBeGreaterThan(0);
    expect(translateX(closing)).toBe(0);
    expect(translateY(closing)).toBeGreaterThan(0);
  });

  test("a detached sheet (--scrollsheet-inset-bottom > 0) still enters/exits from the right", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detached sheet");
    await expect(dialog).toHaveAttribute("data-scrollsheet-detached", "");

    const panel = dialog.locator(".scrollsheet-panel");
    const pre = await transformAt(panel, "pre");
    const closing = await transformAt(panel, "closing");

    // Right axis: translateX carries the offscreen travel, translateY stays 0.
    expect(translateX(pre)).toBeGreaterThan(0);
    expect(translateY(pre)).toBe(0);
    expect(translateX(closing)).toBeGreaterThan(0);
    expect(translateY(closing)).toBe(0);
  });

  test("both settle to the identity transform once open, regardless of axis", async ({ page }) => {
    await page.goto("/");
    for (const trigger of ["Full-bleed desktop sheet", "Detached sheet"]) {
      const dialog = await openSheetByTrigger(page, trigger);
      const panel = dialog.locator(".scrollsheet-panel");
      const open = await transformAt(panel, "open");
      expect(translateX(open), trigger).toBe(0);
      expect(translateY(open), trigger).toBe(0);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
  });
});

test.describe("resolveBackgroundEffect newly reaches an attached full-height desktop sheet", () => {
  test("the marked wrapper scales for a --scrollsheet-desktop-margin:0 sheet opened from inside it", async ({
    page,
  }) => {
    // Previously content.tsx's dead-code guard (transformSide('bottom') !==
    // 'bottom') was always true on desktop for EVERY bottom sheet, so this
    // attached, full-height, opted-out-of-the-drawer sheet never qualified
    // for the auto backgroundEffect default at all — even though it meets
    // every other condition the design describes.
    await page.goto("/");
    const wrapper = page.locator("#page-background-wrapper");
    expect(await wrapper.evaluate((el) => getComputedStyle(el).transform)).toBe("none");

    await openSheetByTrigger(page, "Full-bleed desktop sheet");
    await expect
      .poll(async () => wrapper.evaluate((el) => getComputedStyle(el).transform), {
        timeout: SPRING_TIMEOUT,
      })
      .not.toBe("none");
  });
});

test.describe("the default detached drawer rests docked at the inline-end edge", () => {
  test("resting position sits --scrollsheet-desktop-margin from the right edge", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detached sheet");
    await expect(dialog).toHaveAttribute("data-scrollsheet-detached", "");

    const panel = dialog.locator(".scrollsheet-panel");
    await expect
      .poll(async () => (await panel.boundingBox())?.width, { timeout: SPRING_TIMEOUT })
      .toBeGreaterThan(0);

    const box = await panel.boundingBox();
    if (!box) throw new Error("missing box");

    // The dock rule cannot win left/right against the base .scrollsheet-panel
    // rule (its :where()-wrapped selector loses per-property), so the dock
    // rides on an auto inline margin instead. The regression this guards:
    // width applied but left/right lost, pinning a 640px panel to the LEFT
    // edge — enter-from-right then traveled the whole viewport.
    // clientWidth, not page.viewportSize(): the layout viewport excludes the
    // classic scrollbar the fixture page shows, and the dock is laid out
    // against the former.
    // The dock rides on margin-inline, additive with the base rule's
    // right: var(--scrollsheet-inset-x) — a consumer's floating-card inset
    // is respected and the desktop margin adds to it.
    const expected = await panel.evaluate((el) => {
      const read = (name: string, fallback: number) => {
        const raw = Number.parseFloat(getComputedStyle(el).getPropertyValue(name));
        return Number.isFinite(raw) ? raw : fallback;
      };
      return read("--scrollsheet-desktop-margin", 24) + read("--scrollsheet-inset-x", 0);
    });
    const layoutWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const rightGap = layoutWidth - (box.x + box.width);
    expect(Math.abs(rightGap - expected)).toBeLessThanOrEqual(2);
    expect(box.x).toBeGreaterThan(rightGap + 40);
  });
});

test.describe("rtl flips the detached drawer's dock and travel to the left edge", () => {
  test("resting dock sits --scrollsheet-desktop-margin + --scrollsheet-inset-x from the LEFT edge", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });
    const dialog = await openSheetByTrigger(page, "Detached sheet");
    await expect(dialog).toHaveAttribute("data-scrollsheet-detached", "");

    const panel = dialog.locator(".scrollsheet-panel");
    await expect
      .poll(async () => (await panel.boundingBox())?.width, { timeout: SPRING_TIMEOUT })
      .toBeGreaterThan(0);

    const box = await panel.boundingBox();
    const dialogBox = await dialog.boundingBox();
    if (!box || !dialogBox) throw new Error("missing box");

    // Gaps are measured against the dialog's own box, not viewport/client
    // width: both engines move the classic root scrollbar to the LEFT of an
    // rtl document, offsetting every client-space x by its width. The dialog
    // spans the layout viewport, so dialog-relative gaps cancel that shift.
    const expected = await panel.evaluate((el) => {
      const read = (name: string, fallback: number) => {
        const raw = Number.parseFloat(getComputedStyle(el).getPropertyValue(name));
        return Number.isFinite(raw) ? raw : fallback;
      };
      return read("--scrollsheet-desktop-margin", 24) + read("--scrollsheet-inset-x", 0);
    });
    const leftGap = box.x - dialogBox.x;
    const rightGap = dialogBox.x + dialogBox.width - (box.x + box.width);
    expect(Math.abs(leftGap - expected)).toBeLessThanOrEqual(2);
    // Genuinely docked left: the auto-margin slack is all on the right.
    expect(rightGap).toBeGreaterThan(leftGap + 40);
  });

  test("pre/closing resting transforms travel negative X, offscreen past the left edge", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.dir = "rtl";
    });
    const dialog = await openSheetByTrigger(page, "Detached sheet");
    // measure()'s mirror of the panel's computed direction — the signal the
    // CSS rtl travel rules key on.
    await expect(dialog).toHaveAttribute("data-scrollsheet-rtl", "");

    const panel = dialog.locator(".scrollsheet-panel");
    const pre = await transformAt(panel, "pre");
    const closing = await transformAt(panel, "closing");

    // Left axis: negative translateX carries the travel, translateY stays 0.
    // The regression this guards: rtl rested the panel at the left edge but
    // still animated toward +X, sweeping the viewport without ever exiting.
    expect(translateX(pre)).toBeLessThan(0);
    expect(translateY(pre)).toBe(0);
    expect(translateX(closing)).toBeLessThan(0);
    expect(translateY(closing)).toBe(0);
  });
});

test.describe("a consumer class can center a detached bottom sheet on desktop", () => {
  test("left/right/width override the dock rule instead of tying and losing on source order", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Centered desktop sheet");
    await expect(dialog).toHaveAttribute("data-scrollsheet-detached", "");

    const panel = dialog.locator(".scrollsheet-panel");
    await expect
      .poll(async () => (await panel.boundingBox())?.width, { timeout: SPRING_TIMEOUT })
      .toBeGreaterThan(0);

    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error("missing box/viewport");

    const leftGap = box.x;
    const rightGap = viewport.width - (box.x + box.width);
    // Centered: equal left/right gaps, not the default drawer's right-docked
    // position (which would put leftGap far larger than rightGap).
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(2);
    // And genuinely a centered card, not incidentally full-bleed.
    expect(leftGap).toBeGreaterThan(20);
  });
});

test.describe("the drawer's closing travel clears the viewport on the horizontal dock axis", () => {
  test("the fixture's default margin + inset-x already exceeded the old fixed 32px overshoot", async ({
    page,
  }) => {
    // The dock's resting gap from the right edge is
    // --scrollsheet-desktop-margin + --scrollsheet-inset-x (see the describe
    // block above) — 24 + 16 = 40px on this fixture, already past the old
    // closing transform's fixed 32px shadow-clearance overshoot with no
    // bumping needed. No synthetic override: this reproduces with the
    // fixture exactly as authored.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Detached sheet");
    await expect(dialog).toHaveAttribute("data-scrollsheet-detached", "");

    const panel = dialog.locator(".scrollsheet-panel");
    const track = dialog.locator(".scrollsheet-track");
    await expect
      .poll(async () => (await panel.boundingBox())?.width, { timeout: SPRING_TIMEOUT })
      .toBeGreaterThan(0);

    // The dock only swaps the visual enter/exit AXIS to horizontal — the
    // underlying scroll/detent axis a bottom sheet drives its detents on
    // stays vertical (geometry.ts keys the scroll axis off `side`, not the
    // desktop presentation), so the same canvas-overhang-vs-viewport gap
    // tests/e2e/regression/closing-travel-clears-viewport.spec.ts's bottom
    // case documents applies here too: drive to the largest detent first.
    // Not a handle click here — the desktop dock rule hides the pill
    // (opacity:0, pointer-events:none) until :focus-visible, so a plain
    // click is intercepted by the panel; jump the track's own scroll
    // directly instead, the same programmatic-dismiss pattern
    // sides.spec.ts uses.
    await track.evaluate((el) => {
      el.scrollTop = el.scrollHeight - el.clientHeight;
      el.dispatchEvent(new Event("scrollend"));
    });
    await waitForStableScrollTop(track);

    const openBox = await panel.boundingBox();
    if (!openBox) throw new Error("missing open box");
    const closingTransform = await transformAt(panel, "closing");
    const finalLeft = openBox.x + translateX(closingTransform);

    const layoutWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(finalLeft).toBeGreaterThanOrEqual(layoutWidth);
  });
});
