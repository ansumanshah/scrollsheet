import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openToasterByTrigger } from "../helpers";

/**
 * sonner compat: behavior that doesn't depend on mouse hover (that
 * needs a real mouse, so it lives in desktop-sonner-compat.spec.ts instead).
 * Every fixture button here uses a long duration so the auto-dismiss timer
 * doesn't race the assertions — see e2e/fixtures/app.tsx's SonnerFixture doc
 * comment.
 *
 * DOM shape here is the sonner-architecture shell's (src/toast/shell/):
 * a bare `<section data-react-aria-top-layer>` portal, one `<ol
 * data-sonner-toaster>` per position, and one persistent `<div
 * class="sonner-toast">` row per live toast — visible or hidden past
 * `visibleToasts`, but never evicted or replaced by a decorative ghost.
 */

test.describe("sonner compat: basic toast lifecycle", () => {
  test("toast() opens the toaster with the message and description visible", async ({ page }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show toast");

    // Dual naming (neutral primary + sonner compat, stamped on every
    // element): openToasterByTrigger resolves the toaster/row via the
    // neutral [data-scrollsheet-toaster]/.scrollsheet-toast names, and every
    // sonner-named query below this line still matches the SAME nodes.
    await expect(overlay).toHaveAttribute("data-scrollsheet-toaster", "");
    await expect(overlay.locator(".sonner-toast").first()).toHaveClass(/\bscrollsheet-toast\b/);

    await expect(overlay.locator(".sonner-toast-title")).toHaveText("Event created");
    await expect(overlay.locator(".sonner-toast-description")).toHaveText("Monday at 9am");
    // Non-modal by construction now: a bare `<section aria-live="polite">`
    // portal, not a <dialog> — there's no modal semantics left to assert
    // against (the top-layer tradeoff this costs is an honest, documented
    // gap — see src/toast's own module doc comment).
  });

  test("toast.success renders with data-type=success on the row and its icon", async ({ page }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show success toast");

    await expect(overlay.locator(".sonner-toast[data-type='success']")).toBeVisible();
    await expect(overlay.locator(".sonner-toast-icon[data-type='success']")).toBeVisible();
  });

  test("toast.promise shows loading, then resolves to success in place", async ({ page }) => {
    await page.goto("/");
    // Not openToasterByTrigger here: that waits for a spring settle that
    // doesn't exist in this architecture, but does poll for visibility,
    // which can eat enough of the fixture's loading→success window that
    // "loading" has already resolved to "success" by the time this test
    // gets to look for it. The row exists immediately on click, well before
    // any enter transition finishes, so asserting straight off the trigger
    // click is what actually decouples this from animation timing.
    await page.getByRole("button", { name: "Sonner: show promise toast", exact: true }).click();
    const toaster = page.locator("[data-sonner-toaster]");

    await expect(toaster.locator(".sonner-toast[data-type='loading']")).toBeVisible();
    await expect(toaster.locator(".sonner-toast[data-type='success']")).toBeVisible({
      timeout: SPRING_TIMEOUT,
    });
    await expect(toaster.locator(".sonner-toast-title")).toHaveText("Saved: draft-1");
  });

  test("toast.dismiss() with no id clears the whole queue and closes the toaster", async ({
    page,
  }) => {
    await page.goto("/");
    await openToasterByTrigger(page, "Sonner: show many toasts");

    await page.getByRole("button", { name: "Sonner: dismiss all", exact: true }).click();
    await expect(page.locator("[data-sonner-toaster]")).toHaveCount(0, { timeout: SPRING_TIMEOUT });
  });

  test("a fast-expiring toast auto-dismisses and closes the toaster on its own", async ({
    page,
  }) => {
    await page.goto("/");
    await openToasterByTrigger(page, "Sonner: show fast-expiring toast");

    await expect(page.locator("[data-sonner-toaster]")).toHaveCount(0, { timeout: SPRING_TIMEOUT });
  });
});

/**
 * Parity-2 smokes: id routing (toasterId — see SonnerQueueFixture/
 * SonnerShrinkFixture elsewhere in this file for the other half, per-toast
 * `id` upsert — already exercised through "Sonner: promise overflow
 * order"'s fixed id="promise-order"), promise Response/Error/unwrap,
 * classNames merge, and icons are all extensively unit-covered
 * (tests/unit/compat/sonner-compat.test.tsx,
 * sonner-drop-in-parity.test.tsx) — these are the one smoke each through a
 * real mounted toaster that unit coverage can't reach.
 */
