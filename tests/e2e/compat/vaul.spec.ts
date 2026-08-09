import { type Locator, type Page, expect, test } from "@playwright/test";
import { SPRING_TIMEOUT, openSheetByTrigger } from "../helpers";

/**
 * vaul parity — the VERIFY list from the vaul-compat audit
 * (.claude/audits/vaul-compat.md) plus the general vaul-parity claims in
 * src/drawer/index.tsx's own doc comments. Unit coverage
 * (tests/unit/compat/vaul-compat.test.tsx) already exercises the pure
 * resolve-/compose-prefixed helpers and the prop-mapping/warning logic in isolation;
 * this file proves the same claims hold through a REAL mounted `<dialog>`
 * and real gesture/DOM interaction, which the unit suite (React Testing
 * Library, no real drag physics) can't reach.
 *
 * closeThreshold conventions: scrollsheet's `isBelowCloseThreshold`
 * (src/internal/detents.ts) is `revealed < firstDetentHeight *
 * closeThreshold` — dismiss fires once what REMAINS drops below the
 * threshold fraction, so a HIGHER value is EASIER to dismiss. vaul's own
 * CLOSE_THRESHOLD counts the drag AWAY — a LOWER value is easier, and its
 * 0.25 default means a quarter-of-the-way drag dismisses.
 * `resolveCloseThreshold` converts (`1 - value`); a raw passthrough shipped
 * once and made a migrated Drawer.Root's default HARDER to dismiss than
 * scrollsheet's own 0.5 (empirically: native 0.5 crossed ~120px, raw 0.25
 * only past 200px). The test below locks the converted behavior with the
 * undamped-drag technique from detent-options.spec.ts — see that file's doc
 * comment for why release velocity, not frozen position, is what
 * resolveDrag judges.
 */
test.describe("closeThreshold converts vaul's 0.25 default (easier dismiss than scrollsheet's 0.5)", () => {
  // Known load-flake, not a regression signal: under a full 7-worker run the
  // inter-move wall clock stretches and the release-velocity projection can
  // land on the keep side of the bracket. 3/3 green isolated, every time
  // it's been checked. A slowed release (pausing past the stale-velocity
  // age so judgment is position-only) was tried and REVERTED: with velocity
  // zeroed the 0.45 leg doesn't dismiss at all — the bracket genuinely
  // needs release physics, so retries are the honest shield (a real
  // conversion regression fails deterministically through all of them).
  test.describe.configure({ retries: 2 });

  async function undampedDrag(page: Page, x: number, startY: number, endY: number) {
    await page.mouse.move(x, startY);
    await page.mouse.down();
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x, startY + ((endY - startY) * i) / steps);
    }
    await page.mouse.up();
  }

  async function dragByDetentFraction(page: Page, dialog: Locator, fraction: number) {
    const maxDetent = await dialog.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).getPropertyValue("--scrollsheet-max-detent")),
    );
    const title = dialog.getByRole("heading", { name: "Close threshold default", exact: true });
    const box = await title.boundingBox();
    if (!box) throw new Error("title bounding box unavailable");
    const startY = box.y + box.height / 2;
    await undampedDrag(page, box.x + box.width / 2, startY, startY + maxDetent * fraction);
  }

  // Brackets the converted default's own dismiss line. Measured by fraction
  // sweep on chromium: the crossing (velocity projection included) sits
  // between 0.3 and 0.4 of the sheet's height — vaul's quarter-height feel.
  // Under the pre-conversion bug (raw 0.25 passed through) the crossing sat
  // past 0.54, so the 0.45 leg fails if the inversion ever regresses; the
  // 0.15 leg fails if conversion overshoots toward dismiss-on-touch.
  test("a Drawer.Root with no snapPoints keeps vaul's quarter-height dismiss feel (easier than scrollsheet's own 0.5)", async ({
    page,
    browserName,
  }) => {
    // The bracket fractions are calibrated against Chromium's release
    // physics; WebKit's velocity projection flings even the low leg's small
    // drag past its dismiss line (same engine difference
    // detent-options.spec.ts's own closeThreshold test works around with an
    // extreme 0.99 fixture). The conversion math itself is engine-neutral
    // and unit-locked in vaul-compat.test.tsx.
    test.skip(browserName === "webkit", "bracket fractions calibrated for Chromium physics");
    await page.goto("/");

    const drawerDialog = await openSheetByTrigger(page, "Drawer close threshold default sheet");
    await dragByDetentFraction(page, drawerDialog, 0.15);
    await expect(drawerDialog).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });

    await dragByDetentFraction(page, drawerDialog, 0.45);
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(0, {
      timeout: SPRING_TIMEOUT,
    });
  });
});

