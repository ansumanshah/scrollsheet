import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * desktopSide="center" on the "Responsive profile sheet" fixture (side=
 * "bottom", default 768px breakpoint): a bottom sheet below the line, a
 * centered dialog at/above it, resolved through a matchMedia subscription.
 * Crossing the breakpoint while the sheet is open re-presents instantly —
 * no morph, just a new presentation — and must never crash or drop the
 * sheet's open state mid-flip.
 */

const TRIGGER = "Responsive profile sheet";
const BELOW = { width: 500, height: 800 };
const ABOVE = { width: 900, height: 800 };

test("below the breakpoint, the base side presentation applies", async ({ page }) => {
  await page.setViewportSize(BELOW);
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, TRIGGER);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "bottom");
});

test("at/above the breakpoint, desktopSide presents centered", async ({ page }) => {
  await page.setViewportSize(ABOVE);
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, TRIGGER);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "center");
});

test("crossing the breakpoint while open re-presents instantly without crashing", async ({
  page,
}) => {
  await page.setViewportSize(BELOW);
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, TRIGGER);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "bottom");

  await page.setViewportSize(ABOVE);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "center", {
    timeout: SPRING_TIMEOUT,
  });
  // Still the same open dialog — no crash, no dismiss, no remount.
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(1);

  // And back down — the flip is symmetric, not a one-way ratchet.
  await page.setViewportSize(BELOW);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "bottom", {
    timeout: SPRING_TIMEOUT,
  });
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  // Position, not just attributes: the re-jump must land the track at a
  // real resting detent (a broken flip once left it at the closed stop
  // with state still "open").
  await expect
    .poll(() => dialog.evaluate((el) => el.querySelector(".scrollsheet-track")?.scrollTop ?? -1), {
      timeout: SPRING_TIMEOUT,
    })
    .toBeGreaterThan(0);
});

test("a side-only flip re-presents on the new axis and a first gesture judges cleanly", async ({
  page,
}) => {
  // desktopSide to a non-center side switches scroll axes mid-open; the
  // scroll engine re-attaches (ctx.side dep) so the old axis's position
  // never classifies the new axis's first frame.
  await page.setViewportSize(BELOW);
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, "Responsive side sheet");
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "bottom");

  await page.setViewportSize(ABOVE);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "left", {
    timeout: SPRING_TIMEOUT,
  });
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  // The re-jump lands the track at a real resting position on the NEW axis.
  await expect
    .poll(
      () => dialog.evaluate((el) => el.querySelector(".scrollsheet-track")?.scrollLeft ?? -1),
      { timeout: SPRING_TIMEOUT },
    )
    .toBeGreaterThan(0);

  // Input-stale sub-floor train on the new axis still dismisses (the
  // stale cross-axis prev must not poison the classifier).
  await page.waitForTimeout(1700);
  await dialog.evaluate(async (el) => {
    const track = el.querySelector(".scrollsheet-track") as HTMLElement;
    track.style.scrollSnapType = "none";
    const max = track.scrollWidth - track.clientWidth;
    for (let left = track.scrollLeft; left < max; left += 40) {
      track.scrollTo({ left: Math.min(max, left), behavior: "instant" });
      await new Promise((r) => setTimeout(r, 30));
    }
    track.scrollTo({ left: max, behavior: "instant" });
    track.style.scrollSnapType = "";
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const el = document.querySelector("dialog.scrollsheet-dialog");
          return !el || el.getAttribute("data-scrollsheet-state") !== "open";
        }),
      { timeout: SPRING_TIMEOUT },
    )
    .toBe(true);
});

test("a live center flip never wipes the input stamp (phantom guard)", async ({ page }) => {
  // Stamp under center, cross the breakpoint, teleport inside the window:
  // the jump must stay credited to the user and dismiss.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(ABOVE);
  await page.goto("/");
  const dialog = await openSheetByTrigger(page, TRIGGER);
  await expect(dialog).toHaveAttribute("data-scrollsheet-side", "center");
  await page.waitForTimeout(200);

  const stampAt = await dialog.evaluate((el) => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    return performance.now();
  });

  await page.setViewportSize(BELOW);
  await page.waitForFunction(
    () =>
      document.querySelector("dialog.scrollsheet-dialog")?.getAttribute("data-scrollsheet-side") ===
      "bottom",
    undefined,
    { timeout: SPRING_TIMEOUT },
  );
  await page.waitForTimeout(150);

  // Past the window, fixed and broken are indistinguishable — skip.
  const elapsed = (await page.evaluate(() => performance.now())) - stampAt;
  test.skip(elapsed > 1400, `flip took ${Math.round(elapsed)}ms — stamp went stale`);

  await dialog.evaluate((el) => {
    const track = el.querySelector(".scrollsheet-track");
    if (!track) throw new Error("no .scrollsheet-track");
    track.scrollTo({ top: 0, behavior: "instant" });
  });
  // Boolean poll: under reduced motion webkit unmounts before a negative
  // attribute matcher can resolve the locator (absence errors, not passes).
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const el = document.querySelector("dialog.scrollsheet-dialog");
          return !el || el.getAttribute("data-scrollsheet-state") !== "open";
        }),
      { timeout: SPRING_TIMEOUT },
    )
    .toBe(true);
});
