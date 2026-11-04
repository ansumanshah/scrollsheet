import { type Locator, type Page, expect, test } from "@playwright/test";
import { openOverlayByTrigger } from "../helpers";

// Release velocity is wall-clock real, so a loaded machine can read a flick as
// a placement. Scoped retries, as the vaul closeThreshold bracket does.
test.describe.configure({ retries: 2 });
const SETTLE_TIMEOUT = 10_000;

/**
 * Mouse flicks through the JS drag engine, the only path Playwright can give a
 * real release velocity. A touch flick rides native snap instead, which
 * `scroll-snap-stop: always` handles; its feel needs a real device.
 */

async function flick(page: Page, trigger: string, deltaY: number) {
  const overlay = page.getByRole("dialog", { name: trigger });
  const box = await overlay.locator(".scrollsheet-panel").boundingBox();
  if (!box) throw new Error("panel has no box");
  const x = box.x + box.width / 2;
  const y = box.y + 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(x, y + (deltaY * i) / 4);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

const active = (page: Page, trigger: string) =>
  page.getByRole("dialog", { name: trigger }).getByTestId("flick-active");

test("a release already on a stop still reports that stop as active", async ({ page }) => {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Flick project");
  const track = overlay.locator(".scrollsheet-track");
  const box = await overlay.locator(".scrollsheet-panel").boundingBox();
  if (!box) throw new Error("panel has no box");
  const [from, to] = await track.evaluate((el) => {
    const stops = [0.25, 0.45].map((f) => f * el.clientHeight);
    return [el.scrollTop, stops[1]!];
  });
  const x = box.x + box.width / 2;
  const y = box.y + 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - (to - from), { steps: 4 });
  // Past the stale-release window, so no velocity moves it off the stop.
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(active(page, "Flick project")).toHaveText("0.45", { timeout: SETTLE_TIMEOUT });
});

test("project: a hard flick up crosses more than one stop", async ({ page }) => {
  await page.goto("/");
  await openOverlayByTrigger(page, "Flick project");
  await flick(page, "Flick project", -380);
  await expect(active(page, "Flick project")).toHaveText(/^0\.(65|85)$/, { timeout: SETTLE_TIMEOUT });
});

test("step: the same flick moves exactly one stop", async ({ page }) => {
  await page.goto("/");
  await openOverlayByTrigger(page, "Flick step");
  await flick(page, "Flick step", -380);
  await expect(active(page, "Flick step")).toHaveText("0.45", { timeout: SETTLE_TIMEOUT });
});

test("step: a short flick still advances one stop", async ({ page }) => {
  await page.goto("/");
  await openOverlayByTrigger(page, "Flick step");
  await flick(page, "Flick step", -60);
  await expect(active(page, "Flick step")).toHaveText("0.45", { timeout: SETTLE_TIMEOUT });
});

test("step: a hard flick down from a higher stop steps down instead of dismissing", async ({
  page,
}) => {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Flick step");
  await overlay.getByRole("button", { name: "Go to third stop" }).click();
  await expect(active(page, "Flick step")).toHaveText("0.65", { timeout: SETTLE_TIMEOUT });
  await page.waitForTimeout(600);
  await flick(page, "Flick step", 400);
  await expect(active(page, "Flick step")).toHaveText("0.45", { timeout: SETTLE_TIMEOUT });
  await expect(overlay).toHaveAttribute("data-scrollsheet-state", "open");
});

test("step: a flick down from the first stop still dismisses", async ({ page }) => {
  await page.goto("/");
  await openOverlayByTrigger(page, "Flick step");
  await flick(page, "Flick step", 200);
  await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0, { timeout: SETTLE_TIMEOUT });
});

test("step stamps the attribute native snap reads; project leaves stops skippable", async ({
  page,
}) => {
  await page.goto("/");
  const stepped = await openOverlayByTrigger(page, "Flick step");
  await expect(stepped.locator(".scrollsheet-snap").first()).toHaveCSS(
    "scroll-snap-stop",
    "always",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0, { timeout: SETTLE_TIMEOUT });
  const projected = await openOverlayByTrigger(page, "Flick project");
  await expect(projected.locator(".scrollsheet-snap").first()).toHaveCSS(
    "scroll-snap-stop",
    "normal",
  );
});

const stopHeight = (track: Locator, stop: number) =>
  track.evaluate((el, f) => Math.round(f * el.clientHeight), stop);

test("step: a slow drag past a stop settles on the nearest stop", async ({ page }) => {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Flick step");
  const track = overlay.locator(".scrollsheet-track");
  const box = await overlay.locator(".scrollsheet-panel").boundingBox();
  if (!box) throw new Error("panel has no box");
  const x = box.x + box.width / 2;
  const y = box.y + 40;
  const distance = (await stopHeight(track, 0.65)) - (await stopHeight(track, 0.25));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - distance, { steps: 20 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect(active(page, "Flick step")).toHaveText("0.65", { timeout: SETTLE_TIMEOUT });
  await page.waitForTimeout(600);
  await expect(active(page, "Flick step")).toHaveText("0.65");
});

test("step: a native scroll landing past a stop reports where it landed", async ({ page }) => {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Flick step");
  const track = overlay.locator(".scrollsheet-track");
  await page.waitForTimeout(600);
  const target = await stopHeight(track, 0.65);
  // The stamped pointerup credits the jump to a user, past the phantom-scroll guard.
  await track.evaluate((el, top) => {
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    el.scrollTo({ top, behavior: "instant" });
  }, target);
  await expect(active(page, "Flick step")).toHaveText("0.65", { timeout: SETTLE_TIMEOUT });
});

test("step: a touch tap with a few pixels of jitter is not a flick", async ({ page }) => {
  await page.goto("/");
  const overlay = await openOverlayByTrigger(page, "Flick step non-modal");
  const track = overlay.locator(".scrollsheet-track");
  await page.waitForTimeout(600);
  const before = await track.evaluate((el) => el.scrollTop);
  // Synthetic so the 3px lands inside the 10ms a real tap's jitter takes.
  await active(page, "Flick step non-modal").evaluate((el) => {
    const { x, y } = el.getBoundingClientRect();
    const fire = (type: string, clientY: number) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          pointerType: "touch",
          clientX: x + 1,
          clientY,
        }),
      );
    fire("pointerdown", y + 4);
    const end = performance.now() + 5;
    while (performance.now() < end);
    fire("pointermove", y + 1);
    fire("pointerup", y + 1);
  });
  await page.waitForTimeout(600);
  expect(Math.abs((await track.evaluate((el) => el.scrollTop)) - before)).toBeLessThan(5);
  await expect(active(page, "Flick step non-modal")).toHaveText("0.25");
});
