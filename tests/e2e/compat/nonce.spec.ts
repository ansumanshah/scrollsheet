import { expect, test } from "@playwright/test";
import { openOverlayByTrigger } from "../helpers";

/** The compat roots reach the stylesheet injector the same way Sheet.Root does. */
for (const trigger of ["Drawer nonce sheet", "Dialog nonce modal"]) {
  test(`${trigger}: the injected stylesheet carries the nonce`, async ({ page }) => {
    await page.goto("/");
    await openOverlayByTrigger(page, trigger);
    const nonces = await page.evaluate(() =>
      [...document.head.querySelectorAll("style")]
        .filter((style) => style.hasAttributes() && style.textContent?.includes(".scrollsheet-dialog"))
        .map((style) => style.nonce),
    );
    expect(nonces).toEqual(["e2e-nonce"]);
  });
}
