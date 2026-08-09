// Build-time substitution target for the no-styles entry: tsdown aliases
// both generated css modules here, so neither string enters that bundle and
// the injectors (guarded on empty css) become no-ops. Consumers of that
// entry import scrollsheet/styles.css (and scrollsheet/toast.css) instead.
export const CORE_CSS = "";
export const TOAST_CSS = "";
