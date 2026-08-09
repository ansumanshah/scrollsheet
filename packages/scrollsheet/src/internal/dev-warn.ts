/** Dev-only, module-wide `warnOnce` shared by the sonner and vaul compat layers. */

export const isDev = typeof process !== "undefined" && process.env.NODE_ENV !== "production";

const warned = new Set<string>();

/** Fires `console.warn` at most once per `key` for the lifetime of the module. */
export function warnOnce(key: string, message: string): void {
  if (!isDev || warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** Test-only: reset warnOnce's dedup state between test cases. */
export function _resetWarnOnceForTests(): void {
  warned.clear();
}
