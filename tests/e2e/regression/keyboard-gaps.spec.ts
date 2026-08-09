import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * The two keyboard gaps closed after the competitive re-audit: detent
 * promotion under `keyboardExpands`, and keyboard clearance for
 * edge-anchored (top/left/right) sheets. Keyboard emulation is the
 * established vv-stub from hardening.spec.ts item 1: redefine
 * visualViewport.height and dispatch a resize.
 */

async function stubKeyboard(page: import("@playwright/test").Page, heightPx: number) {
  await page.evaluate((kb) => {
    const vv = window.visualViewport;
    if (!vv) return;
    Object.defineProperty(vv, "height", {
      value: window.innerHeight - kb,
      configurable: true,
    });
    vv.dispatchEvent(new Event("resize"));
  }, heightPx);
}

test.describe("keyboardExpands", () => {
  test("keyboard rising edge promotes to the tallest detent; closing restores the peek detent", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Keyboard expand sheet");
    const active = dialog.locator('[data-testid="keyboard-expand-active"]');
    await expect(active).toHaveText("0.3");

    const input = dialog.getByLabel("Expand text input");
    await input.focus();
    // Focus alone (no software keyboard, the desktop hardware-keyboard
    // case) must NOT promote.
    await page.waitForTimeout(150);
    await expect(active).toHaveText("0.3");

    await stubKeyboard(page, 300);
    await expect(active).toHaveText("0.85", { timeout: SPRING_TIMEOUT });

    // Keyboard closes (field still focused, e.g. the user dismissed it):
    // the inset drops below threshold and the peek detent comes back.
    await stubKeyboard(page, 0);
    await expect(active).toHaveText("0.3", { timeout: SPRING_TIMEOUT });
  });

  test("blur while the keyboard is up restores; a detent the user moved to meanwhile is respected", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Keyboard expand sheet");
    const active = dialog.locator('[data-testid="keyboard-expand-active"]');
    const input = dialog.getByLabel("Expand text input");

    await input.focus();
    await stubKeyboard(page, 300);
    await expect(active).toHaveText("0.85", { timeout: SPRING_TIMEOUT });

    // Blur → disarm → inset 0 → restore.
    await input.evaluate((el) => (el as HTMLElement).blur());
    await stubKeyboard(page, 0);
    await expect(active).toHaveText("0.3", { timeout: SPRING_TIMEOUT });

    // Second round: promote, then the consumer (or a drag) moves the sheet
    // off the promoted detent while the keyboard is still up — restore must
    // NOT fight that move.
    await input.focus();
    await stubKeyboard(page, 300);
    await expect(active).toHaveText("0.85", { timeout: SPRING_TIMEOUT });
    await dialog.locator("[data-scrollsheet-handle]").click(); // cycles 0.85 -> 0.3
    await expect(active).toHaveText("0.3", { timeout: SPRING_TIMEOUT });
    await input.evaluate((el) => (el as HTMLElement).blur());
    await stubKeyboard(page, 0);
    await page.waitForTimeout(200);
    await expect(active).toHaveText("0.3");
  });

  test("a sheet without keyboardExpands never promotes", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Input types sheet");
    const track = dialog.locator(".scrollsheet-track");
    const before = await track.evaluate((el) => el.scrollTop);

    await dialog.getByLabel("Text input").focus();
    await stubKeyboard(page, 300);
    // The inset registers (pre-existing behavior) but the detent stays put.
    await expect(async () => {
      const kb = await track.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--scrollsheet-keyboard").trim(),
      );
      expect(kb).toBe("300px");
    }).toPass({ timeout: SPRING_TIMEOUT });
    const after = await track.evaluate((el) => el.scrollTop);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
    await stubKeyboard(page, 0);
  });
});