test.describe("fadeFromIndex", () => {
  test("explicit 0: undimmed only at the very first snap point, already dimming by the second", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Drawer fadeFromIndex explicit sheet");
    const backdrop = dialog.locator(".scrollsheet-backdrop");

    // Opens at the first snap point (0.3) — fadeFromIndex=0 means THIS is
    // the only undimmed one.
    await expect(backdrop).toHaveCSS("opacity", "0");

    // Handle click cycles 0.3 -> 0.6 -> 1 -> back to 0.3 — already dimming
    // by 0.6, unlike DrawerFadeFromIndexOmittedSheet's own omitted-default
    // case (detent-options.spec.ts), which stays transparent through 0.6.
    await dialog.locator("[data-scrollsheet-handle]").click();
    await expect
      .poll(
        async () => backdrop.evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity)),
        { timeout: SPRING_TIMEOUT },
      )
      .toBeGreaterThan(0);
  });
});

test.describe("direction maps to the right axis", () => {
  const cases: Array<{ direction: "top" | "left" | "right"; trigger: string }> = [
    { direction: "top", trigger: "Drawer direction top sheet" },
    { direction: "left", trigger: "Drawer direction left sheet" },
    { direction: "right", trigger: "Drawer direction right sheet" },
  ];

  for (const { direction, trigger } of cases) {
    test(`direction="${direction}" sets data-scrollsheet-side/data-vaul-drawer-direction and docks the right edge`, async ({
      page,
    }) => {
      await page.goto("/");
      const dialog = await openSheetByTrigger(page, trigger);
      await expect(dialog).toHaveAttribute("data-scrollsheet-side", direction);

      const panel = dialog.locator(".scrollsheet-panel");
      await expect(panel).toHaveAttribute("data-vaul-drawer-direction", direction);

      const viewport = page.viewportSize();
      if (!viewport) throw new Error("viewport size unavailable");
      const box = await panel.boundingBox();
      if (!box) throw new Error("panel bounding box unavailable");

      if (direction === "top") {
        expect(box.y).toBeLessThan(5);
      } else if (direction === "left") {
        expect(box.x).toBeLessThan(5);
      } else {
        expect(box.x + box.width).toBeGreaterThan(viewport.width - 5);
      }
    });
  }
});

test.describe("NestedRoot", () => {
  test("a child Drawer opened from inside a parent's Content recedes the parent, and un-recedes once it closes", async ({
    page,
  }) => {
    await page.goto("/");
    const parent = await openSheetByTrigger(page, "Drawer nested root sheet");
    await expect(parent).not.toHaveAttribute("data-scrollsheet-behind");

    await parent.getByRole("button", { name: "Open nested drawer", exact: true }).click();
    const child = page
      .locator(".scrollsheet-dialog")
      .filter({ has: page.getByRole("heading", { name: "Nested drawer", exact: true }) });
    await expect(child).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });
    await expect(parent).toHaveAttribute("data-scrollsheet-behind", "");

    await child.getByRole("button", { name: "Close nested drawer", exact: true }).click();
    await expect(page.locator("dialog.scrollsheet-dialog")).toHaveCount(1, {
      timeout: SPRING_TIMEOUT,
    });
    await expect(parent).not.toHaveAttribute("data-scrollsheet-behind");
  });
});

