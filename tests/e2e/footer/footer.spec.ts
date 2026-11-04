import { type Locator, type Page, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openOverlayByTrigger } from "../helpers";

/**
 * Sheet.Footer geometry on the mobile presentation. Every read is a live
 * getBoundingClientRect: sticky has no JS to spy on, so position is the proof.
 * These run on the mobile projects; the desktop dock has its own spec.
 */

interface Box {
  top: number;
  bottom: number;
}

const rect = (locator: Locator): Promise<Box> =>
  locator.evaluate((el) => {
    const { top, bottom } = el.getBoundingClientRect();
    return { top, bottom };
  });

async function open(page: Page, trigger: string) {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, trigger);
  return {
    overlay,
    panel: overlay.locator(".scrollsheet-panel"),
    track: overlay.locator(".scrollsheet-track"),
    footer: overlay.getByTestId("footer"),
  };
}

const viewportHeight = (page: Page) => page.evaluate(() => window.innerHeight);

/**
 * A drag frame, frozen: places the track at a raw reveal with snap out of the
 * way and reads back in the same task, ahead of any scrollend. Left to settle,
 * a reveal under the close threshold dismisses the sheet between two reads.
 */
function geometryAtReveal(track: Locator, revealPx: number) {
  return track.evaluate((el, reveal) => {
    el.style.scrollSnapType = "none";
    el.scrollTop = reveal;
    const panel = el.querySelector(".scrollsheet-panel")!.getBoundingClientRect();
    const footer = el.querySelector("[data-scrollsheet-footer]")!.getBoundingClientRect();
    return { panelTop: panel.top, footerTop: footer.top, footerBottom: footer.bottom };
  }, revealPx);
}

async function stubKeyboard(page: Page, heightPx: number) {
  await page.evaluate((kb) => {
    const vv = window.visualViewport;
    if (!vv) return;
    Object.defineProperty(vv, "height", {
      value: document.documentElement.clientHeight - kb,
      configurable: true,
    });
    vv.dispatchEvent(new Event("resize"));
  }, heightPx);
}

async function expectPinnedTo(footer: Locator, edge: number) {
  await expect.poll(async () => (await rect(footer)).bottom, { timeout: SPRING_TIMEOUT }).toBeCloseTo(edge, 0);
}

test.describe("pinned at every detent", () => {
  test("sits on the viewport's bottom edge at each stop", async ({ page }) => {
    const { overlay, panel, footer } = await open(page, "Footer detents");
    const vp = await viewportHeight(page);
    await expectPinnedTo(footer, vp);
    const handle = overlay.locator("[data-scrollsheet-handle]");
    for (let stop = 0; stop < 2; stop++) {
      await handle.focus();
      await page.keyboard.press("ArrowUp");
      await expectPinnedTo(footer, vp);
      expect((await rect(panel)).top).toBeLessThan((await rect(footer)).top);
    }
  });

  test("holds through any frame of a drag", async ({ page }) => {
    const { track, footer } = await open(page, "Footer detents");
    const vp = await viewportHeight(page);
    for (const reveal of [150, 300, 455, 610, 700]) {
      expect((await geometryAtReveal(track, reveal)).footerBottom).toBeCloseTo(vp, 0);
    }
  });

  test("rides the panel's top edge down once the reveal is shorter than the footer", async ({
    page,
  }) => {
    const { track, footer } = await open(page, "Footer detents");
    const height = await footer.evaluate((el) => el.getBoundingClientRect().height);
    const { panelTop, footerTop } = await geometryAtReveal(track, height / 2);
    expect(footerTop).toBeCloseTo(panelTop, 0);
  });

  test("short content still leaves the footer on the sheet's edge, not after the content", async ({
    page,
  }) => {
    const { footer } = await open(page, "Footer short");
    await expectPinnedTo(footer, await viewportHeight(page));
  });

  test("stays inside the panel through the enter and exit legs", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const w = window as unknown as { __strays: number; __frames: number };
      w.__strays = 0;
      w.__frames = 0;
      const tick = () => {
        const panel = document.querySelector(".scrollsheet-panel");
        const footer = document.querySelector("[data-scrollsheet-footer]");
        if (panel && footer) {
          const p = panel.getBoundingClientRect();
          const f = footer.getBoundingClientRect();
          w.__frames++;
          if (f.top < p.top - 1 || f.bottom > p.bottom + 1) w.__strays++;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await openOverlayByTrigger(page, "Footer detents");
    await page.keyboard.press("Escape");
    await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0, { timeout: SPRING_TIMEOUT });
    const { strays, frames } = await page.evaluate(() => {
      const w = window as unknown as { __strays: number; __frames: number };
      return { strays: w.__strays, frames: w.__frames };
    });
    expect(frames).toBeGreaterThan(10);
    expect(strays).toBe(0);
  });
});

