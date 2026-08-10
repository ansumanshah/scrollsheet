import {
  type Side,
  type SideGeometry,
  geometryFor,
  mapScroll,
  recedeTransform,
} from "../motion/geometry";

export type Phase = "pre" | "opening" | "open" | "closing";

/**
 * Modal/non-modal `<dialog>`, or non-modal `<div popover>` — typed as plain
 * `HTMLElement` since TS's addEventListener overloads don't narrow across a
 * union of specific tag interfaces; call sites duck-type via `"prop" in el`.
 */
export type Overlay = HTMLElement;

export const SETTLE_FALLBACK_MS = 120;
export const TRAVEL_MS = 380;
export const FOCUS_SCROLL_DEBOUNCE_MS = 250;
export const NO_DRAG_SELECTOR =
  "button, a, input, textarea, select, label, [contenteditable], [data-scrollsheet-no-drag]";
export const DRAG_VELOCITY_WINDOW_MS = 100;
/** Center presentation enter/exit: scale spans [1 - range, 1] over the leg. */
export const CENTER_ZOOM_RANGE = 0.05;
export const DRAG_PROJECTION_MS = 160;
export const DRAG_CLICK_SUPPRESS_PX = 4;
const RECEDE_SCALE_DELTA = 0.06; // 1 -> 0.94
const RECEDE_DIM_MAX = 0.14;
const BACKGROUND_SCALE_DELTA = 0.06;
const BACKGROUND_RADIUS_MAX_PX = 12;
const BACKGROUND_PARALLAX_PX = 24;
export const FULL_HEIGHT_RADIUS_FLATTEN_PX = 48;
export const DEFAULT_RADIUS_PX = 16;
// Safari's toolbar collapse/expand is a ~40-60px visualViewport height
// change with no software keyboard involved — below this, treat a resize as
// chrome chrome, not a keyboard toggle (base-ui's KEYBOARD_RESIZE_THRESHOLD=60).
export const KEYBOARD_RESIZE_THRESHOLD_PX = 100;
// Cap on the pre-focus layout/visual viewport gap treated as browser toolbar
// (see use-keyboard-viewport's sampleBaseline) — real toolbars are <= ~60px.
export const KEYBOARD_BASELINE_MAX_PX = 80;
// zag's MAX_RELEASE_VELOCITY_AGE_MS: a release sample older than this (the
// finger paused before lifting) carries no meaningful fling intent.
export const MAX_RELEASE_VELOCITY_AGE_MS = 80;
// zag's adjustReleaseVelocityAgainstDisplacement threshold: below this net
// displacement, a sign disagreement between the last-window velocity and
// the overall drag direction is just noise, not a real direction change.
export const MIN_DISPLACEMENT_FOR_VELOCITY_PX = 24;

/** Input types that don't summon a software keyboard on focus. */
const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "range",
  "color",
  "file",
  "image",
  "button",
  "submit",
  "reset",
  "hidden",
]);

/**
 * Whether focusing `target` would summon a software keyboard — narrower than
 * a blanket input/textarea/contenteditable match: a `type="range"`/checkbox/
 * etc. input never does, so scheduling keyboard-avoidance for one is
 * pointless and can interrupt an active slider drag.
 */
/** Clamp the track's raw scroll into [0, maxDetent] and map it to revealed px. */
export function readRevealed(
  track: HTMLElement,
  geometry: SideGeometry,
  maxDetent: number,
): number {
  const rawClamped = Math.min(Math.max(track[geometry.scrollProp], 0), maxDetent);
  return mapScroll(rawClamped, maxDetent, geometry.sign);
}

/** Write a boolean attribute only when it actually changes (skip no-op style invalidations). */
export function setBoolAttr(el: Element, attr: string, value: boolean): void {
  if (el.hasAttribute(attr) !== value) el.toggleAttribute(attr, value);
}

/** Clamp to the 0..1 progress range every travel consumer expects. */
export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function willOpenKeyboard(target: Element): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type);
  return false;
}

/**
 * Maps the resolved `escapeDismissible` prop onto the modal dialog's
 * `closedby` value. `"any"` (native click-outside light-dismiss) is
 * deliberately never emitted, `backdropDismissible` included:
 * `.scrollsheet-dialog` is `position: fixed; inset: 0` (core.css) and
 * always covers the full viewport, so there is no "outside the dialog"
 * region for the platform to detect — "any" would add no real capability
 * while asking every engine to agree on hit-testing an element mid-
 * transform/scale during the enter/exit legs. Backdrop taps are handled
 * entirely by the track's own onClick (content.tsx) regardless of this
 * value.
 */
