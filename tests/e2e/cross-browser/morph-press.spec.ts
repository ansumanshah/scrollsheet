import { type Locator, type Page, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openOverlayByTrigger } from "../helpers";

/**
 * A press during a content morph lands between snap stops the morph hasn't
 * rebuilt yet. Handing that position back to snap could land it on the closed
 * stop, and settle() reads that as a dismissal.
 */

const TRACK = ".scrollsheet-track";

async function openAndWatch(page: Page) {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Morph press");
  await overlay.evaluate((el) => {
    const w = window as unknown as { closed: boolean };
    w.closed = false;
    new MutationObserver(() => {
      if (el.getAttribute("data-scrollsheet-state") !== "open") w.closed = true;
    }).observe(el, { attributes: true, attributeFilter: ["data-scrollsheet-state"] });
  });
  return overlay;
}

const everClosed = (page: Page) =>
  page.evaluate(() => (window as unknown as { closed: boolean }).closed);

const maxDetent = (overlay: Locator) =>
  overlay.evaluate((el) =>
    parseFloat(getComputedStyle(el).getPropertyValue("--scrollsheet-max-detent")),
  );

/** Starts the grow morph and returns once `fraction` of its travel has passed. */
async function growUntil(page: Page, overlay: Locator, fraction: number) {
  const from = await overlay.locator(TRACK).evaluate((el) => el.scrollTop);
  await overlay.getByRole("button", { name: "Grow" }).click();
  await expect.poll(() => maxDetent(overlay), { timeout: SPRING_TIMEOUT }).toBeGreaterThan(from + 200);
  const to = await maxDetent(overlay);
  await overlay.locator(TRACK).evaluate(
    (el, past) =>
      new Promise<void>((resolve) => {
        const check = () => (el.scrollTop >= past ? resolve() : requestAnimationFrame(check));
        check();
      }),
    from + (to - from) * fraction,
  );
  return { from, to };
}

const centerOf = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Past the settle a wrong re-snap would trigger. */
const settled = (page: Page) => page.waitForTimeout(250);

async function expectLanded(page: Page, overlay: Locator, to: number) {
  await expect
    .poll(() => overlay.locator(TRACK).evaluate((el) => el.scrollTop), { timeout: SPRING_TIMEOUT })
    .toBeCloseTo(to, 0);
  await expect(overlay).toHaveAttribute("data-scrollsheet-state", "open");
  expect(await everClosed(page)).toBe(false);
}

for (const fraction of [0.05, 0.5, 0.9]) {
  test(`a press ${fraction * 100}% through a morph keeps the sheet open`, async ({ page }) => {
    const overlay = await openAndWatch(page);
    await growUntil(page, overlay, fraction);
    const { x, y } = await centerOf(overlay.getByTestId("morph-spot"));
    await page.mouse.move(x, y);
    await page.mouse.down();
    await settled(page);
    await page.mouse.up();
    const to = await maxDetent(overlay);
    await expectLanded(page, overlay, to);
  });
}

test("a press on a button during a morph clicks it", async ({ page }) => {
  const overlay = await openAndWatch(page);
  const { from } = await growUntil(page, overlay, 0.9);
  const { x, y } = await centerOf(overlay.getByRole("button", { name: "Shrink" }));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await settled(page);
  await page.mouse.up();
  await expect.poll(() => maxDetent(overlay), { timeout: SPRING_TIMEOUT }).toBe(from);
  await expectLanded(page, overlay, from);
});

test("a press held past the tween's own duration still resumes on release", async ({ page }) => {
  const overlay = await openAndWatch(page);
  const { to } = await growUntil(page, overlay, 0.05);
  const { x, y } = await centerOf(overlay.getByTestId("morph-spot"));
  await page.mouse.move(x, y);
  await page.mouse.down();
  const frozen = await overlay.locator(TRACK).evaluate((el) => el.scrollTop);
  await page.waitForTimeout(900);
  expect(await overlay.locator(TRACK).evaluate((el) => el.scrollTop)).toBeCloseTo(frozen, 0);
  await page.mouse.up();
  await expectLanded(page, overlay, to);
});

