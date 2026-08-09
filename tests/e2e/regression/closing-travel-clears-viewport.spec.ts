import { type Locator, expect, test } from "@playwright/test";

import { openSheetByTrigger, waitForStableScroll } from "../helpers";

/**
 * Regression coverage for the closing-transform exit-distance bug: the CSS
 * resting rule for data-scrollsheet-state="closing" only ever added a fixed
 * 32px shadow-clearance overshoot on top of the panel's own 100% height —
 * correct for a panel flush with the viewport edge, but a panel inset from
 * its edge (a detached bottom sheet, an edge-anchored side sheet with a
 * consumer inset, the desktop drawer's margin) starts that much further in
 * and needed that much more travel. It stopped partway through the exit and
 * the last 100+px stayed visible for a frame before the dialog unmounted.
 *
 * `restingRectAt` below is the same synchronous-attribute-toggle technique
 * tests/e2e/desktop/detached-presentation.spec.ts's `transformAt` uses to
 * probe a CSS resting rule directly: force `data-scrollsheet-state` to a
 * given value, read layout, restore. Deterministic on purpose, and the only
 * reliable way to observe this specific rule — the real open/close travel is
 * a WAAPI leg (use-enter-exit-leg.ts) that owns the panel's inline transform
 * for the whole animation and only ever hands control back to this CSS rule
 * for the handful of microtasks between the leg's `finished` promise
 * resolving and the dialog unmounting, which is over before a
 * requestAnimationFrame poll (or prefers-reduced-motion, which collapses the
 * WAAPI leg to zero duration) ever gets a rendered frame to sample. This is
 * exactly the "which CSS rule wins, not how the animation plays" distinction
 * that file's own header comment makes.
 */

async function restingRectAt(
  panel: Locator,
  state: string,
): Promise<{ top: number; left: number; right: number; bottom: number; vw: number; vh: number }> {
  return panel.evaluate((el, s) => {
    const dialog = el.closest(".scrollsheet-dialog");
    if (!dialog) throw new Error("no ancestor .scrollsheet-dialog");
    const previous = dialog.getAttribute("data-scrollsheet-state");
    dialog.setAttribute("data-scrollsheet-state", s);
    const rect = el.getBoundingClientRect();
    if (previous === null) dialog.removeAttribute("data-scrollsheet-state");
    else dialog.setAttribute("data-scrollsheet-state", previous);
    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  }, state);
}

test.describe("closing resting transform clears the viewport on its own axis", () => {
  test("detached bottom sheet: a large --scrollsheet-inset-bottom still fully exits", async ({
    page,
  }) => {
    await page.goto("/");
    // The fixture ships --scrollsheet-inset-bottom: 24px (already enough to
    // mark it detached), which the old fixed-32px overshoot happened to
    // still clear — bump it well past 32px, matching the reported repro's
    // 150px inset on a 390x844 viewport, so the missing travel is
    // unmistakable.
    const dialog = await openSheetByTrigger(page, "Detached sheet");
    await expect(dialog).toHaveAttribute("data-scrollsheet-detached", "");

    const panel = dialog.locator(".scrollsheet-panel");
    const track = dialog.locator(".scrollsheet-track");
    // .scrollsheet-canvas overhangs the track by --scrollsheet-max-detent
    // (the scrollable range past the panel's own edge), and the panel's
    // `bottom` offset is measured from the CANVAS's edge, not the
    // viewport's — they only coincide once scrolled to the largest detent.
    // This fixture defaults to its first detent (0.5), so drive it to
    // 'full' (the handle's own cycle, same as sides.spec.ts) first, or a
    // stale mid-scroll gap would make the assertion below meaningless in
    // either direction. Matches how the reported repro's own sheet (a
    // single-detent Dialog, always resting at its only/largest detent)
    // behaves by construction.
    await dialog.locator("[data-scrollsheet-handle]").click();
    await waitForStableScroll(track, "scrollTop");

    await panel.evaluate((el) => {
      el.style.setProperty("--scrollsheet-inset-bottom", "150px");
    });

    const { top, vh } = await restingRectAt(panel, "closing");
    // Fully below the viewport's bottom edge — none of the panel is still
    // reachable on screen once the dialog unmounts.
    expect(top).toBeGreaterThanOrEqual(vh);
  });

  test("right side sheet: a large --scrollsheet-inset-right still fully exits", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Side right");
    const panel = dialog.locator(".scrollsheet-panel");
    const track = dialog.locator(".scrollsheet-track");

    // Same canvas-overhang reasoning as the bottom case above, on the x
    // axis — drive to the second (largest) detent first.
    await dialog.locator("[data-scrollsheet-handle]").click();
    await waitForStableScroll(track, "scrollLeft");

    await panel.evaluate((el) => {
      el.style.setProperty("--scrollsheet-inset-right", "150px");
    });

    const { left, vw } = await restingRectAt(panel, "closing");
    // Fully past the viewport's right edge.
    expect(left).toBeGreaterThanOrEqual(vw);
  });
});
