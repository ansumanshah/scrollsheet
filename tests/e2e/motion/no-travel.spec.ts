import { expect, test } from "@playwright/test";

/**
 * --scrollsheet-travel: none — the consumer opt-out of the enter/exit
 * travel, for sheets whose entrance something else carries (the docs'
 * lightbox morphs the thumbnail into the panel via the View Transitions
 * API; a slide-in playing underneath the morph tells a second story).
 * The leg still runs and settles the phase machine, in zero time.
 */

test("a --scrollsheet-travel: none sheet never paints an offscreen frame", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const trigger = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "No travel sheet",
    );
    if (!trigger) throw new Error("fixture trigger missing");
    trigger.click();
    const transforms = new Set<string>();
    let state = "";
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const dialog = document.querySelector("dialog[open].scrollsheet-dialog");
      const panel = dialog?.querySelector(".scrollsheet-panel");
      if (!panel) continue;
      transforms.add(getComputedStyle(panel).transform);
      state = dialog?.getAttribute("data-scrollsheet-state") ?? "";
      if (state === "open") break;
    }
    return { transforms: [...transforms], state };
  });

  expect(result.state).toBe("open");
  // A hard cut: at most the parked resting transform (frames before the
  // leg starts) and identity. A running spring paints many intermediates.
  expect(result.transforms.length).toBeLessThanOrEqual(2);
  expect(result.transforms).toContain("matrix(1, 0, 0, 1, 0, 0)");

  const dialog = page.locator('dialog[aria-label="No travel sheet"]');

  // Close settles the phase machine just as instantly.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
