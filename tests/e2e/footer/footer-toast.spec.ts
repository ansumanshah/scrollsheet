import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/** The placements pinned-footer.mdx prescribes, proved against the phone overlap. */

for (const [fire, covered] of [
  ["Fire default", true],
  ["Fire top", false],
  ["Fire raised", false],
] as const) {
  test(`${fire}: the footer's button ${covered ? "sits under the toast" : "keeps its taps"}`, async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Footer toast: open sheet");
    await dialog.getByRole("button", { name: fire }).click();
    await expect(page.locator(".scrollsheet-toast[data-mounted]").first()).toHaveCSS(
      "opacity",
      "1",
      {
        timeout: SPRING_TIMEOUT,
      },
    );
    const onButton = await dialog.getByTestId("footer-toast-action").evaluate((el) => {
      const box = el.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === el;
    });
    expect(onButton).toBe(!covered);
  });
}
