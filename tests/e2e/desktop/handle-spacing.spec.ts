import { type Locator, expect, test } from "@playwright/test";
import { openSheetByTrigger } from "../helpers";

/**
 * Desktop presentation takes Sheet.Handle out of flow (core.css's desktop
 * block: absolute, opacity 0, a left-edge grip only on :focus-visible), so
 * the top spacing the in-flow pill used to provide is put back on
 * .scrollsheet-body as an explicit 18px.
 *
 * That compensation must be scoped to sheets that actually RENDER a handle.
 * A sheet with no <Sheet.Handle> never had a pill to lose, and for a long
 * time got the 18px anyway — dead space above its content, most visible on a
 * full-bleed media panel whose whole point is reaching the panel edge.
 *
 * The scoping is driven by `data-scrollsheet-has-handle`, written in
 * content.tsx's measure(). An attribute rather than a CSS :has() selector so
 * it holds on Firefox 112-120 too, which is inside this library's stated
 * support floor but below :has()'s (Firefox 121+).
 */

const HANDLE_COMPENSATION = "18px";

function bodyPaddingTop(dialog: Locator): Promise<string> {
  return dialog.evaluate(
    (el) => getComputedStyle(el.querySelector(".scrollsheet-body") as HTMLElement).paddingTop,
  );
}

test.describe("desktop handle spacing compensation", () => {
  // The NO-handle and side-sheet-scoping cases were demoted to
  // tests/unit/desktop-handle-spacing.test.tsx (real core.css injected into
  // happy-dom, no drag/native-dialog behavior exercised). This one stays as
  // an e2e smoke test: happy-dom's CSS engine isn't a full cascade
  // implementation, so a real-browser check on the positive path is worth
  // keeping. See test-shed-audit.md row 13.
  test("a sheet WITH a handle gets the in-flow pill's spacing back on the body", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");

    await expect(dialog).toHaveAttribute("data-scrollsheet-has-handle", "");
    expect(await bodyPaddingTop(dialog)).toBe(HANDLE_COMPENSATION);
  });
});