export function resolveClosedBy(escapeDismissible: boolean): "closerequest" | "none" {
  return escapeDismissible ? "closerequest" : "none";
}

export interface VirtualKeyboardApi {
  overlaysContent: boolean;
  boundingRect: { x: number; y: number; height: number; width: number };
  // In overlay mode the keyboard never resizes visualViewport, so this is
  // the only event that reports it opening or closing.
  addEventListener: (type: "geometrychange", listener: () => void) => void;
  removeEventListener: (type: "geometrychange", listener: () => void) => void;
}

/**
 * The VirtualKeyboard API (Chrome/Android — secure contexts only), read-only:
 * this library never sets `overlaysContent` itself (that's a global,
 * page-wide opt-in with side effects on the rest of the app's layout — a
 * consumer's call to make, not this library's), only uses it if the
 * platform or the consumer's own code has already turned it on.
 */
export function getVirtualKeyboardApi(): VirtualKeyboardApi | null {
  if (typeof navigator === "undefined" || typeof location === "undefined") return null;
  if (location.protocol !== "https:" && location.hostname !== "localhost") return null;
  return "virtualKeyboard" in navigator ? (navigator.virtualKeyboard as VirtualKeyboardApi) : null;
}

/**
 * Jump the track to `raw` (in whichever scroll axis `axis` names) without
 * animating.
 *
 * WebKit 26.5 quirk: on a `scroll-snap-type: mandatory` container with an
 * established snap position, a raw `el.scrollTop = x` assignment applies for
 * one frame then silently reverts to the previous snap point within ~50ms —
 * even when `x` lands exactly on another valid stop. `el.scrollTo({ top,
 * behavior: 'instant' })` does not exhibit this; WebKit treats it as a real
 * scroll command. Chromium and Firefox accept both forms identically, so
 * this is safe unconditionally.
 */
export function jumpScroll(el: HTMLElement, axis: "x" | "y", raw: number): void {
  const opts: ScrollToOptions = { behavior: "instant" };
  if (axis === "y") opts.top = raw;
  else opts.left = raw;
  el.scrollTo(opts);
}

/** Which direction each side's panel leaves the screen in, in translate sign terms. */
/** Extra travel past the panel's own 100% on exit, clearing its shadow. */
export const OFFSCREEN_EXTRA_PX = 32;

/**
 * The axis the enter/exit travel uses. Only a DETACHED bottom sheet presents
 * as an inline-end-docked drawer on desktop (core.css's dock rule) — an
 * attached one (the documented `--scrollsheet-desktop-margin: 0` opt-out)
 * still meets the bottom edge, so its travel stays on the bottom axis like
 * everywhere else. `detached` must be the same signal core.css keys its
 * dock-transform mirror on (`data-scrollsheet-detached`, set by measure()
 * before this is ever read) or the two disagree about which axis the panel
 * is actually docked to. The dock itself rides margin-inline, so the resting
 * edge follows the panel's *computed* direction — the exit side must read
 * that same signal (not the dir attribute: a CSS-only `direction: rtl`
 * flips margin-inline too), which measure() mirrors as data-scrollsheet-rtl
 * for the CSS resting rules. Detents, drag, and dismissal stay on the
 * sheet's own axis; only the enter/exit transform flips.
 */
export function transformSide(side: Side, detached: boolean, panel?: Element | null): Side {
  if (
    side !== "bottom" ||
    !detached ||
    typeof matchMedia !== "function" ||
    !matchMedia("(min-width: 768px)").matches
  ) {
    return side;
  }
  const rtl =
    panel != null &&
    typeof getComputedStyle === "function" &&
    getComputedStyle(panel).direction === "rtl";
  return rtl ? "left" : "right";
}

/** Which computed edge and margin hold a panel off its anchored viewport edge, per side. */
const RESTING_EDGE = {
  bottom: ["bottom", "marginBottom"],
  top: ["top", "marginTop"],
  left: ["left", "marginLeft"],
  right: ["right", "marginRight"],
} as const satisfies Record<Side, readonly [string, string]>;

