import { expect, test } from "@playwright/test";
import { SPRING_TIMEOUT } from "../helpers";

/**
 * Shadow DOM injection (src/internal/inject-styles.ts's shared injector,
 * consumed by src/internal/styles.ts's injectStylesInto and
 * src/toast/toast-styles.ts's injectToastStylesInto). Served from its own
 * fixture route, tests/e2e/fixtures/shadow-dom.{html,tsx} — a real
 * `attachShadow({mode:'open'})` host with its own React root inside it, not
 * a simulated shadow boundary — see that file's doc comment for the layout.
 *
 * Both the Sheet.Content dialog and the Toaster's own dialog ALWAYS portal
 * to document.body (content.tsx's createPortal target is unconditional —
 * verified by reading content.tsx, never gated on the trigger's root), and
 * their visual styling comes from the library's own automatic
 * document.head injection (content.tsx's injectStyles(ctx.nonce) /
 * toaster.tsx's injectToastStyles(nonce), both called unconditionally on
 * open) — that would render correctly even if the fixture never called
 * injectStylesInto/injectToastStylesInto at all. What's actually under test
 * here is the shadow-scoped API itself: that a stylesheet lands INSIDE the
 * shadow root (via adoptedStyleSheets, or the fallback <style> element) and
 * never leaks a duplicate into document.head as a side effect of calling it.
 */

