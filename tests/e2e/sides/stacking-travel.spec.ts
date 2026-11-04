import { type Locator, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * v0.2 TRAVEL-LINKED STACKING. Fixtures at e2e/fixtures/ — "Stacking parent"
 * / "Open stacking child" (both default bottom/modal, so the existing
 * `openSheetByTrigger` — tag-qualified `<dialog>` — works unchanged; the
 * feature itself doesn't depend on side/modal). Both dialogs are modal
 * `<dialog>`s in document order (parent #0, child #1), same convention as
 * the existing e2e/nested-sheets.spec.ts.
 *
 * Extracts the scale factor from the parent panel's computed transform
 * matrix rather than asserting an exact transform string — content.tsx
 * writes `translate3d(x, y, 0) scale(s)`, which the browser always reports
 * back as a matrix()/matrix3d() computed value; the m11 component is the
 * scale factor regardless of the translate values layered alongside it.
 */
async function readPanelScale(panel: Locator): Promise<number> {
  return panel.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    if (t === "none") return 1;
    const m3d = t.match(/^matrix3d\(([^)]+)\)$/);
    const m2d = t.match(/^matrix\(([^)]+)\)$/);
    const nums = (m3d ?? m2d)?.[1]?.split(",").map(Number);
    return nums?.[0] ?? 1;
  });
}

async function readTransitionDuration(panel: Locator): Promise<string> {
  return panel.evaluate((el) => getComputedStyle(el).transitionDuration);
}

/** Public depth-effect hook (content-helpers.ts's applyRecede) — same 0-1 value the built-in recede scale is derived from. */
async function readStackProgress(panel: Locator): Promise<string> {
  return panel.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--scrollsheet-stack-progress").trim(),
  );
}