/**
 * How far the panel rests from the viewport edge it leaves through, px.
 *
 * `100%` of the panel plus a fixed shadow clearance only clears the screen
 * when the panel is flush with that edge. A detached (floating-card) panel
 * sits `--scrollsheet-inset-*` away from it, the desktop dock adds its own
 * margin, and a bottom sheet with the keyboard up is lifted further still —
 * so exit travel that ignores this leaves the panel visibly short, parked
 * until `close()` snaps it away.
 *
 * Read from the resolved `bottom`/`top`/`left`/`right` (plus that side's
 * margin, which is what carries the desktop dock) rather than from the
 * custom properties that feed them: those hold unevaluated `calc()` token
 * strings, and one of the terms is an `env()` no script can see.
 */
export function restingInset(panel: Element | null | undefined, side: Side): number {
  if (!panel || typeof getComputedStyle !== "function") return 0;
  const style = getComputedStyle(panel) as unknown as Record<string, string>;
  let total = 0;
  for (const prop of RESTING_EDGE[side]) {
    const value = Number.parseFloat(style[prop] ?? "");
    if (Number.isFinite(value)) total += Math.max(0, value);
  }
  return total;
}

/**
 * The enter/exit legs' value space: `v` is the fraction offscreen — 0 fully
 * open (the state rules' resting `translate3d(0,0,0)`), 1 fully offscreen
 * (the `closing` resting transform, 100% of the panel plus the shadow
 * clearance). One formatter for both directions keeps interrupted legs in a
 * single continuous coordinate system.
 */
export function offscreenTransform(side: Side, v: number, restingInsetPx = 0): string {
  const dir = geometryFor(side).sign;
  const pct = (v * dir * 100).toFixed(3);
  const px = (v * dir * (OFFSCREEN_EXTRA_PX + Math.max(0, restingInsetPx))).toFixed(3);
  const t = `calc(${pct}% + ${px}px)`;
  return side === "left" || side === "right"
    ? `translate3d(${t}, 0, 0)`
    : `translate3d(0, ${t}, 0)`;
}

/**
 * Belt-and-suspenders for the HTML spec's dialog focus-restoration algorithm
 * (refocus whatever had focus before `showModal()`, once it closes). WebKit
 * 26.5 delays its own restoration ~2 animation frames after `dialog.close()`
 * returns (Chromium/Firefox restore synchronously); this only acts once
 * focus is still stuck on `<body>`/`<html>`/nowhere, so it never overrides a
 * consumer's own focus management in `onOpenChange`.
 */
export function restoreFocusFallback(previous: HTMLElement | null): void {
  if (!previous || !document.body.contains(previous)) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!document.body.contains(previous)) return;
      const active = document.activeElement;
      if (active === previous) return;
      if (active !== document.body && active !== document.documentElement && active !== null)
        return;
      previous.focus({ preventScroll: true });
    });
  });
}

/** Clears the direct style writes applied for travel-linked stacking recede. */
export function clearRecede(panel: HTMLElement | null): void {
  if (!panel) return;
  panel.style.transform = "";
  panel.style.transition = "";
  panel.style.transformOrigin = "";
  panel.style.removeProperty("--scrollsheet-recede-dim");
  panel.style.removeProperty("--scrollsheet-stack-progress");
}

/**
 * Direct style write applying the parent panel's recede for the given child
 * progress (0–1). No `filter`/`brightness` (composites badly on iOS) — a
 * scale plus a slight shift along the panel's own free axis, and a separate
 * opacity-driven `::before` dim overlay (see core.css) for the darkening.
 * Also publishes `--scrollsheet-stack-progress` (0–1, same value the recede
 * scale is derived from) on the receded panel, so a consumer can drive their
 * own depth effect in CSS instead of the built-in scale+dim look.
 */
export function applyRecede(
  panel: HTMLElement | null,
  side: Side,
  progress: number,
  live: boolean,
): void {
  if (!panel) return;
  const geometry = geometryFor(side);
  const clamped = clamp01(progress);
  const scale = 1 - clamped * RECEDE_SCALE_DELTA;
  panel.style.transition = live
    ? "none"
    : "transform var(--scrollsheet-dur) var(--scrollsheet-ease)";
  panel.style.transform = recedeTransform(geometry, clamped, scale);
  panel.style.transformOrigin = geometry.recedeOrigin;
  panel.style.setProperty("--scrollsheet-recede-dim", String(clamped * RECEDE_DIM_MAX));
  panel.style.setProperty("--scrollsheet-stack-progress", String(clamped));
}

/**
 * Direct style write applying the background-effect card look to the page
 * wrapper marked `data-scrollsheet-background`, for this sheet's own travel
 * progress (0–1). `translateY` for `'scale'` is expressed via `env()`
 * directly in the transform string (resolved by the UA at compute time), so
 * this never needs to read the safe-area inset in JS.
 */
