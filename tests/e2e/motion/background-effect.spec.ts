import { type Locator, type Page, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * v0.2 BACKGROUND EFFECT. Fixtures at e2e/fixtures/ — "Background scale
 * sheet" / "Background parallax sheet" both drive the same marked
 * `#page-background-wrapper` (`data-scrollsheet-background`), since only one
 * sheet is ever open at a time in these tests and each fully restores the
 * wrapper's styles on its own close (see content.tsx's background-effect
 * cleanup). Both sheets are default bottom/modal — the feature is
 * orthogonal to side/modal — so the existing tag-qualified
 * `openSheetByTrigger` works unchanged.
 */

async function readTransform(el: Locator): Promise<{ scale: number; translateY: number } | null> {
  return el.evaluate((node) => {
    const t = getComputedStyle(node).transform;
    if (t === "none") return null;
    const m3d = t.match(/^matrix3d\(([^)]+)\)$/);
    const m2d = t.match(/^matrix\(([^)]+)\)$/);
    if (m3d) {
      const nums = m3d[1]!.split(",").map(Number);
      return { scale: nums[0]!, translateY: nums[13]! };
    }
    if (m2d) {
      const nums = m2d[1]!.split(",").map(Number);
      return { scale: nums[0]!, translateY: nums[5]! };
    }
    return null;
  });
}

async function readBorderRadius(el: Locator): Promise<string> {
  return el.evaluate((node) => getComputedStyle(node).borderRadius);
}

async function openAtRest(page: Page, trigger: string) {
  const dialog = await openSheetByTrigger(page, trigger);
  // The sheet opens at its own first detent (0.5) — revealed === firstDetent
  // at rest, so progress is already 1 once settled; no extra scrubbing needed
  // to exercise "the effect at its full amount".
  return dialog;
}

test.describe("background-effect: scale", () => {
  test("the marked wrapper scales down, insets, and rounds once the sheet is open", async ({
    page,
  }) => {
    await page.goto("/");
    const wrapper = page.locator("#page-background-wrapper");
    const before = await readTransform(wrapper);
    expect(before).toBeNull();

    await openAtRest(page, "Background scale sheet");

    await expect
      .poll(async () => (await readTransform(wrapper))?.scale, { timeout: SPRING_TIMEOUT })
      .toBeLessThan(1);
    const after = await readTransform(wrapper);
    expect(after).not.toBeNull();
    expect(after!.scale).toBeGreaterThan(0.9); // a subtle card inset, not a drastic shrink
    expect(after!.translateY).toBeGreaterThanOrEqual(0);

    const radius = await readBorderRadius(wrapper);
    expect(radius).not.toBe("0px");
  });

  test("fully restores the wrapper's styles once the sheet closes", async ({ page }) => {
    await page.goto("/");
    const wrapper = page.locator("#page-background-wrapper");
    const dialog = await openAtRest(page, "Background scale sheet");
    await expect
      .poll(async () => (await readTransform(wrapper))?.scale, { timeout: SPRING_TIMEOUT })
      .toBeLessThan(1);

    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });

    await expect.poll(async () => readTransform(wrapper), { timeout: SPRING_TIMEOUT }).toBeNull();
    expect(await readBorderRadius(wrapper)).toBe("0px");
  });
});

test.describe("background-effect: parallax", () => {
  test("the marked wrapper only shifts vertically — no scale, no border-radius", async ({
    page,
  }) => {
    await page.goto("/");
    const wrapper = page.locator("#page-background-wrapper");

    await openAtRest(page, "Background parallax sheet");

    await expect
      .poll(async () => (await readTransform(wrapper))?.translateY, { timeout: SPRING_TIMEOUT })
      .toBeLessThan(0);
    const after = await readTransform(wrapper);
    expect(after).not.toBeNull();
    // translate3d(0, -Npx, 0) with no scale() at all — scale component is 1.
    expect(after!.scale).toBe(1);
    expect(await readBorderRadius(wrapper)).toBe("0px");
  });

  test("fully restores on close", async ({ page }) => {
    await page.goto("/");
    const wrapper = page.locator("#page-background-wrapper");
    const dialog = await openAtRest(page, "Background parallax sheet");
    await expect
      .poll(async () => (await readTransform(wrapper))?.translateY, { timeout: SPRING_TIMEOUT })
      .toBeLessThan(0);

    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    await expect.poll(async () => readTransform(wrapper), { timeout: SPRING_TIMEOUT }).toBeNull();
  });
});

test.describe("background-effect: no-op without a marked element", () => {
  test("opening a backgroundEffect sheet with no data-scrollsheet-background element in the DOM doesn't throw or block opening", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/");
    await page.evaluate(() => document.querySelector("#page-background-wrapper")?.remove());

    await openSheetByTrigger(page, "Background scale sheet");
    expect(errors).toEqual([]);
  });
});

test.describe("background-effect: the unset default", () => {
  test("a full-height sheet whose trigger lives inside the marked wrapper scales it with no prop", async ({
    page,
  }) => {
    await page.goto("/");
    const wrapper = page.locator("#page-background-wrapper");
    expect(await readTransform(wrapper)).toBeNull();

    await openAtRest(page, "Auto background sheet");
    await expect(async () => {
      const t = await readTransform(wrapper);
      expect(t?.scale).toBeLessThan(1);
    }).toPass({ timeout: SPRING_TIMEOUT });
  });

  test("backgroundEffect='none' opts the same sheet out entirely", async ({ page }) => {
    await page.goto("/");
    const wrapper = page.locator("#page-background-wrapper");
    await openAtRest(page, "Auto background opted out");
    await page.waitForTimeout(400);
    expect(await readTransform(wrapper)).toBeNull();
  });
});

