import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Generous but bounded wait for the ~508ms open/close spring (SHEET_SPRING
 * duration + settle buffer) plus animation/settle overhead. Every wait in
 * these specs uses this instead of a fixed sleep.
 */
export const SPRING_TIMEOUT = 3000;

/** Click a Sheet.Trigger by its visible text and wait for the sheet to reach data-scrollsheet-state="open". */
export async function openSheetByTrigger(
  page: Page,
  triggerName: string,
  dialogIndex = 0,
): Promise<Locator> {
  await page.getByRole("button", { name: triggerName, exact: true }).click();
  const dialog = page.locator("dialog.scrollsheet-dialog").nth(dialogIndex);
  await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  return dialog;
}

/**
 * Same as `openSheetByTrigger`, but matches the overlay by class only
 * (`.scrollsheet-dialog`, no tag qualifier) — needed for non-modal sheets,
 * which render on a `<div popover="manual">` rather than a `<dialog>` where
 * the Popover API is supported (every engine this suite runs against).
 * `openSheetByTrigger` stays untouched (tag-qualified) since every existing
 * spec only ever opens modal — always-`<dialog>` — sheets.
 */
export async function openOverlayByTrigger(
  page: Page,
  triggerName: string,
  index = 0,
): Promise<Locator> {
  await page.getByRole("button", { name: triggerName, exact: true }).click();
  const overlay = page.locator(".scrollsheet-dialog").nth(index);
  await expect(overlay).toHaveAttribute("data-scrollsheet-state", "open", {
    timeout: SPRING_TIMEOUT,
  });
  return overlay;
}

/**
 * Click at the horizontal center, `y` px from the top of the viewport — above
 * any sheet panel — so the click lands on .scrollsheet-track/.scrollsheet-canvas
 * rather than the panel, exercising the "tap outside the panel dismisses" path.
 */
export async function clickAboveThePanel(page: Page, y = 10): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewport size unavailable");
  await page.mouse.click(viewport.width / 2, y);
}

export async function hasAttribute(locator: Locator, name: string): Promise<boolean> {
  return locator.evaluate((el, attr) => el.hasAttribute(attr), name);
}

/**
 * Click a sonner-compat trigger and wait for its Toaster's own `<ol
 * data-scrollsheet-toaster>` position group to appear, with a real row
 * inside it settled past its own enter transition. The sonner shell has no
 * Sheet dependency (a bare portal, not a `.scrollsheet-dialog`), so this is
 * the compat-layer analog of `openOverlayByTrigger` above, not a variant of
 * it — different DOM root entirely.
 *
 * Queries by the neutral name (`[data-scrollsheet-toaster]`/
 * `.scrollsheet-toast`), not the sonner one — dual naming (the maintainer's
 * neutral-first directive) stamps BOTH on every element, so this also
 * proves the neutral path works; specs that specifically assert sonner
 * compat query `.sonner-toast`/`[data-sonner-toaster]` directly instead.
 *
 * Waits for a row, not the `<ol>` itself: every `.scrollsheet-toast` is
 * `position: absolute` (shell/toaster-shell.tsx's own doc comment on why —
 * no shared panel-height concept), so the `<ol>` contributes zero height of
 * its own and never passes Playwright's own `toBeVisible()` box-size check,
 * even once it's fully populated — real Sonner's own DOM has the identical
 * property, and nothing here needs the `<ol>` itself to have a paintable box.
 *
 * Also waits for opacity:1, not just Playwright's own `toBeVisible()`: a
 * row is already boxed and non-`visibility:hidden` the instant it mounts,
 * at opacity:0, mid its own 250ms enter fade — Playwright counts that as
 * "visible" (its own definition has no opacity floor), which raced a
 * dismiss fired immediately after against the enter transition and made
 * the exit fade look like it snapped straight to 0 (nothing to fade FROM).
 * The old Sheet-backed Toaster never hit this: its own ~500ms open spring
 * gated `openOverlayByTrigger`, comfortably outlasting the row's 250ms fade.
 */
export async function openToasterByTrigger(
  page: Page,
  triggerName: string,
  index = 0,
): Promise<Locator> {
  await page.getByRole("button", { name: triggerName, exact: true }).click();
  const toaster = page.locator("[data-scrollsheet-toaster]").nth(index);
  const row = toaster.locator(".scrollsheet-toast").first();
  await expect(row).toBeVisible({ timeout: SPRING_TIMEOUT });
  await expect(row).toHaveCSS("opacity", "1", { timeout: SPRING_TIMEOUT });
  return toaster;
}

/**
 * Wait until a track's scrollTop stops changing across consecutive
 * `expect.poll` retries (which use Playwright's own growing backoff
 * intervals — 100ms, 250ms, 500ms, ...), i.e. the animateScrollTo tween (or
 * the initial synchronous placement) has settled. Returns the settled value.
 *
 * Deliberately does *not* compare two reads separated by a short fixed delay
 * on a single attempt: if the underlying effect hasn't fired yet by the time
 * that attempt runs, two back-to-back reads of the untouched pre-animation
 * value would look "stable" and report a false positive. Requiring the value
 * to match across two independent poll cycles avoids that.
 */
export async function waitForStableScrollTop(
  track: Locator,
  timeout = SPRING_TIMEOUT,
): Promise<number> {
  let previous: number | null = null;
  let matched = false;
  await expect
    .poll(
      async () => {
        const current = await track.evaluate((el) => el.scrollTop);
        matched = previous !== null && current === previous;
        previous = current;
        return matched;
      },
      { timeout },
    )
    .toBe(true);
  return track.evaluate((el) => el.scrollTop);
}

/**
 * Same as `waitForStableScrollTop`, generalized to `scrollLeft` too — for
 * left/right (horizontal) sheets' track. `waitForStableScrollTop` stays
 * untouched; this is an additive sibling, not a refactor of it.
 */
export async function waitForStableScroll(
  track: Locator,
  prop: "scrollTop" | "scrollLeft",
  timeout = SPRING_TIMEOUT,
): Promise<number> {
  let previous: number | null = null;
  let matched = false;
  await expect
    .poll(
      async () => {
        const current = await track.evaluate((el, p) => el[p], prop);
        matched = previous !== null && current === previous;
        previous = current;
        return matched;
      },
      { timeout },
    )
    .toBe(true);
  return track.evaluate((el, p) => el[p], prop);
}
