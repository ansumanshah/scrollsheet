/**
 * Dev-only, module-wide `warnOnce` shared by the sonner and vaul compat
 * layers. Gating is the caller's job now — every call site is wrapped in
 * `if (process.env.NODE_ENV !== "production")`, a form the production build
 * pass folds and strips (call, message string, and all) — so this function
 * itself just dedups; it no longer re-checks the environment.
 */

const warned = new Set<string>();

/** Fires `console.warn` at most once per `key` for the lifetime of the module. */
export function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** Test-only: reset warnOnce's dedup state between test cases. */
export function _resetWarnOnceForTests(): void {
  warned.clear();
}