test.describe("shadow DOM style injection", () => {
  test("Sheet.Root/Trigger inside a shadow root: the portaled panel still renders styled", async ({
    page,
  }) => {
    await page.goto("/shadow-dom");

    // Playwright's default CSS engine pierces open shadow roots, so a plain
    // role/text query finds the trigger without any special shadow syntax.
    await page.getByRole("button", { name: "Open shadow sheet", exact: true }).click();

    const dialog = page.locator("dialog.scrollsheet-dialog");
    await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
      timeout: SPRING_TIMEOUT,
    });

    // The dialog is a portal target under document.body — outside the
    // shadow root entirely — confirmed directly rather than assumed.
    const portalsToBody = await dialog.evaluate((el) => el.parentElement === document.body);
    expect(portalsToBody).toBe(true);
    const insideShadow = await dialog.evaluate((el) => el.getRootNode() instanceof ShadowRoot);
    expect(insideShadow).toBe(false);

    const panel = dialog.locator(".scrollsheet-panel");
    const box = await panel.boundingBox();
    expect(box, "panel must have a real, laid-out bounding box").not.toBeNull();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);

    // core.css's :where(.scrollsheet-panel) default look — background,
    // border-radius, box-shadow (see core.css's "Default look" block).
    // These prove core.css actually parsed and won the cascade for a panel
    // that lives outside the shadow root, i.e. document.head's own
    // auto-injected copy, not the shadow-scoped one.
    const style = await panel.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        position: computed.position,
        overflow: computed.overflow,
        borderTopLeftRadius: computed.borderTopLeftRadius,
        backgroundColor: computed.backgroundColor,
      };
    });
    expect(style.position).toBe("absolute");
    expect(style.overflow).toContain("hidden");
    expect(style.borderTopLeftRadius).not.toBe("0px");
    expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");

    // The shadow root itself received its own copy of core.css via
    // injectStylesInto(shadowRoot) — adoptedStyleSheets on engines that
    // support constructable stylesheets (the un-forced-fallback path,
    // Chromium/WebKit >=16.4 here) — confirming the shadow-scoped call
    // actually did something, not just that document.head's own automatic
    // injection carried the whole test.
    const shadowInjection = await page.evaluate(() => {
      const host = document.getElementById("shadow-host");
      const root = host?.shadowRoot;
      if (!root) return null;
      return {
        adoptedCount: root.adoptedStyleSheets.length,
        fallbackStyleTags: root.querySelectorAll("style[data-scrollsheet]").length,
      };
    });
    expect(shadowInjection).not.toBeNull();
    expect(shadowInjection?.adoptedCount).toBeGreaterThanOrEqual(1);
    // adoptedStyleSheets is live on this engine, so the injector never fell
    // back to appending a literal <style> into the shadow root.
    expect(shadowInjection?.fallbackStyleTags).toBe(0);

    // And that shadow-scoped copy never leaked a *second* document.head
    // <style data-scrollsheet> beyond the one auto-injection already put
    // there on open.
    const documentStyleTagCount = await page.evaluate(
      () => document.head.querySelectorAll("style[data-scrollsheet]").length,
    );
    expect(documentStyleTagCount).toBe(1);
  });

  test("a Toaster inside the same shadow root: firing a toast renders it visually styled", async ({
    page,
  }) => {
    await page.goto("/shadow-dom");

    await page.getByRole("button", { name: "Fire shadow toast", exact: true }).click();

    const toaster = page.locator("[data-sonner-toaster]");
    const row = toaster.locator(".sonner-toast");
    // Not toaster.toBeVisible(): every row is position:absolute (shell/
    // toaster-shell.tsx's own doc comment on why), so the <ol> itself
    // contributes zero height and never passes a box-size visibility check
    // — wait on the row instead, same as helpers.ts's openToasterByTrigger.
    await expect(row).toBeVisible({ timeout: SPRING_TIMEOUT });
    await expect(row.locator(".sonner-toast-title")).toHaveText("Shadow toast");

    // toast.css's card look — border-radius, padding, shadow — confirming
    // the toast stylesheet parsed for a Toaster whose trigger lives inside
    // a shadow root, same "portals to body, styled by document-level
    // auto-injection" story as the sheet panel above.
    const style = await row.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        borderRadius: computed.borderRadius,
        padding: computed.paddingTop,
        boxShadow: computed.boxShadow,
      };
    });
    expect(style.borderRadius).not.toBe("0px");
    expect(style.padding).not.toBe("0px");
    expect(style.boxShadow).not.toBe("none");

    // The shadow root got its own copy of toast.css too, via
    // injectToastStylesInto(shadowRoot) — a *separate* dedupe WeakSet from
    // core's own (see createStyleInjector's doc comment: one injector
    // instance per stylesheet), so this must land independently of the
    // core-stylesheet assertion in the previous test.
    const shadowToastInjection = await page.evaluate(() => {
      const host = document.getElementById("shadow-host");
      const root = host?.shadowRoot;
      if (!root) return null;
      return {
        adoptedCount: root.adoptedStyleSheets.length,
        fallbackStyleTags: root.querySelectorAll("style[data-sonner-toast-styles]").length,
      };
    });
    expect(shadowToastInjection).not.toBeNull();
    // Both core.css and toast.css should be adopted into the shadow root by
    // now (this test still opens no sheet, but the Toaster component itself
    // renders a SheetContent once a toast exists, and injectStylesInto was
    // already called unconditionally on mount) — at least the toast
    // stylesheet's own entry must be present.
    expect(shadowToastInjection?.adoptedCount).toBeGreaterThanOrEqual(1);
    expect(shadowToastInjection?.fallbackStyleTags).toBe(0);
  });

  test.describe("adoptedStyleSheets unavailable: falls back to an in-shadow-root <style>", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        // Same technique as no-dialog-fallback.spec.ts: delete from the
        // prototype (not stub the constructor away), so `"adoptedStyleSheets"
        // in root` — inject-styles.ts's own feature check — reads false for
        // every shadow root this page creates, exactly the shape of an
        // engine with ShadowRoot but not constructable stylesheets
        // (Safari <16.4).
        // biome-ignore lint: deliberate feature removal for this suite
        delete (ShadowRoot.prototype as unknown as Record<string, unknown>).adoptedStyleSheets;
      });
    });

    test("core.css and toast.css both land as <style> children of the shadow root, and rendering still holds", async ({
      page,
    }) => {
      await page.goto("/shadow-dom");
      expect(
        await page.evaluate(() => {
          const host = document.createElement("div");
          document.body.appendChild(host);
          const probe = host.attachShadow({ mode: "open" });
          const result = "adoptedStyleSheets" in probe;
          host.remove();
          return result;
        }),
        "adoptedStyleSheets must be unreachable on a shadow root for this suite to be meaningful",
      ).toBe(false);

      await page.getByRole("button", { name: "Open shadow sheet", exact: true }).click();
      const dialog = page.locator("dialog.scrollsheet-dialog");
      await expect(dialog).toHaveAttribute("data-scrollsheet-state", "open", {
        timeout: SPRING_TIMEOUT,
      });

      // Rendering still holds: same bounding-box and computed-style checks
      // as the non-forced test above, on the fallback path.
      const panel = dialog.locator(".scrollsheet-panel");
      const box = await panel.boundingBox();
      expect(box?.width).toBeGreaterThan(0);
      expect(box?.height).toBeGreaterThan(0);
      const borderRadius = await panel.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
      expect(borderRadius).not.toBe("0px");

      // Modal (the default): the rest of the page — including the "Fire
      // shadow toast" button back in the shadow root — is native-inert
      // while this dialog is open. Close it first via Escape, same as
      // every other modal-sheet spec in this suite.
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0, { timeout: SPRING_TIMEOUT });

      await page.getByRole("button", { name: "Fire shadow toast", exact: true }).click();
      const toastRow = page.locator("[data-sonner-toaster] .sonner-toast");
      await expect(toastRow).toBeVisible({ timeout: SPRING_TIMEOUT });
      const toastBorderRadius = await toastRow.evaluate((el) => getComputedStyle(el).borderRadius);
      expect(toastBorderRadius).not.toBe("0px");

      // The actual fallback assertion: a real <style> element, tagged with
      // each injector's own marker attribute, appended directly inside the
      // shadow root — not document.head.
      const placement = await page.evaluate(() => {
        const host = document.getElementById("shadow-host");
        const root = host?.shadowRoot;
        if (!root) return null;
        return {
          // Direct children of the shadow root — nothing else in this
          // fixture can produce a <style data-scrollsheet>/<style
          // data-sonner-toast-styles>, so an un-scoped query is unambiguous
          // (":scope > ..." resolves against the wrong root when the query
          // starts from a ShadowRoot rather than an Element in this engine).
          coreStyleInShadow: root.querySelectorAll("style[data-scrollsheet]").length,
          toastStyleInShadow: root.querySelectorAll("style[data-sonner-toast-styles]").length,
          coreStyleInDocumentHead: document.head.querySelectorAll(
            "style[data-scrollsheet]:not([data-sonner-toast-styles])",
          ).length,
        };
      });
      expect(placement).not.toBeNull();
      expect(placement?.coreStyleInShadow).toBeGreaterThanOrEqual(1);
      expect(placement?.toastStyleInShadow).toBeGreaterThanOrEqual(1);
      // document.head still gets its OWN copy from the unconditional
      // auto-injection on open — that's separate from, and unaffected by,
      // the shadow root's fallback path.
      expect(placement?.coreStyleInDocumentHead).toBeGreaterThanOrEqual(1);
    });
  });
});