test.describe("shouldScaleBackground: two drawers sharing one [data-vaul-drawer-wrapper]", () => {
  test("the bridged marker survives until the second drawer unmounts, then winds back", async ({
    page,
  }) => {
    // The claim is refcounted on Drawer.Root MOUNT/unmount (its bridge
    // effect's only dep is the static `shouldScaleBackground` prop, not
    // Content's open/closed state — Root itself always renders eagerly,
    // only Content is conditional) — DrawerSharedWrapperSheets' own doc
    // comment in app.tsx covers this; the fixture's mount-toggle buttons
    // are what actually exercise it, not Close (which leaves Root mounted
    // and the claim untouched).
    //
    // The bridge's own ownership check (src/drawer/index.tsx Root: "A
    // consumer's own scrollsheet target ... is always respected untouched")
    // also makes it bail out the instant document-wide
    // querySelector("[data-scrollsheet-background]") finds ANY existing
    // marked wrapper it doesn't already claim — and BackgroundEffectDemo's
    // own #page-background-wrapper carries that attribute permanently,
    // unconditionally, from first paint, on every page this shared fixture
    // app renders. That marker mounts (and this test's own Drawer.Roots
    // mount their effects) before a page.evaluate after goto could react to
    // it, so this patches the one query the bridge uses to look past that
    // specific, unrelated fixture's wrapper — scoped to this test only, not
    // a src change, it neutralizes a same-page fixture collision.
    await page.addInitScript(() => {
      const original = Document.prototype.querySelector;
      Document.prototype.querySelector = function (this: Document, selector: string) {
        if (selector === "[data-scrollsheet-background]") {
          const result = original.call(this, selector) as Element | null;
          if (result?.id === "page-background-wrapper") return null;
          return result;
        }
        return original.call(this, selector);
      } as typeof Document.prototype.querySelector;
    });
    await page.goto("/");
    const wrapper = page.locator("#drawer-shared-wrapper");
    // Both A and B mount eagerly on page load — the claim is already live
    // before either Trigger is ever clicked.
    await expect(wrapper).toHaveAttribute("data-scrollsheet-background", "");

    // A unmounts first — B still claims the shared wrapper, so nothing restores.
    await page
      .getByRole("button", { name: "Unmount shared wrapper drawer A", exact: true })
      .click();
    await expect(wrapper).toHaveAttribute("data-scrollsheet-background", "");

    // B unmounts last — the refcount hits zero and the marker is removed.
    await page
      .getByRole("button", { name: "Unmount shared wrapper drawer B", exact: true })
      .click();
    await expect(wrapper).not.toHaveAttribute("data-scrollsheet-background");
  });
});

test.describe("Content asChild", () => {
  test("a valid single element child gets props and ref merged onto the same DOM node — no double-wrapping", async ({
    page,
  }) => {
    await page.goto("/");
    const dialog = await openSheetByTrigger(page, "Drawer content asChild sheet");
    const merged = dialog.locator('[data-testid="drawer-aschild-panel"]');

    await expect(merged).toHaveCount(1);
    // The child's own class survives (child props win) alongside the slot's
    // own scrollsheet-panel class (concatenated, not replaced).
    await expect(merged).toHaveClass(/custom-panel/);
    await expect(merged).toHaveClass(/scrollsheet-panel/);
    await expect(merged).toHaveAttribute("role", "document");
    // Exactly one .scrollsheet-panel in the whole dialog — proves the slot
    // merged onto the child instead of ALSO rendering its own wrapper div.
    await expect(dialog.locator(".scrollsheet-panel")).toHaveCount(1);
  });

  test("a Fragment child degrades to the default panel <div> with a dev warning, no crash", async ({
    page,
  }) => {
    await page.goto("/");
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning" || msg.type() === "error") warnings.push(msg.text());
    });

    const dialog = await openSheetByTrigger(page, "Drawer content asChild fragment sheet");

    // No crash: the sheet opened and its content is reachable.
    await expect(
      dialog.getByRole("heading", { name: "asChild fragment", exact: true }),
    ).toBeVisible();
    // Default rendering: exactly one real .scrollsheet-panel div, asChild ignored.
    await expect(dialog.locator(".scrollsheet-panel")).toHaveCount(1);

    expect(
      warnings.some((text) =>
        text.includes("asChild expects children to be a single non-Fragment"),
      ),
    ).toBe(true);
  });
});
