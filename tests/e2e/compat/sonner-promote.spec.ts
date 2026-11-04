import { expect, type Page, test } from "@playwright/test";
import { SPRING_TIMEOUT } from "../helpers";

/**
 * Collapsed non-front rows hide their content. Promotion must bring it back
 * as a fade that starts with the card's move forward, on every dismissal path.
 */

interface Sample {
  t: number;
  front: boolean;
  opacity: number;
  /** Swiped row's center, while it's still in the DOM. */
  out: { x: number; y: number } | null;
}

async function fireStack(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Sonner: show many toasts", exact: true }).click();
  const front = page.locator('.scrollsheet-toast[data-front="true"]');
  await expect(front).toHaveText(/Third/, { timeout: SPRING_TIMEOUT });
  await expect(front).toHaveCSS("opacity", "1", { timeout: SPRING_TIMEOUT });
  await expect(page.locator(".scrollsheet-toast", { hasText: "Second" })).toHaveCSS(
    "transform",
    /matrix/,
  );
}

/** Starts per-frame sampling of the "Second" row and its content; `t` is relative to `armEvent`. */
async function armSampler(page: Page, armEvent: "click" | "pointerup"): Promise<void> {
  await page.evaluate((event) => {
    const rows = [...document.querySelectorAll<HTMLElement>(".scrollsheet-toast")];
    const find = (title: string) => {
      const row = rows.find((r) => r.textContent?.includes(title));
      if (!row) throw new Error(`no row ${title}`);
      return row;
    };
    const next = find("Second");
    const leaving = find("Third");
    const child = next.querySelector<HTMLElement>(".scrollsheet-toast-body");
    if (!child) throw new Error("no toast body");
    const samples: Sample[] = [];
    let start = 0;
    const w = window as unknown as { __promote: Promise<Sample[]> };
    w.__promote = new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        if (start) {
          const box = leaving.isConnected ? leaving.getBoundingClientRect() : null;
          samples.push({
            t: now - start,
            front: next.dataset.front === "true",
            opacity: Number(getComputedStyle(child).opacity),
            out: box ? { x: box.x, y: box.y + box.height / 2 } : null,
          });
          if (now - start > 700) return resolve(samples);
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    document.addEventListener(
      event,
      () => {
        start = performance.now();
      },
      { capture: true, once: true },
    );
  }, armEvent);
}

function assertFadeInStep(samples: Sample[]): void {
  const firstFront = samples.find((s) => s.front);
  expect(firstFront, "row was promoted").toBeTruthy();
  const after = samples.slice(samples.indexOf(firstFront as Sample));
  const opacities = after.map((s) => s.opacity);

  // A fade, not a pop: several in-between frames and no single-frame jump.
  expect(opacities.filter((o) => o > 0.02 && o < 0.98).length).toBeGreaterThanOrEqual(3);
  let previous = opacities[0] as number;
  for (const opacity of opacities) {
    expect(opacity - previous).toBeLessThan(0.6);
    expect(opacity).toBeGreaterThanOrEqual(previous - 0.001);
    previous = opacity;
  }
  // Starts with the promotion and lands inside the card's 250ms move.
  const visible = after.find((s) => s.opacity > 0.05) as Sample;
  expect(visible.t - (firstFront as Sample).t).toBeLessThan(80);
  const landed = after.find((s) => s.opacity > 0.98) as Sample;
  expect(landed.t - (firstFront as Sample).t).toBeLessThan(380);
}

test.describe("sonner compat: promoted toast content", () => {
  test("close button: content fades in with the card moving forward", async ({ page }) => {
    await page.goto("/");
    await fireStack(page);
    await armSampler(page, "click");
    await page.evaluate(() => {
      (
        document.querySelector(
          '.scrollsheet-toast[data-front="true"] .scrollsheet-toast-close',
        ) as HTMLElement
      ).click();
    });
    const samples = await page.evaluate(
      () => (window as unknown as { __promote: Promise<Sample[]> }).__promote,
    );
    assertFadeInStep(samples);
    // Close promotes on the dismissal itself.
    expect((samples.find((s) => s.front) as Sample).t).toBeLessThan(80);
  });

  test("swipe: the next toast promotes on release, while the swiped card keeps flying", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "touch dispatch here is CDP-only");
    await page.goto("/");
    await fireStack(page);
    const box = await page.locator('.scrollsheet-toast[data-front="true"]').boundingBox();
    if (!box) throw new Error("no front toast");
    const y = box.y + box.height / 2;
    const x = box.x + box.width / 2;

    // Real touch: a mouse would hover-expand the stack and show the content early.
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", dx?: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: dx === undefined ? [] : [{ x: x + dx, y }],
      });
    await touch("touchStart", 0);
    await touch("touchMove", 40);
    await touch("touchMove", 90);
    await armSampler(page, "pointerup");
    await touch("touchEnd");

    const samples = await page.evaluate(
      () => (window as unknown as { __promote: Promise<Sample[]> }).__promote,
    );
    assertFadeInStep(samples);
    // No blank hold for the length of the 200ms swipe-out.
    expect((samples.find((s) => s.front) as Sample).t).toBeLessThan(100);

    // The swiped card leaves along its own axis: promotion mustn't re-anchor it.
    const flying = samples.filter((s) => s.out && s.t < 180).map((s) => s.out as { x: number; y: number });
    expect(flying.length).toBeGreaterThanOrEqual(4);
    const startY = (flying[0] as { y: number }).y;
    let previousX = (flying[0] as { x: number }).x;
    for (const out of flying) {
      expect(out.x).toBeGreaterThanOrEqual(previousX - 0.5);
      expect(Math.abs(out.y - startY)).toBeLessThan(2);
      previousX = out.x;
    }
  });

  test("reduced motion keeps a short fade rather than a pop", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await fireStack(page);
    const duration = await page
      .locator(".scrollsheet-toast", { hasText: "Second" })
      .locator(".scrollsheet-toast-body")
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(Number.parseFloat(duration)).toBeGreaterThan(0);
    expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.15);
  });
});