test.describe("travel-linked stacking", () => {
  test("the parent is fully receded once the child settles open at its resting detent", async ({
    page,
  }) => {
    await page.goto("/");
    const parent = await openSheetByTrigger(page, "Stacking parent", 0);
    const parentPanel = parent.locator(".scrollsheet-panel");
    const before = await readPanelScale(parentPanel);
    expect(before).toBe(1);

    await parent.getByRole("button", { name: "Open stacking child", exact: true }).click();
    const child = page.locator("dialog.scrollsheet-dialog").nth(1);
    await expect(child).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });

    await expect(parent).toHaveAttribute("data-scrollsheet-behind", "");
    await expect
      .poll(async () => readPanelScale(parentPanel), { timeout: SPRING_TIMEOUT })
      .toBeLessThan(1);
    // --scrollsheet-stack-progress: the same public var a consumer would read
    // to drive their own depth effect, at its fully-receded value.
    expect(await readStackProgress(parentPanel)).toBe("1");
  });

  test("the parent panel's scale interpolates with the child's live travel progress while its track is mid-scroll", async ({
    page,
  }) => {
    await page.goto("/");
    const parent = await openSheetByTrigger(page, "Stacking parent", 0);
    const parentPanel = parent.locator(".scrollsheet-panel");
    await parent.getByRole("button", { name: "Open stacking child", exact: true }).click();
    const child = page.locator("dialog.scrollsheet-dialog").nth(1);
    await expect(child).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    await expect.poll(() => readStackProgress(parentPanel)).toBe("1");
    const fullyRecededScale = await readPanelScale(parentPanel);
    const childTrack = child.locator(".scrollsheet-track");
    const before = await childTrack.evaluate((el) => el.scrollTop);
    const title = child.getByRole("heading", { name: "Child", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("child title bounding box unavailable");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    try {
      // Holding a real drag suspends snap through the product's own engine.
      await page.mouse.move(x, y + before * 0.2, { steps: 8 });
      await expect(child).toHaveAttribute("data-scrollsheet-dragging", "");
      const held = await childTrack.evaluate((el) => el.scrollTop);
      expect(before - held).toBeGreaterThan(before * 0.1);
      await expect.poll(() => readPanelScale(parentPanel)).toBeGreaterThan(fullyRecededScale);
      expect(await readPanelScale(parentPanel)).toBeLessThan(1);
      const progress = Number(await readStackProgress(parentPanel));
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(1);
    } finally {
      await page.mouse.up();
    }
  });

  test("transitions are disabled for live child-drag frames, but re-enabled for the open/close spring", async ({
    page,
  }) => {
    await page.goto("/");
    const parent = await openSheetByTrigger(page, "Stacking parent", 0);
    const parentPanel = parent.locator(".scrollsheet-panel");

    await parent.getByRole("button", { name: "Open stacking child", exact: true }).click();
    const child = page.locator("dialog.scrollsheet-dialog").nth(1);
    await expect(child).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    // The initial open push (phase 'pre'/'opening' at push time) is
    // non-live and springs — wait for that to settle before checking the
    // live-drag case below.
    await page.waitForTimeout(600);

    const childTrack = child.locator(".scrollsheet-track");
    const firstDetentPx = await childTrack.evaluate((el) => el.scrollTop);
    await childTrack.evaluate(
      (el, top) => {
        el.scrollTop = top;
        el.dispatchEvent(new Event("scroll"));
      },
      Math.round(firstDetentPx * 0.7),
    );

    await expect
      .poll(async () => readTransitionDuration(parentPanel), { timeout: SPRING_TIMEOUT })
      .toBe("0s");
  });

  test("the parent's un-recede starts the moment the child begins closing, not only after it fully unmounts", async ({
    page,
  }) => {
    // data-scrollsheet-behind is gated on `present && phase !== 'closing'`,
    // not bare `present` — the un-recede push must happen the instant the
    // child *starts* closing, running in parallel with its own exit
    // transform, not wait for the ~508ms exit animation to finish unmounting.
    await page.goto("/");
    const parent = await openSheetByTrigger(page, "Stacking parent", 0);
    await parent.getByRole("button", { name: "Open stacking child", exact: true }).click();
    const child = page.locator("dialog.scrollsheet-dialog").nth(1);
    await expect(child).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    await expect(parent).toHaveAttribute("data-scrollsheet-behind", "");

    await child.getByRole("button", { name: "Close stacking child", exact: true }).click();
    await expect(child).toHaveAttribute("data-scrollsheet-state", "closing", {
      timeout: SPRING_TIMEOUT,
    });
    // The child is still mid-exit (not yet unmounted) — the parent must
    // already have stopped being marked "behind".
    await expect(parent).not.toHaveAttribute("data-scrollsheet-behind", "");

    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(1, {
      timeout: SPRING_TIMEOUT,
    });
    await expect
      .poll(async () => readPanelScale(parent.locator(".scrollsheet-panel")), {
        timeout: SPRING_TIMEOUT,
      })
      .toBe(1);
  });

  test("the parent recedes again on a second silent (no-drag) child open on the same parent", async ({
    page,
  }) => {
    // Regression: applyRecede's cleanup call (setChildProgress(0, false))
    // used to pin --scrollsheet-recede-dim/--scrollsheet-stack-progress to a
    // literal inline '0', which outranks the CSS static default
    // ([data-scrollsheet-behind] .scrollsheet-panel) applied on the *next*
    // child open — leaving the parent stuck un-receded the second time a
    // child opens without ever being dragged.
    await page.goto("/");
    const parent = await openSheetByTrigger(page, "Stacking parent", 0);
    const parentPanel = parent.locator(".scrollsheet-panel");

    await parent.getByRole("button", { name: "Open stacking child", exact: true }).click();
    const child = page.locator("dialog.scrollsheet-dialog").nth(1);
    await expect(child).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    await expect
      .poll(async () => readPanelScale(parentPanel), { timeout: SPRING_TIMEOUT })
      .toBeLessThan(1);
    expect(await readStackProgress(parentPanel)).toBe("1");

    await child.getByRole("button", { name: "Close stacking child", exact: true }).click();
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(1, {
      timeout: SPRING_TIMEOUT,
    });
    await expect.poll(async () => readPanelScale(parentPanel), { timeout: SPRING_TIMEOUT }).toBe(1);

    // Reopen the same child, still without ever dragging it.
    await parent.getByRole("button", { name: "Open stacking child", exact: true }).click();
    const reopenedChild = page.locator("dialog.scrollsheet-dialog").nth(1);
    await expect(reopenedChild).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });

    await expect(parent).toHaveAttribute("data-scrollsheet-behind", "");
    await expect
      .poll(async () => readPanelScale(parentPanel), { timeout: SPRING_TIMEOUT })
      .toBeLessThan(1);
    expect(await readStackProgress(parentPanel)).toBe("1");
  });
});