test.describe("keyboard cap accounts for the panel's hang (iOS 26 field-buried regression)", () => {
  test("a partial-detent sheet keeps its full reveal visible above the keyboard", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Input types sheet");
    const track = dialog.locator(".scrollsheet-track");

    await dialog.getByLabel("Text input").focus();
    await stubKeyboard(page, 300);
    await expect(async () => {
      const kb = await track.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--scrollsheet-keyboard").trim(),
      );
      expect(kb).toBe("300px");
    }).toPass({ timeout: SPRING_TIMEOUT });

    // The panel is max-detent tall and bottom-anchored, so at a partial
    // detent its unrevealed remainder hangs below the track's far edge. The
    // old cap (`max-height: vv-height`) measured from that hanging bottom,
    // which clamped a 0.6-detent sheet to a ~100px sliver the moment the
    // keyboard shrank vv-height — fields buried under the keyboard (found
    // on the iOS 26 simulator; --scrollsheet-kb-hang extends the cap).
    const { visible, expected } = await page.evaluate(() => {
      const trackEl = document.querySelector<HTMLElement>(".scrollsheet-track")!;
      const panelEl = document.querySelector<HTMLElement>(".scrollsheet-panel")!;
      const vvBottom = window.visualViewport!.height; // stubbed: innerHeight - 300
      const rect = panelEl.getBoundingClientRect();
      const reveal = trackEl.scrollTop;
      return {
        visible: Math.min(rect.bottom, vvBottom) - Math.max(rect.top, 0),
        expected: Math.min(reveal, vvBottom),
      };
    });
    expect(visible).toBeGreaterThanOrEqual(expected - 2);
    await stubKeyboard(page, 0);
  });

  test("the hang is written even when offsetTop compensates the shrink (real-device pattern)", async ({
    page,
  }) => {
    // On device, iOS grows vv.offsetTop by roughly what vv.height shrank, so
    // relayout's rawDelta significance gate never opens. The kb-hang write
    // must not depend on that gate or the anchor lift silently no-ops for
    // the whole keyboard session.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Input types sheet");
    const track = dialog.locator(".scrollsheet-track");

    await dialog.getByLabel("Text input").focus();
    await page.evaluate((kb) => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", {
        value: window.innerHeight - kb,
        configurable: true,
      });
      Object.defineProperty(vv, "offsetTop", { value: kb, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    }, 300);

    await expect(async () => {
      const state = await track.evaluate((el) => {
        const dlg = el.closest("dialog, .scrollsheet-dialog") as HTMLElement;
        const canvas = el.querySelector<HTMLElement>(".scrollsheet-canvas");
        return {
          kbAttr: dlg.hasAttribute("data-scrollsheet-kb"),
          hang: canvas?.style.getPropertyValue("--scrollsheet-kb-hang") ?? "",
        };
      });
      expect(state.kbAttr).toBe(true);
      expect(state.hang).not.toBe("");
    }).toPass({ timeout: SPRING_TIMEOUT });
    await stubKeyboard(page, 0);
  });
});

test.describe("edge-anchored sides get keyboard clearance", () => {
  test("a right-side sheet tracks the inset and its body gains matching bottom clearance", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Side keyboard sheet");
    const body = dialog.locator("[data-scrollsheet-body]");
    const input = dialog.getByLabel("Side text input");

    const paddingBefore = await body.evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(paddingBefore).toBe("0px");

    await input.focus();
    await stubKeyboard(page, 300);
    await expect(async () => {
      const padding = await body.evaluate((el) => getComputedStyle(el).paddingBottom);
      expect(padding).toBe("300px");
    }).toPass({ timeout: SPRING_TIMEOUT });

    // The focus scroll (now live on every side) brought the field into the
    // panel's visible range.
    await expect(async () => {
      const visible = await input.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const panel = el.closest(".scrollsheet-panel");
        if (!panel) return false;
        const panelRect = panel.getBoundingClientRect();
        return rect.top >= panelRect.top - 4 && rect.bottom <= panelRect.bottom + 4;
      });
      expect(visible).toBe(true);
    }).toPass({ timeout: SPRING_TIMEOUT });

    await input.evaluate((el) => (el as HTMLElement).blur());
    await stubKeyboard(page, 0);
    await expect(async () => {
      const padding = await body.evaluate((el) => getComputedStyle(el).paddingBottom);
      expect(padding).toBe("0px");
    }).toPass({ timeout: SPRING_TIMEOUT });
  });
});
