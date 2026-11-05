import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openOverlayByTrigger } from "../helpers";

/**
 * Once a footer stretches the body, its box stops following content, so the
 * height watch has to move to the children even when the footer arrives inside
 * a display:contents wrapper, where no watched childList sees it.
 */

test("a footer mounted in a display:contents wrapper keeps content height live", async ({
  page,
}) => {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Footer late contents");
  const maxDetent = () =>
    overlay.evaluate((el) =>
      parseFloat(getComputedStyle(el).getPropertyValue("--scrollsheet-max-detent")),
    );
  const noFooter = await maxDetent();

  await overlay.getByRole("button", { name: "Mount footer" }).click();
  await expect.poll(maxDetent, { timeout: SPRING_TIMEOUT }).toBeGreaterThan(noFooter);
  await expect(overlay).toHaveAttribute("data-scrollsheet-has-footer", "");
  const twoRows = await maxDetent();

  await overlay.getByRole("button", { name: "Eight rows" }).click();
  await expect.poll(maxDetent, { timeout: SPRING_TIMEOUT }).toBeGreaterThan(twoRows + 200);

  await overlay.getByRole("button", { name: "Two rows" }).click();
  await expect.poll(maxDetent, { timeout: SPRING_TIMEOUT }).toBe(twoRows);
});
