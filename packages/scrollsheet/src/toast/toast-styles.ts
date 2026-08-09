import { createStyleInjector } from "../internal/inject-styles";
import { TOAST_CSS } from "./toast-css.generated";

export { TOAST_CSS };

const { injectDocument, injectShadowRoot } = createStyleInjector(
  TOAST_CSS,
  "data-sonner-toast-styles",
);

/**
 * Inject the toast stylesheet once, lazily, on first Toaster render — mirrors
 * src/internal/styles.ts's injectStyles. A separate `<style>` tag (not
 * appended to core's), so a consumer who never renders a <Toaster> never
 * pays for or sees this CSS at all.
 */
export function injectToastStyles(nonce?: string): void {
  injectDocument(nonce);
}

/**
 * Injects the toast stylesheet into a shadow root via adoptedStyleSheets
 * instead of document.head — mirrors src/internal/styles.ts's
 * injectStylesInto. Call once per shadow root that hosts a <Toaster>,
 * before it first renders. A sibling export rather than folding into
 * injectStylesInto: the toast layer is its own chunk (dist/toast.mjs) that
 * never loads for a core-only consumer, so its shadow-root injector has to
 * be reachable without pulling core's own chunk (and vice versa) — one
 * shared call would break that tree-shaking boundary.
 *
 * Falls back silently to a <style> element appended to the shadow root
 * itself on engines without constructable stylesheets (Safari <16.4).
 * `nonce` only applies on that fallback path: it sets the injected
 * `<style>` element's `nonce` attribute so a CSP `style-src` policy with
 * `'nonce-...'` allows it. The `adoptedStyleSheets` path constructs a
 * `CSSStyleSheet` and adopts it directly — it is never parsed as an inline
 * style element, so CSP has no inline-style check to gate there and `nonce`
 * is accepted (for a stable signature across both paths) but unused.
 */
export function injectToastStylesInto(root: ShadowRoot, nonce?: string): void {
  injectShadowRoot(root, nonce);
}
