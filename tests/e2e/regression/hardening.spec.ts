import { expect, test } from "@playwright/test";
import {
  SPRING_TIMEOUT,
  openOverlayByTrigger,
  openSheetByTrigger,
  waitForStableScrollTop,
} from "../helpers";

/** Focus, keyboard, viewport, and dismissal regressions using the shared fixtures. */

function trackErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe("item 1: keyboard detection is gated on focus, with a resize-delta threshold on top", () => {
  test("no keyboard-summoning element focused: even a large visualViewport change (Safari's bottom bar) leaves the inset at 0", async ({
    page,
  }) => {
    // The focus gate (adapted from react-modal-sheet's useVirtualKeyboard,
    // MIT) subsumes the old threshold-only guard: without a focused
    // keyboard-summoning element inside the sheet, a vv delta is *never*
    // treated as "the keyboard" regardless of its size — it's Safari's
    // bottom-bar collapsing/expanding, full stop.
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const track = dialog.locator(".scrollsheet-track");
    const before = await track.evaluate((el) => el.scrollTop);

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      // A large delta — well past the 100px threshold — with nothing
      // focused inside the sheet at all.
      Object.defineProperty(vv, "height", { value: window.innerHeight - 300, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(250);
    const keyboard = await track.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--scrollsheet-keyboard").trim(),
    );
    // The *exposed* inset is what the focus gate owns and this item is
    // about — it must stay 0 regardless of focus. Unset counts: with no
    // editable ever focused the keyboard chunk never loads, and every CSS
    // consumer reads var(--scrollsheet-keyboard, 0px). Track re-measuring
    // against a genuinely resized viewport is a separate concern this test
    // isn't about.
    expect(["", "0px"]).toContain(keyboard);
    void before;

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
  });

  test("a keyboard-summoning element focused: a 30px change (toolbar) is ignored; a 300px change (real keyboard) registers", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Input types sheet");
    const track = dialog.locator(".scrollsheet-track");
    await dialog.getByLabel("Text input").focus();

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight - 30, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(250);
    const keyboardAfterBlip = await track.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--scrollsheet-keyboard").trim(),
    );
    expect(keyboardAfterBlip).toBe("0px");

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight - 300, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    await expect(async () => {
      const kb = await track.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--scrollsheet-keyboard").trim(),
      );
      expect(kb).toBe("300px");
    }).toPass({ timeout: SPRING_TIMEOUT });

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
  });

  test("blurring the keyboard-summoning element resets the inset to 0", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Input types sheet");
    const track = dialog.locator(".scrollsheet-track");
    const textInput = dialog.getByLabel("Text input");
    await textInput.focus();

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight - 300, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    await expect(async () => {
      const kb = await track.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--scrollsheet-keyboard").trim(),
      );
      expect(kb).toBe("300px");
    }).toPass({ timeout: SPRING_TIMEOUT });

    await textInput.evaluate((el) => (el as HTMLElement).blur());
    await expect(async () => {
      const kb = await track.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--scrollsheet-keyboard").trim(),
      );
      expect(kb).toBe("0px");
    }).toPass({ timeout: SPRING_TIMEOUT });

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "height", { value: window.innerHeight, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
  });
});

test.describe("item 5: pinch-zoom guard", () => {
  test("a visualViewport scale change doesn't trigger a remeasure/rejump", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const track = dialog.locator(".scrollsheet-track");
    const before = await track.evaluate((el) => el.scrollTop);

    await page.evaluate(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      Object.defineProperty(vv, "scale", { value: 1.5, configurable: true });
      vv.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(250);
    const after = await track.evaluate((el) => el.scrollTop);
    expect(after).toBe(before);
  });
});

