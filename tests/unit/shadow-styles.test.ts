import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createStyleInjector } from "../../packages/scrollsheet/src/internal/inject-styles";
import { injectStyles, injectStylesInto } from "../../packages/scrollsheet/src/internal/styles";
import {
  injectToastStyles,
  injectToastStylesInto,
} from "../../packages/scrollsheet/src/toast/toast-styles";

/**
 * Scoped happy-dom registration (see motion/animate.test.ts) — attachShadow
 * and adoptedStyleSheets need a real DOM, which bun:test has no default for.
 * happy-dom 20.11.1 (pinned in package.json) supports both.
 */
beforeAll(async () => {
  await GlobalRegistrator.register();
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

function makeShadowRoot(): ShadowRoot {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host.attachShadow({ mode: "open" });
}

describe("injectStylesInto", () => {
  test("adopts a constructable stylesheet containing the core CSS", () => {
    const root = makeShadowRoot();
    expect(root.adoptedStyleSheets.length).toBe(0);
    injectStylesInto(root);
    expect(root.adoptedStyleSheets.length).toBe(1);
    expect(root.adoptedStyleSheets[0]?.cssRules.length).toBeGreaterThan(0);
  });

  test("calling twice on the same root does not duplicate the adopted sheet", () => {
    const root = makeShadowRoot();
    injectStylesInto(root);
    injectStylesInto(root);
    expect(root.adoptedStyleSheets.length).toBe(1);
  });

  test("is independent of the document-level injectStyles dedupe", () => {
    const root = makeShadowRoot();
    injectStyles();
    injectStylesInto(root);
    expect(document.querySelectorAll("style[data-scrollsheet]").length).toBe(1);
    expect(root.adoptedStyleSheets.length).toBe(1);
    // A second document-level call must still be a no-op, unaffected by the
    // shadow-root call above.
    injectStyles();
    expect(document.querySelectorAll("style[data-scrollsheet]").length).toBe(1);
  });

  test("two independent shadow roots each get their own adopted sheet", () => {
    const rootA = makeShadowRoot();
    const rootB = makeShadowRoot();
    injectStylesInto(rootA);
    injectStylesInto(rootB);
    expect(rootA.adoptedStyleSheets.length).toBe(1);
    expect(rootB.adoptedStyleSheets.length).toBe(1);
  });

  test("falls back to an in-shadow-root <style> tag when adoptedStyleSheets is unsupported", () => {
    const root = makeShadowRoot();
    const original = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "adoptedStyleSheets");
    // Simulate an engine without constructable stylesheets (Safari <16.4):
    // delete the accessor so `"adoptedStyleSheets" in root` is false.
    // biome-ignore lint: deliberate feature removal for this test
    delete (ShadowRoot.prototype as unknown as Record<string, unknown>).adoptedStyleSheets;
    try {
      injectStylesInto(root);
      expect(root.querySelector("style[data-scrollsheet]")).not.toBeNull();
    } finally {
      if (original) Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", original);
    }
  });

  test("nonce lands on the fallback <style> element, not on the adopted-sheet path", () => {
    const root = makeShadowRoot();
    const original = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "adoptedStyleSheets");
    // biome-ignore lint: deliberate feature removal for this test
    delete (ShadowRoot.prototype as unknown as Record<string, unknown>).adoptedStyleSheets;
    try {
      injectStylesInto(root, "test-nonce");
      // nonce is intentionally not attribute-reflected (CSP nonce hiding,
      // https://html.spec.whatwg.org/#cspnonce) — assert the IDL property.
      const style = root.querySelector("style[data-scrollsheet]") as HTMLStyleElement | null;
      expect(style?.nonce).toBe("test-nonce");
    } finally {
      if (original) Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", original);
    }
  });
});

describe("injectToastStylesInto", () => {
  test("adopts a constructable stylesheet into the shadow root, not document.head", () => {
    const root = makeShadowRoot();
    expect(root.adoptedStyleSheets.length).toBe(0);
    injectToastStylesInto(root);
    expect(root.adoptedStyleSheets.length).toBe(1);
    expect(root.adoptedStyleSheets[0]?.cssRules.length).toBeGreaterThan(0);
    expect(document.querySelectorAll("style[data-sonner-toast-styles]").length).toBe(0);
  });

  test("is independent of the document-level injectToastStyles dedupe", () => {
    const root = makeShadowRoot();
    injectToastStyles();
    injectToastStylesInto(root);
    expect(document.querySelectorAll("style[data-sonner-toast-styles]").length).toBe(1);
    expect(root.adoptedStyleSheets.length).toBe(1);
    // A second document-level call must still be a no-op, unaffected by the
    // shadow-root call above.
    injectToastStyles();
    expect(document.querySelectorAll("style[data-sonner-toast-styles]").length).toBe(1);
  });

  test("core and toast injectors are independent: injecting core into a root does not skip toast", () => {
    const root = makeShadowRoot();
    injectStylesInto(root);
    injectToastStylesInto(root);
    expect(root.adoptedStyleSheets.length).toBe(2);
  });
});