test.describe("layout", () => {
  test("a content detent includes the footer and nothing overlaps it", async ({ page }) => {
    const { overlay, panel, footer } = await open(page, "Footer content");
    const [panelBox, footerBox, last] = [
      await rect(panel),
      await rect(footer),
      await rect(overlay.getByTestId("footer-last-row")),
    ];
    expect(footerBox.bottom).toBeCloseTo(panelBox.bottom, 0);
    expect(last.bottom).toBeLessThanOrEqual(footerBox.top + 1);
  });

  test("at the tallest detent the last row scrolls clear of the footer", async ({ page }) => {
    const { overlay, panel, footer } = await open(page, "Footer detents");
    await overlay.locator("[data-scrollsheet-handle]").focus();
    await page.keyboard.press("End");
    await expect(overlay).toHaveAttribute("data-scrollsheet-at-max", "", {
      timeout: SPRING_TIMEOUT,
    });
    const vp = await viewportHeight(page);
    await expectPinnedTo(footer, vp);
    await panel.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const last = await rect(overlay.getByTestId("footer-last-row"));
    expect(last.bottom).toBeLessThanOrEqual((await rect(footer)).top + 1);
    expect((await rect(footer)).bottom).toBeCloseTo(vp, 0);
  });

  test("fill keeps an inner scroller above the footer", async ({ page }) => {
    const { overlay, footer } = await open(page, "Footer fill");
    await expectPinnedTo(footer, await viewportHeight(page));
    await overlay.locator("[data-scrollsheet-handle]").focus();
    await page.keyboard.press("End");
    await expect(overlay).toHaveAttribute("data-scrollsheet-at-max", "", {
      timeout: SPRING_TIMEOUT,
    });
    const inner = overlay.locator(".sheet-inner");
    await inner.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const last = await rect(overlay.getByTestId("footer-last-row"));
    expect(last.bottom).toBeLessThanOrEqual((await rect(footer)).top + 1);
  });

  test("the safe-area inset moves off the panel and onto the footer's background", async ({
    page,
  }) => {
    const { panel, footer } = await open(page, "Footer safe area");
    await expect(panel).toHaveCSS("padding-bottom", "0px");
    await expect(footer).toHaveCSS("border-bottom-width", "34px");
    await expect(footer).toHaveCSS("background-clip", "border-box");
    const vp = await viewportHeight(page);
    await expectPinnedTo(footer, vp);
    // The consumer's own padding stays intact above the inset.
    await expect(footer).toHaveCSS("padding-bottom", "12px");
    const action = await rect(footer.getByTestId("footer-action"));
    expect(action.bottom).toBeLessThanOrEqual(vp - 34 - 12 + 1);
  });

  test("a floating card's footer rides the card's bottom edge at full, the viewport below it", async ({
    page,
  }) => {
    await page.goto("/");
    const detached = await openOverlayByTrigger(page, "Footer detached");
    const detachedFooter = detached.getByTestId("footer");
    const vp = await viewportHeight(page);
    await expectPinnedTo(detachedFooter, vp);
    await detached.locator("[data-scrollsheet-handle]").focus();
    await page.keyboard.press("End");
    await expect(detached).toHaveAttribute("data-scrollsheet-at-max", "", {
      timeout: SPRING_TIMEOUT,
    });
    await expectPinnedTo(detachedFooter, vp - 16);
    expect((await rect(detachedFooter)).bottom).toBeCloseTo(
      (await rect(detached.locator(".scrollsheet-panel"))).bottom,
      0,
    );
  });

  test("a sheet without a footer keeps every default", async ({ page }) => {
    await page.goto("/");
    const overlay = await openOverlayByTrigger(page, "Keyboard expand sheet");
    await expect(overlay).not.toHaveAttribute("data-scrollsheet-has-footer", "");
    const panel = overlay.locator(".scrollsheet-panel");
    await expect(panel).toHaveCSS("overflow-y", "hidden");
    await expect(panel).not.toHaveCSS("display", "flex");
  });
});