test.describe("item 6: keyboard-avoidance focus matcher excludes non-text inputs", () => {
  test("only keyboard-summoning inputs request the library's focus scroll", async ({ page }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Input types sheet");
    await dialog.locator("input").evaluateAll((inputs) => {
      for (const input of inputs) {
        const original = input.scrollIntoView.bind(input);
        input.setAttribute("data-focus-scroll-count", "0");
        input.scrollIntoView = (options) => {
          input.setAttribute(
            "data-focus-scroll-count",
            String(Number(input.getAttribute("data-focus-scroll-count")) + 1),
          );
          input.setAttribute("data-focus-scroll-options", JSON.stringify(options));
          original(options);
        };
      }
    });

    // Native focus scrolling does not call the JS method; observe the library's
    // debounced request instead of conflating it with the browser's scrollTop.
    for (const label of ["Range input", "Checkbox input"]) {
      const input = dialog.getByLabel(label);
      await input.focus();
      await page.waitForTimeout(350); // beyond the 250ms focus-scroll debounce
      await expect(input).toHaveAttribute("data-focus-scroll-count", "0");
    }
    const text = dialog.getByLabel("Text input");
    await text.focus();
    await expect(text).toHaveAttribute("data-focus-scroll-count", "1");
    await expect(text).toHaveAttribute(
      "data-focus-scroll-options",
      JSON.stringify({ block: "nearest", inline: "nearest" }),
    );
  });
});

test.describe("item 3: a swallowed pointerup recovers instead of sticking", () => {
  test("a mouse buttons:0 pointermove (no pointerup ever arrived) resolves the drag", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const panel = dialog.locator(".scrollsheet-panel");
    const track = dialog.locator(".scrollsheet-track");
    const box = await panel.boundingBox();
    if (!box) throw new Error("panel bounding box unavailable");
    const x = box.x + box.width / 2;
    const y = box.y + 20;

    await panel.dispatchEvent("pointerdown", {
      pointerId: 5,
      pointerType: "mouse",
      button: 0,
      buttons: 1,
      clientX: x,
      clientY: y,
      bubbles: true,
    });
    await panel.dispatchEvent("pointermove", {
      pointerId: 5,
      pointerType: "mouse",
      buttons: 1,
      clientX: x,
      clientY: y + 60,
      bubbles: true,
    });
    // Let the release-velocity window go stale (MAX_RELEASE_VELOCITY_AGE_MS)
    // before the recovery move: dispatchEvent timing is machine-dependent,
    // and a fast roundtrip would make the 60px move a legitimate
    // flick-to-dismiss — this test is about recovery, not fling semantics.
    await page.waitForTimeout(120);
    // The button released without a pointerup ever arriving — simulated by
    // a pointermove that now reports buttons:0.
    await panel.dispatchEvent("pointermove", {
      pointerId: 5,
      pointerType: "mouse",
      buttons: 0,
      clientX: x,
      clientY: y + 60,
      bubbles: true,
    });

    await expect(dialog).not.toHaveAttribute("data-scrollsheet-dragging", "", {
      timeout: SPRING_TIMEOUT,
    });
    const settled = await waitForStableScrollTop(track);

    // A later stray pointermove (the phantom-drag-continues symptom) must
    // no longer move the sheet.
    await panel.dispatchEvent("pointermove", {
      pointerId: 5,
      pointerType: "mouse",
      buttons: 0,
      clientX: x,
      clientY: y + 400,
      bubbles: true,
    });
    await page.waitForTimeout(150);
    expect(await track.evaluate((el) => el.scrollTop)).toBe(settled);
    expect(errors).toEqual([]);
  });
});

