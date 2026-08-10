/** Feature detection, computed once on the client. */

import { warnOnce } from "./dev-warn";

let cached: {
  scrollTimeline: boolean;
  scrollend: boolean;
  linearEasing: boolean;
} | null = null;

export function env() {
  if (cached) return cached;
  const hasCSS = typeof CSS !== "undefined" && typeof CSS.supports === "function";
  cached = {
    /** CSS scroll-driven animations (Chrome 115+, Safari 26+, Firefox flagged). */
    scrollTimeline: hasCSS && CSS.supports("animation-timeline: scroll()"),
    /** scrollend event — baseline since Safari 26.2. */
    scrollend: typeof window !== "undefined" && "onscrollend" in window,
    /**
     * `linear()` easing (Chrome 113+, Safari 17.2+, Firefox 112+). Safari
     * 15.4–17.1 has WAAPI but throws on a linear() easing string, so the
     * enter/exit legs need a real gate, not a try/catch alone.
     */
    linearEasing: hasCSS && CSS.supports("transition-timing-function", "linear(0, 1)"),
    /**
     * `interpolate-size: allow-keywords` / `calc-size()` (Chrome/Edge 129+,
     * unshipped in Firefox/Safari) — lets a `height`/`width` transition
     * interpolate to and from `auto` and other intrinsic-size keywords
     * instead of snapping. Not currently wired to anything: this library's
     * detent geometry never assigns `height: auto` to the panel (it's always
     * an explicit measured px, written to `--scrollsheet-max-detent`), and
     * the panel's own reveal animation is a scroll-position tween, not a box
     * height transition — see use-content-morph.ts's doc comment. Exposed
     * here anyway as a plain capability check, the same as the other fields.
     */
  };
  return cached;
}

/** Test-only: clear the cached feature-detection result between test cases. */
export function _resetEnvForTests(): void {
  cached = null;
}

/**
 * Whether the platform supports a real `<dialog>` (~96% global — missing on
 * Opera Mini, some old in-app WebViews, and iOS ≤15.3). Deliberately
 * uncached (unlike `env()` above): the check itself is a cheap `typeof` +
 * prototype probe, and tests need to flip the global between calls.
 */
export function hasDialogSupport(): boolean {
  return typeof HTMLDialogElement !== "undefined" && "showModal" in HTMLDialogElement.prototype;
}

/** Whether the Popover API (`popover="manual"`, `showPopover`/`hidePopover`) is available. */
export function hasPopoverSupport(): boolean {
  return typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;
}

/** Whether `dialog.closedBy` (Chrome/Edge 134+, Firefox 141+) is available. Uncached like the checks above — tests flip the global. */
export function hasClosedBySupport(): boolean {
  return typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;
}

/** Whether the CloseWatcher constructor (Chrome 126+, Firefox 149+, Safari preview) is available. */
export function hasCloseWatcherSupport(): boolean {
  return typeof window !== "undefined" && "CloseWatcher" in window;
}

let warnedNoDialogSupport = false;

/**
 * One-time dev-only heads-up that this open is taking the degraded path.
 * Content still renders — a plain fixed-position modal, see
 * internal/fallback-sheet.tsx — so this is informational, not a crash guard:
 * it tells a developer why the sheet they are looking at has no detents or
 * drag, which is otherwise indistinguishable from a misconfiguration.
 */
export function warnMissingDialogSupport(): void {
  // NODE_ENV first and bare: the build passes compile it to a literal, so
  // the production tree folds this whole body away (string included).
  if (process.env.NODE_ENV === "production" || warnedNoDialogSupport) return;
  warnedNoDialogSupport = true;
  console.warn(
    "scrollsheet: this browser has no <dialog> support — falling back to a plain modal (no detents, drag, or animation). Content and dismissal work as normal.",
  );
}

/** Test-only: reset the one-time warning flag between test cases. */
export function _resetDialogSupportWarningForTests(): void {
  warnedNoDialogSupport = false;
}

let warnedUndimmedDetentOutOfRange = false;

/**
 * One-time dev-only warning: `largestUndimmedDetent` resolved to a height
 * *above* every configured detent (measure() clamps dimStart to
 * maxDetent-1 regardless, so this is a misconfiguration heads-up, not a
 * crash guard). Resolving to exactly the tallest detent is deliberately not
 * warned about — that's a legitimate, common pattern ("fade only at the
 * topmost detent"), not a misconfiguration.
 */