test.describe("with the keyboard open", () => {
  for (const trigger of ["Footer detents", "Footer form"]) {
    test(`${trigger}: sits on the keyboard at a partial detent`, async ({ page }) => {
      const { overlay, footer } = await open(page, trigger);
      const vp = await viewportHeight(page);
      await overlay.getByLabel("Top field").focus();
      await stubKeyboard(page, 300);
      await expect(overlay).toHaveAttribute("data-scrollsheet-kb", "", { timeout: SPRING_TIMEOUT });
      await expectPinnedTo(footer, vp - 300);
      await stubKeyboard(page, 0);
      await expect(overlay).not.toHaveAttribute("data-scrollsheet-kb", "", {
        timeout: SPRING_TIMEOUT,
      });
      await expectPinnedTo(footer, vp);
    });
  }

  test("sits on the keyboard at the tallest detent too", async ({ page }) => {
    const { overlay, footer } = await open(page, "Footer detents");
    await overlay.locator("[data-scrollsheet-handle]").focus();
    await page.keyboard.press("End");
    await expect(overlay).toHaveAttribute("data-scrollsheet-at-max", "", {
      timeout: SPRING_TIMEOUT,
    });
    const vp = await viewportHeight(page);
    await overlay.getByLabel("Top field").focus();
    await stubKeyboard(page, 300);
    await expectPinnedTo(footer, vp - 300);
  });

  test("the engine's focus scroll lands the field clear of the footer, not behind it", async ({
    page,
  }) => {
    const { overlay, panel, footer } = await open(page, "Footer detents");
    const field = overlay.getByLabel("Last field");
    await overlay.getByLabel("Top field").focus();
    await stubKeyboard(page, 300);
    await expect(overlay).toHaveAttribute("data-scrollsheet-kb", "", { timeout: SPRING_TIMEOUT });
    // focus() itself centers the field in Chromium, which would hide the bug:
    // start from the far side and make the engine's exact call.
    await panel.evaluate((el) => {
      el.scrollTop = 0;
    });
    await field.evaluate((el) => el.scrollIntoView({ block: "nearest", inline: "nearest" }));
    const [fieldBox, footerBox] = [await rect(field), await rect(footer)];
    expect(fieldBox.bottom).toBeLessThanOrEqual(footerBox.top + 1);
    expect(fieldBox.top).toBeGreaterThanOrEqual(0);
  });

  test("the keyboard-cut fade stays off the footer", async ({ page }) => {
    const { overlay } = await open(page, "Footer detents");
    await overlay.getByLabel("Top field").focus();
    await stubKeyboard(page, 300);
    await expect(overlay).toHaveAttribute("data-scrollsheet-kb", "", { timeout: SPRING_TIMEOUT });
    await expect(overlay.locator(".scrollsheet-kb-fade")).toHaveCSS("display", "none");
  });
});