describe("createStyleInjector document-path dedupe (shared mechanism)", () => {
  // A fresh injector per test — its own WeakSet and a unique data attribute —
  // so this exercises the querySelector-based "existing tag" branch in
  // isolation, independent of the module-singleton injectStyles/
  // injectToastStyles instances (which, once a test has injected into the
  // real `document`, stay gated by their WeakSet for the rest of the file).
  // This is the exact code both styles.ts's injectStyles and toast-styles.ts's
  // injectToastStyles now delegate to.

  test("a pre-existing style[data-attr] tag short-circuits injection instead of duplicating it", () => {
    const { injectDocument } = createStyleInjector("body{color:red}", "data-test-dedupe-a");
    const preexisting = document.createElement("style");
    preexisting.setAttribute("data-test-dedupe-a", "");
    document.head.appendChild(preexisting);

    injectDocument();
    expect(document.querySelectorAll("style[data-test-dedupe-a]").length).toBe(1);

    injectDocument();
    expect(document.querySelectorAll("style[data-test-dedupe-a]").length).toBe(1);

    preexisting.remove();
  });

  test("with no pre-existing tag, injects exactly one style element and dedupes further calls", () => {
    const { injectDocument } = createStyleInjector("body{color:blue}", "data-test-dedupe-b");

    injectDocument();
    const injected = document.querySelectorAll("style[data-test-dedupe-b]");
    expect(injected.length).toBe(1);
    expect(injected[0]?.textContent).toBe("body{color:blue}");

    injectDocument();
    expect(document.querySelectorAll("style[data-test-dedupe-b]").length).toBe(1);

    injected[0]?.remove();
  });
});

describe("createStyleInjector — cross-instance (double-bundle) shadow dedup", () => {
  test("two separate injector instances never re-adopt the same stylesheet into one root", () => {
    const root = makeShadowRoot();
    const bundleA = createStyleInjector(".x{color:red}", "data-test-double-bundle");
    const bundleB = createStyleInjector(".x{color:red}", "data-test-double-bundle");
    bundleA.injectShadowRoot(root);
    bundleB.injectShadowRoot(root);
    expect(root.adoptedStyleSheets.length).toBe(1);
  });

  test("distinct stylesheets (different dataAttr) still both adopt — dedup stays per stylesheet", () => {
    const root = makeShadowRoot();
    const core = createStyleInjector(".x{color:red}", "data-test-sheet-a");
    const toastSheet = createStyleInjector(".y{color:blue}", "data-test-sheet-b");
    core.injectShadowRoot(root);
    toastSheet.injectShadowRoot(root);
    expect(root.adoptedStyleSheets.length).toBe(2);
  });
});

describe("createStyleInjector — mixed-strategy pairing (one copy adopts, the other falls back)", () => {
  function withoutAdoptedStyleSheets(fn: () => void) {
    const original = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "adoptedStyleSheets");
    // biome-ignore lint: deliberate feature removal for this test
    delete (ShadowRoot.prototype as unknown as Record<string, unknown>).adoptedStyleSheets;
    try {
      fn();
    } finally {
      if (original) Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", original);
    }
  }

  test("fallback <style> first, adoption second: the second copy adopts nothing", () => {
    const root = makeShadowRoot();
    const oldBundle = createStyleInjector(".x{color:red}", "data-test-mixed-a");
    const newBundle = createStyleInjector(".x{color:red}", "data-test-mixed-a");
    withoutAdoptedStyleSheets(() => oldBundle.injectShadowRoot(root));
    expect(root.querySelectorAll("style[data-test-mixed-a]").length).toBe(1);
    newBundle.injectShadowRoot(root);
    expect(root.adoptedStyleSheets.length).toBe(0);
    expect(root.querySelectorAll("style[data-test-mixed-a]").length).toBe(1);
  });

  test("adoption first, fallback second: the second copy appends no <style> tag", () => {
    const root = makeShadowRoot();
    const newBundle = createStyleInjector(".x{color:red}", "data-test-mixed-b");
    const oldBundle = createStyleInjector(".x{color:red}", "data-test-mixed-b");
    newBundle.injectShadowRoot(root);
    expect(root.adoptedStyleSheets.length).toBe(1);
    withoutAdoptedStyleSheets(() => oldBundle.injectShadowRoot(root));
    expect(root.querySelectorAll("style[data-test-mixed-b]").length).toBe(0);
    expect(root.adoptedStyleSheets.length).toBe(1);
  });
});

describe("createStyleInjector — empty css (the no-styles build's stubs)", () => {
  test("document and shadow-root injection are both no-ops", () => {
    const empty = createStyleInjector("", "data-test-empty-css");
    const root = makeShadowRoot();
    empty.injectDocument();
    empty.injectShadowRoot(root);
    expect(document.querySelectorAll("style[data-test-empty-css]").length).toBe(0);
    expect(root.adoptedStyleSheets.length).toBe(0);
    expect(root.querySelectorAll("style").length).toBe(0);
  });
});