test.describe("background-effect: the default stops qualifying mid-session", () => {
  test("removing the element that opened the sheet winds the wrapper back instead of freezing it", async ({
    page,
  }) => {
    // The default is attributed to the sheet via the opener, so removing the
    // opener makes the rule stop qualifying while the sheet stays open — the
    // same shape as a rotation re-measuring it out of full-height. The
    // wrapper must return to rest, not stay stuck at its last scaled frame.
    await page.goto("/");
    const wrapper = page.locator("#page-background-wrapper");
    await openAtRest(page, "Auto background sheet");
    await expect(async () => {
      expect((await readTransform(wrapper))?.scale).toBeLessThan(1);
    }).toPass({ timeout: SPRING_TIMEOUT });

    await page.evaluate(() => {
      document.activeElement instanceof HTMLElement && document.activeElement.blur();
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.trim() === "Auto background sheet")
        ?.remove();
      // Any travel frame re-evaluates the rule; nudge one without changing
      // the resting detent.
      document.querySelector(".scrollsheet-track")?.dispatchEvent(new Event("scroll"));
    });

    await expect(async () => {
      const t = await readTransform(wrapper);
      expect(t === null || Math.abs(t.scale - 1) < 0.001).toBe(true);
    }).toPass({ timeout: SPRING_TIMEOUT });
  });
});

/**
 * backgroundRef scoping. Fixtures:
 * BackgroundRefSheet (its own `#background-ref-wrapper`, deliberately
 * carrying NO data-scrollsheet-background attribute) and
 * SharedBackgroundRefSheets (`#shared-background-ref-wrapper`, driven by two
 * independent non-modal Sheet.Roots via the same ref). Case 4 — the implicit
 * default staying byte-for-byte unchanged — is the "background-effect: the
 * unset default" describe block above, run untouched as part of this same
 * file; no new code needed for it here.
 */
test.describe("background-effect: backgroundRef scoping", () => {
  test("backgroundRef resolves the target even with no data-scrollsheet-background attribute on it", async ({
    page,
  }) => {
    await page.goto("/");
    const target = page.locator("#background-ref-wrapper");
    expect(await target.getAttribute("data-scrollsheet-background")).toBeNull();
    expect(await readTransform(target)).toBeNull();

    await openAtRest(page, "backgroundRef sheet");

    await expect
      .poll(async () => (await readTransform(target))?.scale, { timeout: SPRING_TIMEOUT })
      .toBeLessThan(1);
  });

  test("backgroundRef beats an existing document-wide marker: only the ref target moves, the marked-but-unreferenced element stays untouched", async ({
    page,
  }) => {
    await page.goto("/");
    const markedWrapper = page.locator("#page-background-wrapper");
    const refTarget = page.locator("#background-ref-wrapper");
    expect(await readTransform(markedWrapper)).toBeNull();
    expect(await readTransform(refTarget)).toBeNull();

    await openAtRest(page, "backgroundRef sheet");

    await expect
      .poll(async () => (await readTransform(refTarget))?.scale, { timeout: SPRING_TIMEOUT })
      .toBeLessThan(1);
    // The document-wide marked element was never queried at all (an explicit
    // backgroundRef skips the query entirely) — it must stay fully at rest.
    expect(await readTransform(markedWrapper)).toBeNull();
  });

  test("two sheets sharing one backgroundRef: the wrapper stays transformed until the last one closes, then winds back", async ({
    page,
  }) => {
    await page.goto("/");
    const shared = page.locator("#shared-background-ref-wrapper");
    expect(await readTransform(shared)).toBeNull();

    // Content-filtered, not `.nth(index)` — a positional locator breaks the
    // instant A's dialog leaves the DOM (B silently becomes index 0), so
    // each is found by its own heading text instead, re-evaluated live on
    // every action below regardless of how many `.scrollsheet-dialog`
    // siblings remain.
    const dialogA = page
      .locator(".scrollsheet-dialog")
      .filter({ has: page.getByRole("heading", { name: "Shared A", exact: true }) });
    const dialogB = page
      .locator(".scrollsheet-dialog")
      .filter({ has: page.getByRole("heading", { name: "Shared B", exact: true }) });

    await page.getByRole("button", { name: "Shared backgroundRef sheet A", exact: true }).click();
    await expect(dialogA).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    await expect
      .poll(async () => (await readTransform(shared))?.scale, { timeout: SPRING_TIMEOUT })
      .toBeLessThan(1);

    await page.getByRole("button", { name: "Shared backgroundRef sheet B", exact: true }).click();
    await expect(dialogB).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    // Both sheets alive: still transformed (trivially true, but pins the
    // starting state the next two assertions depend on).
    expect(await readTransform(shared)).not.toBeNull();

    // A closes first — B is still claiming the shared target via the
    // refcounted snapshot, so nothing restores.
    await dialogA.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator(".scrollsheet-dialog")).toHaveCount(1, { timeout: SPRING_TIMEOUT });
    expect(await readTransform(shared)).not.toBeNull();

    // B closes last — the refcount hits zero and the wrapper winds back.
    await dialogB.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0, { timeout: SPRING_TIMEOUT });
    await expect.poll(async () => readTransform(shared), { timeout: SPRING_TIMEOUT }).toBeNull();
  });
});