test.describe("sonner compat: parity-2 smokes", () => {
  test("toast.promise's error branch renders through a real toaster", async ({ page }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show rejecting promise toast");

    await expect(overlay.locator(".sonner-toast[data-type='error']")).toBeVisible({
      timeout: SPRING_TIMEOUT,
    });
    await expect(overlay.locator(".sonner-toast-title")).toHaveText("Failed: boom");
  });

  test("a per-toast classNames.toast lands on the rendered row", async ({ page }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show classNames toast");

    await expect(overlay.locator(".sonner-toast.e2e-custom-toast-class")).toBeVisible();
  });

  test("a per-toast icon renders in place of the default glyph", async ({ page }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show custom icon toast");

    await expect(overlay.locator('[data-testid="e2e-custom-toast-icon"]')).toBeVisible();
  });
});

test.describe("sonner compat: stacking", () => {
  test("queuing several toasts keeps every one a real row — only the front is fully shown, the rest recede with blanked chrome", async ({
    page,
  }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show many toasts");

    // visibleToasts={3} on the fixture's <Toaster>, 3 toasts fired:
    // hide-not-evict means every one is a real, persistent row — never a
    // decorative ghost. All three sit inside the visible window here, so
    // the "receded" look of the two non-front rows comes from
    // data-expanded="false" blanking their own content via CSS, not from
    // them being hidden past the cap.
    await expect(overlay.locator(".sonner-toast")).toHaveCount(3);
    await expect(overlay.locator('.sonner-toast[data-visible="true"]')).toHaveCount(3);
    await expect(
      overlay.locator('.sonner-toast[data-front="true"] .sonner-toast-title'),
    ).toHaveText("Third");
    await expect(
      overlay.locator('.sonner-toast[data-front="false"][data-expanded="false"]'),
    ).toHaveCount(2);
  });

  test("the close button dismisses only the front toast — the next one steps up", async ({
    page,
  }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show many toasts");
    const front = overlay.locator('.sonner-toast[data-front="true"]');
    await expect(front.locator(".sonner-toast-title")).toHaveText("Third");

    // dispatchEvent, not click(): a real click() moves the mouse across the
    // toaster first, which fires mouseenter on the <ol> and expands the
    // stack (real, desired behavior, covered by desktop-sonner-compat.spec.ts)
    // — a confound for a test that's specifically about the collapsed,
    // front-only close path.
    await front.locator(".sonner-toast-close").dispatchEvent("click");

    // "Third" keeps rendering on its own already-mounted node for its own
    // exit-hold (data-removed, ~220ms, use-toast-exit.ts) instead of
    // unmounting immediately, and it keeps its own last-known data-front
    // value for that exit transition — scoped out below so the newly
    // promoted front ("Second") is the only match.
    const newFront = overlay.locator('.sonner-toast[data-front="true"]:not([data-removed])');
    await expect(newFront.locator(".sonner-toast-title")).toHaveText("Second");
    // And the exit-hold itself actually ends — "Third" leaves the DOM
    // rather than lingering past its EXIT_MS window.
    await expect(overlay.locator(".sonner-toast[data-removed]")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });
});

test.describe("sonner compat: visibleToasts overflow (hide-not-evict)", () => {
  test("firing more than visibleToasts hides the overflow instead of evicting it — nothing is ever dismissed by overflow", async ({
    page,
  }) => {
    await page.goto("/");
    // Fires 5 toasts against visibleToasts=3 (see app.tsx's SonnerFixture).
    const overlay = await openToasterByTrigger(page, "Sonner: overflow queue");

    // Every one of the 5 is a real, persistent DOM node — 3 visible, 2
    // hidden (data-visible="false"), never evicted.
    await expect(overlay.locator(".sonner-toast")).toHaveCount(5);
    await expect(overlay.locator('.sonner-toast[data-visible="true"]')).toHaveCount(3);
    await expect(overlay.locator('.sonner-toast[data-visible="false"]')).toHaveCount(2);
    await expect(
      overlay.locator('.sonner-toast[data-front="true"]:not([data-removed]) .sonner-toast-title'),
    ).toHaveText("Overflow 5");

    const dismissed = await page.evaluate(
      () =>
        (window as unknown as { __sonnerOverflowDismissed?: string[] }).__sonnerOverflowDismissed,
    );
    // Hide-not-evict has no eviction left to fire onDismiss for — an empty
    // array here is the whole point, not a weaker assertion than before.
    expect(dismissed).toEqual([]);
  });
});

test.describe("sonner compat: toast.promise vs. overflow windowing", () => {
  test("a loading→success update in place doesn't disturb which toast is front or hidden", async ({
    page,
  }) => {
    await page.goto("/");
    // "Keep A", a toast.promise (id "promise-order", loading→success),
    // "Keep C" — exactly fills visibleToasts=3, nothing hidden.
    const overlay = await openToasterByTrigger(page, "Sonner: promise overflow order");
    await expect(overlay.locator(".sonner-toast")).toHaveCount(3);
    await expect(overlay.locator('.sonner-toast[data-visible="true"]')).toHaveCount(3);
    await expect(
      overlay.locator('.sonner-toast[data-front="true"] .sonner-toast-title'),
    ).toHaveText("Keep C");

    // The promise settles ~300ms after firing (see app.tsx) — updating its
    // record in place (same id, upsert()'s existing-index branch, which
    // never touches array position). Front toast and visible count must
    // read exactly the same afterward: an in-place content update is not a
    // new arrival and must not disturb windowing.
    await page.waitForTimeout(500);
    await expect(
      overlay.locator('.sonner-toast[data-front="true"] .sonner-toast-title'),
    ).toHaveText("Keep C");
    await expect(overlay.locator('.sonner-toast[data-visible="true"]')).toHaveCount(3);
  });
});

test.describe("sonner compat: dismissible: false earns no protection", () => {
  test("a new arrival bumps older non-dismissible toasts into hidden exactly like any other overflow — no queueing left to protect against", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Sonner queue: saturate non-dismissible", exact: true })
      .click();

    const overlay = page.locator("[data-sonner-toaster]");
    await expect(overlay.locator(".sonner-toast").first()).toBeVisible({ timeout: SPRING_TIMEOUT });
    await expect(overlay.locator(".sonner-toast")).toHaveCount(3);
    await expect(
      overlay.locator('.sonner-toast[data-front="true"] .sonner-toast-title'),
    ).toHaveText("Locked 3");

    await page
      .getByRole("button", { name: "Sonner queue: add behind saturation", exact: true })
      .click();
    // Every existing slot is dismissible:false, but that grants it no
    // protection anymore (state.ts's selectToastWindow doc comment): the
    // new arrival renders immediately as the new front toast, and "Locked
    // 1" (now the oldest) is pushed into hidden — still a real, timed row.
    await expect(overlay.locator(".sonner-toast")).toHaveCount(4);
    await expect(
      overlay.locator('.sonner-toast[data-front="true"] .sonner-toast-title'),
    ).toHaveText("Queued toast");
    await expect(overlay.locator('.sonner-toast[data-visible="true"]')).toHaveCount(3);
    await expect(
      overlay.locator('.sonner-toast[data-visible="false"] .sonner-toast-title'),
    ).toHaveText("Locked 1");

    await page
      .getByRole("button", { name: "Sonner queue: free a locked slot", exact: true })
      .click();
    // Freeing "Locked 1" (the oldest, already hidden) drops the store back
    // to 3 — everything fits inside visibleToasts again, all visible.
    await expect(overlay.locator(".sonner-toast")).toHaveCount(3, { timeout: SPRING_TIMEOUT });
    await expect(overlay.locator('.sonner-toast[data-visible="true"]')).toHaveCount(3);
  });
});