export function warnLargestUndimmedDetentOutOfRange(): void {
  // NODE_ENV first and bare: the build passes compile it to a literal, so
  // the production tree folds this whole body away (string included).
  if (process.env.NODE_ENV === "production" || warnedUndimmedDetentOutOfRange) return;
  warnedUndimmedDetentOutOfRange = true;
  console.warn(
    "scrollsheet: largestUndimmedDetent resolved to a height above every configured detent — the backdrop and themeColorDimming will stay undimmed for nearly all of the sheet's travel. Choose a largestUndimmedDetent within the configured detents range.",
  );
}

/** Test-only: reset the one-time warning flag between test cases. */
export function _resetUndimmedDetentWarningForTests(): void {
  warnedUndimmedDetentOutOfRange = false;
}

let warnedUnresolvableSnapToDetent = false;

/**
 * One-time dev-only warning: `actionsRef.snapTo()` was called with a spec
 * that isn't in the sheet's configured `detents` list. Only the panel's
 * *rest position* goes through Content's own nearest-detent fallback — the
 * `activeDetent` state itself (and `onActiveDetentChange`, and Handle's
 * `aria-valuenow`/`aria-valuetext`) is set to the literal, unresolved spec
 * you passed in and is never normalized. Not a crash guard, just a heads-up
 * that the requested spec won't round-trip through the public detent state.
 */
export function warnUnresolvableSnapToDetent(): void {
  // NODE_ENV first and bare: the build passes compile it to a literal, so
  // the production tree folds this whole body away (string included).
  if (process.env.NODE_ENV === "production" || warnedUnresolvableSnapToDetent) return;
  warnedUnresolvableSnapToDetent = true;
  console.warn(
    "scrollsheet: actionsRef.snapTo() was called with a detent spec that isn't in this sheet's `detents` list — the panel will rest at the nearest configured detent, but `activeDetent`/`onActiveDetentChange` (and Handle's aria-valuenow/aria-valuetext) will still reflect the literal spec you passed in, not the resolved one.",
  );
}

/** Test-only: reset the one-time warning flag between test cases. */
export function _resetSnapToWarningForTests(): void {
  warnedUnresolvableSnapToDetent = false;
}

let warnedContentAsChildInvalidChild = false;

/**
 * One-time dev-only warning: `Sheet.Content asChild` requires `children` to
 * be a single non-Fragment React element — the same contract `Slot` enforces
 * for Trigger/Handle/Title/Description, plus an explicit Fragment exclusion
 * Content needs that they don't: `React.isValidElement` is true for a
 * `<>...</>` Fragment too (its `.type` is just the Fragment symbol), so a
 * consumer literally writing `<Sheet.Content asChild><>...</></Sheet.Content>`
 * would otherwise sail past that check. Content can't take Slot's own
 * fallback (render nothing) either way: the dialog still needs a real panel
 * node in the DOM regardless of what `asChild` was given, so it degrades to
 * the default panel `<div>` (`asChild` ignored for this render) instead of
 * dropping the sheet or, worse, handing `Slot` a Fragment to `cloneElement`
 * — which silently drops the composed ref and logs invalid DOM attribute
 * warnings for every prop `Slot` tried to merge onto it.
 */
export function warnContentAsChildInvalidChild(): void {
  // NODE_ENV first and bare: the build passes compile it to a literal, so
  // the production tree folds this whole body away (string included).
  if (process.env.NODE_ENV === "production" || warnedContentAsChildInvalidChild) return;
  warnedContentAsChildInvalidChild = true;
  console.warn(
    "scrollsheet: Sheet.Content asChild expects children to be a single non-Fragment React element — falling back to the default panel <div> (asChild ignored) instead.",
  );
}

/** Test-only: reset the one-time warning flag between test cases. */
export function _resetContentAsChildInvalidChildWarningForTests(): void {
  warnedContentAsChildInvalidChild = false;
}

/**
 * One-time dev-only warning: the core stylesheet never loaded. The caller
 * decides *when* to check (content.tsx reads a custom property core.css
 * always sets on `.scrollsheet-dialog`, after the sheet has opened and
 * painted) — this function only owns the message. Shares the module-wide
 * `warnOnce` gate (dev-warn.ts) rather than its own boolean flag like the
 * other warn functions above: `detents.ts` already pulls that module in,
 * so a second hand-rolled once-only guard here would be a pure size cost
 * with nothing bought for it. Not a crash guard: the sheet still renders as
 * a native unstyled `<dialog>`, just with none of the positioning, detents
 * visuals, or animation core.css provides. Reset between tests via
 * dev-warn.ts's own `_resetWarnOnceForTests`.
 */
export function warnCoreStylesMissing(): void {
  if (process.env.NODE_ENV !== "production")
    warnOnce("css", "scrollsheet: import 'scrollsheet/styles.css'");
}

/** Live media check, not cached: the OS setting can change mid-session. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