test.describe("interaction", () => {
  test("its button works at a partial detent", async ({ page }) => {
    const { overlay } = await open(page, "Footer detents");
    await overlay.getByTestId("footer-action").click();
    await expect(overlay.getByTestId("footer-clicks")).toHaveText("1");
    await expect(overlay).toHaveAttribute("data-scrollsheet-state", "open");
  });

  test("a submit button inside a display:contents form submits and stays pinned", async ({
    page,
  }) => {
    const { overlay, footer } = await open(page, "Footer form");
    await expectPinnedTo(footer, await viewportHeight(page));
    await overlay.getByTestId("footer-action").click();
    await expect(overlay.locator("form")).toHaveAttribute("data-submitted", "true");
  });

  test("a non-modal sheet pins it the same way", async ({ page }) => {
    const { footer } = await open(page, "Footer non-modal");
    await expectPinnedTo(footer, await viewportHeight(page));
  });
});

test.describe("content changes while open", () => {
  const panelHeight = (panel: Locator) =>
    panel.evaluate((el) => el.getBoundingClientRect().height);

  test("a content detent shrinks and grows even though the footer stretches the body", async ({
    page,
  }) => {
    const { overlay, panel, footer } = await open(page, "Footer morph");
    const tall = await panelHeight(panel);
    const toggle = overlay.getByRole("button", { name: "Toggle rows" });
    await toggle.click();
    await expect.poll(() => panelHeight(panel), { timeout: SPRING_TIMEOUT }).toBeLessThan(tall - 40);
    await expectPinnedTo(footer, await viewportHeight(page));
    await toggle.click();
    await expect
      .poll(() => panelHeight(panel), { timeout: SPRING_TIMEOUT })
      .toBeCloseTo(tall, 0);
  });

  test("a footer mounting or leaving while open re-measures the sheet around it", async ({
    page,
  }) => {
    const { overlay, panel } = await open(page, "Footer morph");
    const withFooter = await panelHeight(panel);
    const toggle = overlay.getByRole("button", { name: "Toggle footer" });
    await toggle.click();
    await expect(overlay).not.toHaveAttribute("data-scrollsheet-has-footer", "", {
      timeout: SPRING_TIMEOUT,
    });
    await expect
      .poll(() => panelHeight(panel), { timeout: SPRING_TIMEOUT })
      .toBeLessThan(withFooter - 20);
    await toggle.click();
    await expect(overlay).toHaveAttribute("data-scrollsheet-has-footer", "", {
      timeout: SPRING_TIMEOUT,
    });
    await expect
      .poll(() => panelHeight(panel), { timeout: SPRING_TIMEOUT })
      .toBeCloseTo(withFooter, 0);
  });
});

test.describe("dev warning", () => {
  const collect = (page: Page) => {
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning") warnings.push(msg.text());
    });
    return warnings;
  };

  test("fires for a footer nested in a box, which cannot pin", async ({ page }) => {
    const warnings = collect(page);
    await open(page, "Footer nested");
    expect(warnings.join()).toContain("Sheet.Footer");
  });

  test("stays quiet for a direct child and for a display:contents wrapper", async ({ page }) => {
    const warnings = collect(page);
    await open(page, "Footer detents");
    await open(page, "Footer form");
    expect(warnings.join()).not.toContain("Sheet.Footer");
  });
});

test.describe("other sides", () => {
  test("a side panel's footer sits at the panel's bottom", async ({ page }) => {
    const { panel, footer } = await open(page, "Footer right");
    expect((await rect(footer)).bottom).toBeCloseTo((await rect(panel)).bottom, 0);
    await expect(footer).toBeInViewport();
  });

  test("a top sheet's footer sits at its leading edge, without a safe-area inset", async ({
    page,
  }) => {
    const { panel, footer } = await open(page, "Footer top");
    expect((await rect(footer)).bottom).toBeCloseTo((await rect(panel)).bottom, 0);
    await expect(footer).toHaveCSS("border-bottom-width", "0px");
  });

  test("a centered dialog's footer ends the card", async ({ page }) => {
    const { panel, footer } = await open(page, "Footer center");
    expect((await rect(footer)).bottom).toBeCloseTo((await rect(panel)).bottom, 0);
    await expect(footer).toHaveCSS("border-bottom-width", "0px");
  });
});