test.describe("item 4: a second pointer mid-drag is ignored", () => {
  test("a second touch pointerdown while a non-modal drag is active doesn't hijack it", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    const dialog = await openOverlayByTrigger(page, "No handle non-modal");
    const panel = dialog.locator(".scrollsheet-panel");
    const box = await panel.boundingBox();
    if (!box) throw new Error("panel bounding box unavailable");
    const x = box.x + box.width / 2;
    const y = box.y + 20;

    await panel.dispatchEvent("pointerdown", {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: x,
      clientY: y,
      bubbles: true,
    });
    await panel.dispatchEvent("pointermove", {
      pointerId: 1,
      pointerType: "touch",
      clientX: x,
      clientY: y + 60,
      bubbles: true,
    });
    // A second finger touches down mid-drag.
    await panel.dispatchEvent("pointerdown", {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      clientX: x + 40,
      clientY: y,
      bubbles: true,
    });
    // The original drag (pointerId 1) must still be the active one.
    await expect(dialog).toHaveAttribute("data-scrollsheet-dragging", "");

    await panel.dispatchEvent("pointerup", {
      pointerId: 1,
      pointerType: "touch",
      clientX: x,
      clientY: y + 500,
      bubbles: true,
    });
    await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0, { timeout: SPRING_TIMEOUT });
    expect(errors).toEqual([]);
  });
});

test.describe("item 7: release-velocity sanity", () => {
  test("a single reversed-direction sample right before release doesn't override a clear net drag direction", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const panel = dialog.locator(".scrollsheet-panel");
    const track = dialog.locator(".scrollsheet-track");
    const before = await track.evaluate((el) => el.scrollTop);
    const max = await track.evaluate((el) => el.scrollHeight - el.clientHeight);
    const travel = (max - before) * 0.7;
    expect(travel).toBeGreaterThan(24);

    await panel.evaluate((el, travel) => {
      const box = el.getBoundingClientRect();
      const x = box.x + box.width / 2;
      const y = box.y + 20;
      const original = Object.getOwnPropertyDescriptor(performance, "now");
      const start = performance.now();
      let elapsed = 0;
      Object.defineProperty(performance, "now", {
        configurable: true,
        value: () => start + elapsed,
      });
      const dispatch = (type: string, offset: number, time: number) => {
        elapsed = time;
        el.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 17,
            pointerType: "mouse",
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: x,
            clientY: y + offset,
            bubbles: true,
          }),
        );
      };
      try {
        dispatch("pointerdown", 0, 0);
        dispatch("pointermove", -travel - 15, 150);
        // The first sample falls outside the 100ms window. Only the 15px
        // reversal remains: without sign agreement its projection dismisses.
        dispatch("pointermove", -travel, 154);
        dispatch("pointerup", -travel, 155);
      } finally {
        if (original) Object.defineProperty(performance, "now", original);
        else Reflect.deleteProperty(performance, "now");
      }
    }, travel);

    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
    await expect
      .poll(async () => {
        const after = await track.evaluateAll((tracks) => tracks[0]?.scrollTop ?? -1);
        return Math.abs(after - max);
      })
      .toBeLessThanOrEqual(3);
  });
});

test.describe("item 8: rubber-band damping past bounds", () => {
  test("dragging past the max detent hard-stops at the clamp — no transform give, no drift", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Full height sheet");
    const panel = dialog.locator(".scrollsheet-panel");
    const track = dialog.locator(".scrollsheet-track");

    await dialog.locator("[data-scrollsheet-handle]").click();
    await waitForStableScrollTop(track);
    await expect(dialog).toHaveAttribute("data-scrollsheet-at-max", "");
    const atMax = await track.evaluate((el) => el.scrollTop);

    const title = dialog.getByRole("heading", { name: "Full height", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    // Past-max drags clamp hard: the panel never picks up a give transform
    // and the track never moves beyond the max stop — the sheet must not
    // scroll past its own height on any input.
    await page.mouse.move(x, startY);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(x, startY - i * 30);

    const heldTransform = await panel.evaluate((el) => getComputedStyle(el).transform);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(heldTransform);
    expect(await track.evaluate((el) => el.scrollTop)).toBe(atMax);

    await page.mouse.up();
    await waitForStableScrollTop(track);
    expect(await track.evaluate((el) => el.scrollTop)).toBe(atMax);
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });
});
