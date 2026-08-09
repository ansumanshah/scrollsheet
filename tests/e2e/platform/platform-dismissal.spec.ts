import { expect, test } from "@playwright/test";

import { SPRING_TIMEOUT, openOverlayByTrigger, openSheetByTrigger } from "../helpers";

/**
 * Platform dismissal channels: `dialog.closedby` on modal sheets and
 * CloseWatcher on non-modal ones. Unit coverage
 * (tests/unit/platform-dismissal.test.tsx) exercises resolveClosedBy and
 * the watcher hook against doubles; this file proves the wiring through a
 * real mounted <dialog>.
 *
 * closedby is feature-gated in-test (Chrome/Edge 134+, Firefox 141+ —
 * WebKit has not shipped it), so the same spec passes everywhere: engines
 * without support must leave the attribute off entirely.
 *
 * The CloseWatcher tests replace `window.CloseWatcher` with a recording
 * stub before any page script runs, so they are engine-neutral and
 * deterministic — a real platform close signal (Android back) can't be
 * synthesized in Playwright at all. Real-device verification is tracked in
 * the CHANGELOG's device-verification-pending note.
 */

type StubWindow = {
  __closeWatchers?: Array<{
    destroyed: boolean;
    onclose: (() => void) | null;
  }>;
};

async function supportsClosedBy(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => "closedBy" in HTMLDialogElement.prototype);
}

test.describe("dialog.closedby on modal sheets", () => {
  test("escape-dismissible sheet gets closedby=closerequest; unsupported engines get no attribute", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Basic sheet");
    if (await supportsClosedBy(page)) {
      await expect(dialog).toHaveAttribute("closedby", "closerequest");
    } else {
      await expect(dialog).not.toHaveAttribute("closedby");
    }
  });

  test("non-dismissible sheet gets closedby=none so a platform close request is refused", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Non-dismissible wheel sheet");
    if (await supportsClosedBy(page)) {
      await expect(dialog).toHaveAttribute("closedby", "none");
    } else {
      await expect(dialog).not.toHaveAttribute("closedby");
    }
    // Either way, Esc must not close it — closedby routes the signal on
    // supporting engines, onCancel refuses it on the rest.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open");
  });
});

test.describe("CloseWatcher on non-modal sheets", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      class StubCloseWatcher {
        static instances: StubCloseWatcher[] = [];
        onclose: (() => void) | null = null;
        oncancel: (() => void) | null = null;
        destroyed = false;
        constructor() {
          StubCloseWatcher.instances.push(this);
        }
        requestClose(): void {
          this.onclose?.();
        }
        close(): void {
          this.onclose?.();
        }
        destroy(): void {
          this.destroyed = true;
        }
      }
      (window as unknown as { CloseWatcher: unknown }).CloseWatcher = StubCloseWatcher;
      (window as unknown as { __closeWatchers: StubCloseWatcher[] }).__closeWatchers =
        StubCloseWatcher.instances;
    });
    await page.goto("/");
  });

  test("an open non-modal sheet holds exactly one live watcher, and its close signal dismisses the sheet", async ({
    page,
  }) => {
    // Non-modal sheets render on a <div popover> — class-only selector.
    await openOverlayByTrigger(page, "Non-modal sheet");
    const liveCount = () =>
      page.evaluate(
        () =>
          ((window as unknown as StubWindow).__closeWatchers ?? []).filter((w) => !w.destroyed)
            .length,
      );
    expect(await liveCount()).toBe(1);

    // The platform fires the watcher (what Android back does on a real device).
    await page.evaluate(() => {
      const live = ((window as unknown as StubWindow).__closeWatchers ?? []).find(
        (w) => !w.destroyed,
      );
      live?.onclose?.();
    });
    await expect(page.locator(".scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
    // Teardown destroyed the watcher instead of leaking it.
    expect(await liveCount()).toBe(0);
  });

  test("a modal sheet never creates a watcher — closedby already covers it", async ({ page }) => {
    await openSheetByTrigger(page, "Basic sheet");
    const created = await page.evaluate(
      () => ((window as unknown as StubWindow).__closeWatchers ?? []).length,
    );
    expect(created).toBe(0);
  });
});