test.describe("sonner compat: enter/exit motion", () => {
  test("a freshly-fired toast passes through a real mid-transition frame before settling opaque", async ({
    page,
  }) => {
    await page.goto("/");
    // Sampled entirely client-side (one round trip, not Node-side polling
    // delays) — toast.css's .sonner-toast[data-mounted] rule transitions
    // opacity 0→1 over 250ms; this collects opacity across several
    // animation frames right after the mount flag flips and asserts at
    // least one sample landed strictly between 0 and 1.
    const samples = await page.evaluate(async () => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Sonner: show toast",
      );
      btn?.click();
      const row = await new Promise<HTMLElement>((resolve) => {
        const check = () => {
          const el = document.querySelector<HTMLElement>(".sonner-toast[data-mounted]");
          if (el) resolve(el);
          else requestAnimationFrame(check);
        };
        check();
      });
      const vals: number[] = [];
      const start = performance.now();
      await new Promise<void>((resolve) => {
        function tick() {
          vals.push(Number.parseFloat(getComputedStyle(row).opacity));
          if (performance.now() - start < 220) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      return vals;
    });
    expect(
      samples.some((v) => v > 0.02 && v < 0.98),
      `samples: ${JSON.stringify(samples)}`,
    ).toBe(true);
    // And the transition actually settles fully opaque by the end of the
    // 220ms sampling window (the CSS transition itself is 250ms, so this is
    // deliberately not asserted — the mid-transition claim above is the
    // point of this test, not full settle timing).
  });

  test("a dismissed toast holds data-removed for roughly EXIT_MS before actually unmounting", async ({
    page,
  }) => {
    await page.goto("/");
    await openToasterByTrigger(page, "Sonner: show toast");

    // Selector-based sampling, not a captured element reference: this stays
    // selector-based even though use-toast-exit.ts keeps the SAME DOM node
    // mounted continuously across a dismissal (the diff that adds an id to
    // `exiting` runs during render, not in a later effect, specifically so
    // the row is never absent for a commit — see that hook's own doc
    // comment). A selector-based poll still exercises the real behavior
    // just fine and doesn't need to change to prove it.
    const trace = await page.evaluate(async () => {
      const closeBtn = document.querySelector<HTMLElement>(".sonner-toast-close");
      if (!closeBtn) return null;
      const samples: Array<{ t: number; removedCount: number }> = [];
      const start = performance.now();
      closeBtn.click();
      await new Promise<void>((resolve) => {
        function tick() {
          samples.push({
            t: performance.now() - start,
            removedCount: document.querySelectorAll(".sonner-toast[data-removed]").length,
          });
          if (performance.now() - start < 400) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      return samples;
    });
    expect(trace, "no close button found").not.toBeNull();
    const samples = trace ?? [];

    // Held: at least one sample in the first ~150ms still shows the removed
    // row present.
    expect(samples.some((s) => s.t < 150 && s.removedCount === 1)).toBe(true);
    // Then actually unmounts: by the end of the 400ms sampling window
    // (comfortably past EXIT_MS=220), it's gone.
    const last = samples.at(-1);
    expect(last?.removedCount).toBe(0);
  });

  test("a dismissed toast's own row actually fades from opaque, not stuck at opacity 0", async ({
    page,
  }) => {
    await page.goto("/");
    await openToasterByTrigger(page, "Sonner: show toast");

    // Regression coverage for the exit DOM-identity bug: dismissing the
    // toaster's only toast used to swap in a BRAND NEW element for the
    // exit-hold (the row disappeared from `live` for one commit before
    // use-toast-exit.ts's own effect re-added it as `exiting`), and a
    // freshly-created element has no prior computed opacity for
    // [data-removed]'s transition to animate FROM — it just painted at its
    // resting opacity:0 for the whole hold and never visibly faded. The
    // previous test's removedCount-based sampling can't tell a
    // continuously-animating row from one stuck at 0 the entire time (both
    // report removedCount===1); this samples the row's own opacity instead.
    const samples = await page.evaluate(async () => {
      const closeBtn = document.querySelector<HTMLElement>(".sonner-toast-close");
      if (!closeBtn) return null;
      const vals: number[] = [];
      const start = performance.now();
      closeBtn.click();
      await new Promise<void>((resolve) => {
        function tick() {
          const row = document.querySelector<HTMLElement>(".sonner-toast[data-removed]");
          if (row) vals.push(Number.parseFloat(getComputedStyle(row).opacity));
          if (performance.now() - start < 200) requestAnimationFrame(tick);
          else resolve();
        }
        requestAnimationFrame(tick);
      });
      return vals;
    });
    expect(samples, "no close button found").not.toBeNull();
    const vals = samples ?? [];

    // At least two consecutive frames strictly between 0 and 1 — proof the
    // row is genuinely mid-transition (interpolating), not just present at
    // a fixed value across two samples by coincidence.
    let consecutiveMidTransition = 0;
    for (const v of vals) {
      if (v > 0.02 && v < 0.98) {
        consecutiveMidTransition++;
        if (consecutiveMidTransition >= 2) break;
      } else {
        consecutiveMidTransition = 0;
      }
    }
    expect(consecutiveMidTransition, `opacities: ${JSON.stringify(vals)}`).toBeGreaterThanOrEqual(
      2,
    );
  });
});

test.describe("sonner compat: visibleToasts shrink mid-session", () => {
  test("shrinking visibleToasts hides the overflow instead of evicting it — nothing dismissed, survivor correct", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sonner shrink: fill to 3", exact: true }).click();
    const overlay = page.locator("[data-sonner-toaster]");
    await expect(overlay.locator(".sonner-toast").first()).toBeVisible({ timeout: SPRING_TIMEOUT });
    await expect(overlay.locator(".sonner-toast")).toHaveCount(3);
    await expect(overlay.locator('.sonner-toast[data-visible="true"]')).toHaveCount(3);

    await page
      .getByRole("button", { name: "Sonner shrink: set visibleToasts to 1", exact: true })
      .click();

    // selectToastWindow recomputes synchronously against the NEW
    // visibleToasts on the very same render — the store's own toasts array
    // (A, B, C oldest-to-newest) still holds all three; the window alone
    // shrinks, so 2 fall into hidden instead of being evicted.
    await expect(overlay.locator(".sonner-toast")).toHaveCount(3);
    await expect(overlay.locator('.sonner-toast[data-visible="true"]')).toHaveCount(1, {
      timeout: SPRING_TIMEOUT,
    });
    await expect(overlay.locator('.sonner-toast[data-visible="false"]')).toHaveCount(2);
    await expect(
      overlay.locator('.sonner-toast[data-front="true"] .sonner-toast-title'),
    ).toHaveText("Shrink C");

    const dismissed = await page.evaluate(
      () => (window as unknown as { __sonnerShrinkDismissed?: string[] }).__sonnerShrinkDismissed,
    );
    expect(dismissed).toEqual([]);
  });
});

test.describe("sonner compat: focus is never stolen", () => {
  test("firing a toast while focus is in an unrelated input leaves focus exactly where it was", async ({
    page,
  }) => {
    await page.goto("/");
    const input = page.getByLabel("Sonner focus probe", { exact: true });
    await input.focus();
    await expect(input).toBeFocused();

    await page.evaluate(() => {
      (window as unknown as { __fireSonnerToast: () => void }).__fireSonnerToast();
    });

    await expect(page.locator(".sonner-toast").first()).toBeVisible();
    // Trivially true now, not a shim-guarded fix: the shell has no
    // open-sequence layout effect that focuses anything on its own (that
    // whole focus-steal-fix workaround lived in the old Sheet-backed
    // Toaster, deleted at the cutover along with the Sheet dependency that
    // caused it) — firing a toast never moves focus, full stop.
    await expect(input).toBeFocused();
  });
});

/**
 * fix 1 (action-click dismissal) and fix 7 (hotkey focus) both need a real
 * browser: fix 1's own unit coverage (sonner-drop-in-parity.test.tsx)
 * dispatches a synthetic .click() directly on the button, which proves the
 * onClick-then-dismiss ORDER but not a real pointer path; fix 7's hotkey
 * needs real document.activeElement/focus semantics across a real DOM
 * bubble, which happy-dom only approximates.
 */
test.describe("sonner compat: action button dismisses after onClick, a real click (fix 1)", () => {
  test("clicking the action button runs the consumer's onClick, then dismisses the toast", async ({
    page,
  }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show action toast");
    // dispatchEvent, not click(): a real click() moves the mouse across the
    // toaster to reach the button, which fires mouseenter on the <ol> and
    // expands the stack mid-click (real, desired behavior, covered
    // elsewhere) — a confound this test doesn't need, since it's exercising
    // a genuine browser MouseEvent through React's real event delegation,
    // which is the fidelity this e2e test exists to add over the unit
    // suite's happy-dom .click().
    await overlay.locator(".sonner-toast-action").dispatchEvent("click");

    const clicked = await page.evaluate(
      () => (window as unknown as { __sonnerActionClicked?: boolean }).__sonnerActionClicked,
    );
    expect(clicked).toBe(true);
    // The only toast on this Toaster — dismissing it closes the whole toaster.
    await expect(page.locator("[data-sonner-toaster]")).toHaveCount(0, { timeout: SPRING_TIMEOUT });
  });
});

test.describe("sonner compat: hotkey expands + focuses the region; Escape collapses it (fix 7)", () => {
  test("Alt+T expands the stack and moves focus into it; Escape while focus is inside collapses it back", async ({
    page,
  }) => {
    await page.goto("/");
    const overlay = await openToasterByTrigger(page, "Sonner: show many toasts");
    await expect(overlay.locator('.sonner-toast[data-expanded="true"]')).toHaveCount(0);

    await page.keyboard.press("Alt+KeyT");

    await expect(overlay.locator('.sonner-toast[data-expanded="true"]')).toHaveCount(3);
    const focusedIsToaster = await page.evaluate(
      () => document.activeElement?.getAttribute("data-sonner-toaster") === "",
    );
    expect(focusedIsToaster).toBe(true);

    await page.keyboard.press("Escape");
    await expect(overlay.locator('.sonner-toast[data-expanded="true"]')).toHaveCount(0);
  });
});
