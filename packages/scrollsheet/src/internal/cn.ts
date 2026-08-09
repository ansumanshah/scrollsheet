/** Truthy classname join. Lives in internal/, not the toast layer, so core
 * components can share it without pulling the toast chunk into their graph. */
export function cn(...classes: Array<string | undefined | false>): string | undefined {
  const joined = classes.filter(Boolean).join(" ");
  return joined.length > 0 ? joined : undefined;
}
