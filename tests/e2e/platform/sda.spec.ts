import { expect, test } from "@playwright/test";

import { openSheetByTrigger } from "../helpers";

/**
 * Scroll-driven-animation fast path: on engines with `animation-timeline:
 * scroll()` the backdrop dim and public `--scrollsheet-progress` run as CSS
 * animations off the track's own scroll timeline, and updateTravel skips
 * its two JS writes while the sheet is settled open (sdaOwnsBackdrop,
 * src/content.tsx). Unit coverage (tests/unit/sda.test.tsx) pins the pure
 * gating; this file proves the live contract in a real engine, on both
 * sides of the feature gate:
 *
 * Both bundled engines (chromium, and webkit since Safari 26's timeline
 * work reached its trunk) ship scroll timelines, so both exercise the SDA
 * branch — including the strongest claim, that the computed value moved
 * while the JS-written inline value did not (only the CSS animation can
 * have done that). The no-support branch of each assertion stays in place
 * for older engine builds; its gating logic is unit-locked against stubbed
 * detection in tests/unit/env.test.ts and sda.test.tsx.
 *
 * `--scrollsheet-progress` is travelProgress: revealed / firstDetent,
 * saturating at 1 at (and past) the first detent. A sheet resting open
 * therefore always reads 1 — the only window where the value is live is
 * BELOW the first detent, so the probe scrolls the track partway toward
 * closed (snap suspended, same suspension a drag session uses) and reads
 * mid-flight, then restores.
 */

async function supportsScrollTimeline(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => CSS.supports("animation-timeline: scroll()"));
}

test("data-scrollsheet-sda is stamped exactly when the engine has scroll timelines", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");
  if (await supportsScrollTimeline(page)) {
    await expect(dialog).toHaveAttribute("data-scrollsheet-sda", "");
  } else {
    await expect(dialog).not.toHaveAttribute("data-scrollsheet-sda");
  }
});

test("--scrollsheet-progress and the dim track a mid-travel scroll on every engine; on SDA engines CSS owns the value, not the JS write", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Detents (35% / 70% / full)");

  const probe = await dialog.evaluate(async (el) => {
    const track = el.querySelector<HTMLElement>(".scrollsheet-track");
    const backdrop = el.querySelector<HTMLElement>(".scrollsheet-backdrop");
    if (!track || !backdrop) throw new Error("track/backdrop missing");
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

    const read = () => ({
      computed: Number.parseFloat(
        getComputedStyle(backdrop).getPropertyValue("--scrollsheet-progress"),
      ),
      inline: Number.parseFloat(backdrop.style.getPropertyValue("--scrollsheet-progress")),
      opacity: Number.parseFloat(getComputedStyle(backdrop).opacity),
    });

    const atRest = read();
    const restTop = track.scrollTop;

    // Same suspension a drag session uses — mandatory snap would otherwise
    // yank the write straight back to the detent.
    const priorSnap = track.style.scrollSnapType;
    track.style.scrollSnapType = "none";
    // 0.6, not 0.5: exactly half sits ON the default closeThreshold
    // boundary, and an engine that fires scrollend mid-probe (webkit does)
    // judges that a dismissal. 0.6 settles back to the detent instead.
    track.scrollTop = restTop * 0.6;
    // One frame for the scroll event (JS path), one for the timeline sample.
    await frame();
    await frame();
    const midFlight = read();

    track.scrollTop = restTop;
    await frame();
    track.style.scrollSnapType = priorSnap;
    return { atRest, midFlight };
  });

  // Resting open at the first detent: progress saturates at exactly 1.
  expect(probe.atRest.computed).toBe(1);
  // Halfway toward closed the live value must have followed the scroll,
  // whichever mechanism owns it on this engine.
  expect(probe.midFlight.computed).toBeGreaterThan(0.4);
  expect(probe.midFlight.computed).toBeLessThan(0.8);

  // The sheet must still be resting open after the probe restored the track.
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");

  if (await supportsScrollTimeline(page)) {
    // The JS write is skipped while open, so the inline value still holds
    // the entrance-frame 1 — only the scroll-driven animation can explain
    // the computed value moving away from it.
    expect(probe.midFlight.inline).toBe(1);
    expect(Math.abs(probe.midFlight.computed - probe.midFlight.inline)).toBeGreaterThan(0.25);
  }
});
