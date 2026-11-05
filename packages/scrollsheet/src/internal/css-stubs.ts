// Build-time substitution target for the no-styles entry: Bun aliases both
// generated css modules and the injector here, so neither the strings nor the
// injection code enter that bundle. Consumers of that entry import
// scrollsheet/styles.css (and scrollsheet/toast.css) instead.
export const CORE_CSS = "";
export const TOAST_CSS = "";

export function createStyleInjector() {
  const noop = () => {};
  return { injectDocument: noop, injectShadowRoot: noop };
}
