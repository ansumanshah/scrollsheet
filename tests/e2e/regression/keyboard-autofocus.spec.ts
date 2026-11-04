import { type Page, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openOverlayByTrigger } from "../helpers";

/**
 * A field focused at open has to arm the lazy keyboard engine exactly as a
 * tapped one does. The keyboard is emulated with a visualViewport stub, so
 * these specs pin the state machine and the numbers it computes. They cannot
 * show whether iOS raises a real keyboard for this focus, or its real timing.
 */

const MODES = ["Autofocus prop", "Autofocus attr", "Autofocus effect", "Autofocus non-modal"];

/** The whole layout/visual viewport gap: toolbar plus keyboard. */
async function setViewportGap(page: Page, gapPx: number) {
  await page.evaluate((gap) => {
    const vv = window.visualViewport;
    if (!vv) return;
    Object.defineProperty(vv, "height", {
      value: document.documentElement.clientHeight - gap,
      configurable: true,
    });
    vv.dispatchEvent(new Event("resize"));
  }, gapPx);
}

/** A keyboard already rising by the time focus lands: the worst case for a late baseline sample. */
async function growGapOnFocus(page: Page, gapPx: number) {
  await page.evaluate((gap) => {
    document.addEventListener(
      "focusin",
      (event) => {
        if (!(event.target instanceof HTMLInputElement)) return;
        const vv = window.visualViewport;
        if (!vv) return;
        Object.defineProperty(vv, "height", {
          value: document.documentElement.clientHeight - gap,
          configurable: true,
        });
      },
      { capture: true },
    );
  }, gapPx);
}

function keyboardInset(page: Page, trigger: string) {
  return page
    .getByRole("dialog", { name: trigger })
    .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--scrollsheet-keyboard").trim());
}

async function expectInset(page: Page, trigger: string, expected: string) {
  await expect
    .poll(() => keyboardInset(page, trigger), { timeout: SPRING_TIMEOUT })
    .toBe(expected);
}

test("autoFocus lands and arms the keyboard in a sheet opened over a modal", async ({ page }) => {
  await page.goto("/");
  const parent = await openOverlayByTrigger(page, "Autofocus parent");
  await parent.getByRole("button", { name: "Autofocus nested" }).click();
  const input = page.getByLabel("Autofocus nested input");
  await expect(input).toBeFocused();
  await expect(input).not.toHaveAttribute("data-blurred", "true");
  await setViewportGap(page, 300);
  await expectInset(page, "Autofocus nested", "300px");
  await expect(
    page.getByRole("dialog", { name: "Autofocus nested" }).getByTestId("autofocus-active"),
  ).toHaveText("0.85", { timeout: SPRING_TIMEOUT });
});

for (const trigger of MODES) {
  test.describe(trigger, () => {
    test("the field holds focus once the sheet has settled open", async ({ page }) => {
      await page.goto("/");
      await openOverlayByTrigger(page, trigger);
      const input = page.getByLabel(`${trigger} input`);
      await expect(input).toBeFocused();
      // A focus round trip through showModal() would mark a form field touched.
      await expect(input).not.toHaveAttribute("data-blurred", "true");
    });

    test("a keyboard arms the engine and keyboardExpands promotes", async ({ page }) => {
      await page.goto("/");
      await openOverlayByTrigger(page, trigger);
      await setViewportGap(page, 300);
      await expectInset(page, trigger, "300px");
      await expect(page.getByTestId("autofocus-active").first()).toHaveText("0.85", {
        timeout: SPRING_TIMEOUT,
      });
    });

    test("the toolbar baseline predates the focus, so a rising keyboard cannot poison it", async ({
      page,
    }) => {
      await page.goto("/");
      await setViewportGap(page, 50);
      // 75 sits under the 80px plausible-toolbar cap, so a clamp cannot reject it.
      await growGapOnFocus(page, 75);
      await openOverlayByTrigger(page, trigger);
      await setViewportGap(page, 350);
      await expectInset(page, trigger, "300px");
    });

    test("an engine attaching after the keyboard is fully up still arms from the baseline", async ({
      page,
    }) => {
      await page.goto("/");
      await setViewportGap(page, 50);
      await growGapOnFocus(page, 350);
      await openOverlayByTrigger(page, trigger);
      await expectInset(page, trigger, "300px");
    });

    test("the field gets the same focus scroll a tapped field gets", async ({ page }) => {
      await page.addInitScript(() => {
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (this: Element, options) {
          this.setAttribute("data-focus-scrolls", "1");
          original.call(this, options);
        };
      });
      await page.goto("/");
      await openOverlayByTrigger(page, trigger);
      await expect(page.getByLabel(`${trigger} input`)).toHaveAttribute(
        "data-focus-scrolls",
        "1",
        { timeout: SPRING_TIMEOUT },
      );
    });

    test("closing returns focus to the trigger", async ({ page }) => {
      await page.goto("/");
      const opener = page.getByRole("button", { name: trigger, exact: true });
      // Keyboard activation: WebKit never focuses a button on click, which
      // would leave nothing for the restore to target.
      await opener.focus();
      await page.keyboard.press("Enter");
      const overlay = page.locator(".scrollsheet-dialog");
      await expect(overlay).toHaveAttribute("data-scrollsheet-state", "open", {
        timeout: SPRING_TIMEOUT,
      });
      await page.getByRole("button", { name: "Close autofocus sheet" }).click();
      await expect(overlay).toHaveCount(0, { timeout: SPRING_TIMEOUT });
      await expect(opener).toBeFocused();
    });
  });
}

test("a second open re-baselines against the toolbar it opens under", async ({ page }) => {
  const trigger = "Autofocus effect";
  await page.goto("/");
  await openOverlayByTrigger(page, trigger);
  await page.getByRole("button", { name: "Close autofocus sheet" }).click();
  await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0, { timeout: SPRING_TIMEOUT });

  await setViewportGap(page, 50);
  await openOverlayByTrigger(page, trigger);
  await setViewportGap(page, 350);
  await expectInset(page, trigger, "300px");
});