/**
 * Dispatched in the page on the frame the morph first moves: a round trip from
 * here lands past the close threshold, where a wrong judgment wouldn't show.
 */
for (const [name, selector] of [
  ["the handle", "[data-scrollsheet-handle]"],
  ["panel content", '[data-testid="morph-spot"]'],
] as const) {
  test(`a press on ${name} below the close threshold keeps the sheet open`, async ({ page }) => {
    const overlay = await openAndWatch(page);
    const from = await overlay.locator(TRACK).evaluate((el) => el.scrollTop);
    const press = overlay.evaluate(
      (dialog, { selector, from }) =>
        new Promise<number>((resolve) => {
          const track = dialog.querySelector<HTMLElement>(".scrollsheet-track")!;
          const target = dialog.querySelector<HTMLElement>(selector)!;
          const fire = (type: string) =>
            target.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                button: 0,
                buttons: type === "pointerdown" ? 1 : 0,
                pointerId: 1,
                pointerType: "mouse",
              }),
            );
          const check = () => {
            if (track.scrollTop <= from) return requestAnimationFrame(check);
            const at = track.scrollTop;
            fire("pointerdown");
            setTimeout(() => {
              fire("pointerup");
              resolve(at);
            }, 100);
          };
          requestAnimationFrame(check);
        }),
      { selector, from },
    );
    await overlay.getByRole("button", { name: "Grow" }).click();
    const pressedAt = await press;
    const to = await maxDetent(overlay);
    expect(pressedAt).toBeLessThan(to / 2);
    await expectLanded(page, overlay, to);
  });
}

test("a real drag during a morph can still dismiss", async ({ page }) => {
  const overlay = await openAndWatch(page);
  await growUntil(page, overlay, 0.5);
  const { x, y } = await centerOf(overlay.getByTestId("morph-spot"));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, Math.min(y + 500, page.viewportSize()!.height - 2), { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0, { timeout: SPRING_TIMEOUT });
});

test("a real drag during a morph that doesn't dismiss lands on the rebuilt stop", async ({
  page,
}) => {
  const overlay = await openAndWatch(page);
  const { to } = await growUntil(page, overlay, 0.9);
  const { x, y } = await centerOf(overlay.getByTestId("morph-spot"));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 40, { steps: 6 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await expectLanded(page, overlay, to);
  await settled(page);
  await expectLanded(page, overlay, to);
});

test("touch: a tap during a morph keeps the sheet open, a pan can still dismiss", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium" || !page.context().browser(), "CDP touch input");
  test.skip(!(await page.evaluate(() => navigator.maxTouchPoints > 0)), "touch projects only");
  const client = await page.context().newCDPSession(page);
  const touch = (type: string, x?: number, y?: number) =>
    client.send("Input.dispatchTouchEvent", {
      type: type as "touchStart",
      touchPoints: x === undefined ? [] : [{ x, y: y! }],
    });
  try {
    const overlay = await openAndWatch(page);
    const { to } = await growUntil(page, overlay, 0.05);
    const spot = await centerOf(overlay.getByTestId("morph-spot"));
    await touch("touchStart", spot.x, spot.y);
    await settled(page);
    await touch("touchEnd");
    await expectLanded(page, overlay, to);

    await overlay.getByRole("button", { name: "Shrink" }).click();
    await expect.poll(() => maxDetent(overlay), { timeout: SPRING_TIMEOUT }).toBeLessThan(to);
    await growUntil(page, overlay, 0.5);
    const from = await centerOf(overlay.getByTestId("morph-spot"));
    await touch("touchStart", from.x, from.y);
    const viewport = page.viewportSize()!.height;
    for (let i = 1; i <= 12; i++) {
      await touch("touchMove", from.x, Math.min(from.y + i * 50, viewport - 2));
    }
    await touch("touchEnd");
    await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0, { timeout: SPRING_TIMEOUT });
  } finally {
    await client.detach().catch(() => {});
  }
});