export function applyBackgroundEffect(
  el: HTMLElement,
  effect: "scale" | "parallax",
  progress: number,
  live: boolean,
): void {
  const clamped = clamp01(progress);
  el.style.transition = live
    ? "none"
    : "transform var(--scrollsheet-dur) var(--scrollsheet-ease), border-radius var(--scrollsheet-dur) var(--scrollsheet-ease)";
  if (effect === "scale") {
    const scale = 1 - clamped * BACKGROUND_SCALE_DELTA;
    el.style.transformOrigin = "50% 0%";
    el.style.borderRadius = `${Math.round(clamped * BACKGROUND_RADIUS_MAX_PX)}px`;
    el.style.transform = `translate3d(0, calc(env(safe-area-inset-top, 0px) * ${clamped}), 0) scale(${scale})`;
  } else {
    el.style.transform = `translate3d(0, ${Math.round(-clamped * BACKGROUND_PARALLAX_PX)}px, 0)`;
  }
}

/** Parses a computed-style length ("8px", "0px") to its px number, 0 if unparsable. */
function px(value: string): number {
  return Number.parseFloat(value) || 0;
}

/**
 * The 'content' detent's measurement source. `fill` stretches the body
 * itself to the panel (flex:1 in the panel's flex column), so its own box
 * stops reflecting content — the stretch is neutralized for one synchronous
 * layout read instead: `flex: 0 0 auto` on the measured main axis (or
 * `align-self: flex-start` when the measured axis is the cross axis, i.e.
 * side sheets) lets the body size to its children's natural contributions,
 * whatever their structure — a fixed header plus an inner-scroll region, a
 * single flex:1 wrapper, bare text — margins included, since a flex
 * container never collapses them. Measuring the first child instead fails
 * both shapes the docs recipe produces: a header-first layout would measure
 * only the header, and a flex:1 first child re-measures its stretched size
 * once `--scrollsheet-max-detent` is written, collapsing 'content' into
 * 'full'. Only the neutralized axis changes: the other axis stays stretched so text
 * wraps at the real panel width and the measured size reflects it. The
 * style writes are restored before returning, within the same task, so the
 * un-stretched state is never painted.
 *
 * The result becomes the panel's own CSS `height`/`width` (content.tsx).
 * When the panel is `box-sizing: border-box` (a page-wide reset, not
 * anything this library sets), that property value has to cover the
 * panel's own padding and border on the measured axis too, or the content
 * box left over is smaller than the body and the panel scrolls with
 * nothing left to reveal. A `content-box` panel already excludes
 * padding/border from `height`, so nothing needs adding there.
 */
export function measureContentHeight(
  body: HTMLElement,
  offsetSizeProp: "offsetHeight" | "offsetWidth",
  fill: boolean,
  panelStyle: CSSStyleDeclaration,
  axis: "x" | "y",
): number {
  let measured: number;
  if (fill) {
    const style = body.style;
    if (axis === "y") {
      const prev = style.flex;
      style.flex = "0 0 auto";
      measured = body[offsetSizeProp];
      style.flex = prev;
    } else {
      const prev = style.alignSelf;
      style.alignSelf = "flex-start";
      measured = body[offsetSizeProp];
      style.alignSelf = prev;
    }
  } else {
    measured = body[offsetSizeProp];
  }
  if (panelStyle.boxSizing !== "border-box") return measured;
  const s = panelStyle;
  const boxExtra =
    axis === "y"
      ? px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth)
      : px(s.paddingLeft) + px(s.paddingRight) + px(s.borderLeftWidth) + px(s.borderRightWidth);
  return measured + boxExtra;
}

/**
 * Direct style write for the "squares off as it meets the screen edge"
 * radius flatten (full-height sheets only, UISheetPresentationController-
 * style) — `radiusPx` on the panel's lead-edge corners only (matching the
 * per-side CSS default's own corner selection), the other two corners
 * always 0 (they're already flush with the screen and never rounded).
 */
export function applyFullHeightRadius(panel: HTMLElement, side: Side, radiusPx: number): void {
  const r = `${Math.max(0, radiusPx)}px`;
  switch (side) {
    case "bottom":
      panel.style.borderRadius = `${r} ${r} 0 0`;
      break;
    case "top":
      panel.style.borderRadius = `0 0 ${r} ${r}`;
      break;
    case "left":
      panel.style.borderRadius = `0 ${r} ${r} 0`;
      break;
    case "right":
      panel.style.borderRadius = `${r} 0 0 ${r}`;
      break;
  }
}
