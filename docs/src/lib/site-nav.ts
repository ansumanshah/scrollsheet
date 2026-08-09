/**
 * Shared top-nav config for the site header, used both by the custom-layout
 * pages (Base.astro's Header) and the Starlight docs header override, so the
 * two halves of the site can never drift into two different link sets.
 */
export interface NavItem {
  href: string;
  label: string;
  /** Path (or path prefix for `prefix: true`) this link is "current" for. */
  match?: string;
  /** Match any route under `match`, not just an exact page. Docs now spans many URLs. */
  prefix?: boolean;
}

export const nav: NavItem[] = [
  { href: "/#examples", label: "Examples" },
  { href: "/docs", label: "Docs", match: "/docs", prefix: true },
  { href: "/faq", label: "FAQ", match: "/faq" },
  { href: "/changelog", label: "Changelog", match: "/changelog" },
];

export function isCurrentNav(pathname: string, item: NavItem): boolean {
  if (item.match === undefined) return false;
  if (item.prefix) return pathname === item.match || pathname.startsWith(`${item.match}/`);
  return pathname === item.match || pathname === `${item.match}/`;
}
