// Shared by src/internal/styles.ts (core) and src/toast/toast-styles.ts
// (toast). Each caller gets its OWN injector instance — the WeakSet gates
// re-injection per (root, stylesheet) pair, not per root alone, so a shadow
// root that has already received core styles still receives toast styles
// (and vice versa) instead of being silently skipped by a shared set.

/**
 * Builds a pair of injectors — one for `document`, one for an arbitrary
 * shadow root — that share a dedupe WeakSet scoped to this one stylesheet.
 * `css` is the already-minified stylesheet text; `dataAttr` is the
 * `<style>` marker attribute used both to tag the injected element and to
 * detect a pre-existing one (double-bundle / micro-frontend guard).
 */
export function createStyleInjector(css: string, dataAttr: string) {
  const injectedRoots = new WeakSet<Document | ShadowRoot>();

  function injectInto(root: Document | ShadowRoot, nonce?: string): void {
    // Empty css: the no-styles build (css-stubs.ts) — nothing to inject,
    // the consumer imports the stylesheet file instead.
    if (!css) return;
    if (injectedRoots.has(root)) return;
    const existing =
      root === document
        ? document.querySelector(`style[${dataAttr}]`)
        : (root as ShadowRoot).querySelector(`style[${dataAttr}]`);
    // The Symbol.for marker also covers the mixed-strategy pairing: another
    // bundle copy may have ADOPTED this stylesheet (injectShadowRoot below),
    // which leaves no DOM trace for the querySelector to find.
    const marked = root as (Document | ShadowRoot) & { [key: symbol]: boolean | undefined };
    if (existing || marked[Symbol.for(dataAttr)]) {
      injectedRoots.add(root);
      return;
    }
    const style = document.createElement("style");
    style.setAttribute(dataAttr, "");
    if (nonce) style.nonce = nonce;
    style.textContent = css;
    (root === document ? document.head : root).appendChild(style);
    marked[Symbol.for(dataAttr)] = true;
    injectedRoots.add(root);
  }

  /** Inject into `document.head`, gated on `typeof document`. */
  function injectDocument(nonce?: string): void {
    if (typeof document === "undefined") return;
    injectInto(document, nonce);
  }

  /**
   * Inject into a shadow root via `adoptedStyleSheets` when the engine
   * supports constructable stylesheets, falling back to an in-shadow-root
   * `<style>` tag otherwise (Safari <16.4). `nonce` is accepted only for
   * that fallback: a CSP nonce authorizes an inline `<style>`/`<script>`
   * element, but a constructed `CSSStyleSheet` adopted via
   * `adoptedStyleSheets` is never parsed as inline markup, so CSP has
   * nothing to gate there and the nonce is silently unused on that path.
   */
  function injectShadowRoot(root: ShadowRoot, nonce?: string): void {
    if (!css) return;
    if (typeof CSSStyleSheet === "undefined" || !("adoptedStyleSheets" in root)) {
      injectInto(root, nonce);
      return;
    }
    if (injectedRoots.has(root)) return;
    // Cross-instance guard, the adopted-sheets counterpart of injectInto's
    // querySelector check: the WeakSet is per module instance, so a second
    // bundle copy (micro-frontend, failed dedup) would re-adopt the same
    // CSS. Symbol.for is keyed in the global registry — both copies resolve
    // the identical symbol, and the expando on the root is per stylesheet
    // because dataAttr differs per injector. The querySelector covers the
    // mixed pairing where the other copy fell back to a <style> tag.
    const marker = Symbol.for(dataAttr);
    const marked = root as ShadowRoot & { [key: symbol]: boolean | undefined };
    if (!marked[marker] && !root.querySelector(`style[${dataAttr}]`)) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    }
    marked[marker] = true;
    injectedRoots.add(root);
  }

  return { injectDocument, injectShadowRoot };
}
