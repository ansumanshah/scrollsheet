import { CORE_CSS } from "./core-css.generated";
import { createStyleInjector } from "./inject-styles";

export { CORE_CSS };

const { injectDocument, injectShadowRoot } = createStyleInjector(CORE_CSS, "data-scrollsheet");

/**
 * Inject the core stylesheet once, lazily, on first open. Sheets only ever
 * render after JS runs (a native <dialog> is display:none until opened), so
 * runtime injection cannot flash unstyled content. The authored, commented
 * stylesheet lives in ./core.css; scripts/gen-css.ts emits the minified
 * module imported above, so no CSS comment ever ships.
 */
export function injectStyles(nonce?: string): void {
  injectDocument(nonce);
}

/**
 * Injects scrollsheet's core stylesheet into a shadow root via
 * adoptedStyleSheets instead of the default document.head <style> tag —
 * call once per shadow root, before any Sheet.Content inside it opens.
 * Falls back silently to a <style> element appended to the shadow root
 * itself on engines without constructable stylesheets (Safari <16.4);
 * `injectStyles`'s own document.head path is unaffected either way.
 *
 * `nonce` only applies on that fallback path: it sets the injected
 * `<style>` element's `nonce` attribute so a CSP `style-src` policy with
 * `'nonce-...'` allows it. The `adoptedStyleSheets` path constructs a
 * `CSSStyleSheet` and adopts it directly — it is never parsed as an inline
 * style element, so CSP has no inline-style check to gate there and `nonce`
 * is accepted (for a stable signature across both paths) but unused.
 */
export function injectStylesInto(root: ShadowRoot, nonce?: string): void {
  injectShadowRoot(root, nonce);
}
