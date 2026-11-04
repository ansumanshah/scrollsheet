import * as React from "react";

import type { SheetContextValue } from "../context";
import { geometryFor } from "../motion/geometry";
import { syncSnapStops as syncSnapStopsImpl } from "../motion/snap-stops";
import { DEFAULT_RADIUS_PX, measureContentHeight, setBoolAttr } from "./content-helpers";
import type { Overlay } from "./content-helpers";
import {
  type DetentContext,
  type DetentSpec,
  nearestDetent,
  resolveDetent,
  resolveDetents,
  type ResolvedDetent,
} from "./detents";
import { warnLargestUndimmedDetentOutOfRange } from "./env";

export type SheetMeasure = [
  measure: (rebuildSnapStops?: boolean) => void,
  syncSnapStops: () => void,
  resolveSpec: (spec: DetentSpec) => ResolvedDetent | undefined,
];

/**
 * Detent resolution against the live viewport: every geometry the travel,
 * drag, keyboard and morph paths read comes out of `measure()`.
 *
 * Positional parameters and a tuple return: object keys survive minification
 * and this entry is budgeted per byte.
 */
export function useSheetMeasure(
  dialogRef: React.RefObject<Overlay | null>,
  trackRef: React.RefObject<HTMLDivElement | null>,
  canvasRef: React.RefObject<HTMLDivElement | null>,
  panelRef: React.RefObject<HTMLDivElement | null>,
  bodyRef: React.RefObject<HTMLDivElement | null>,
  ctxRef: React.RefObject<SheetContextValue>,
  fillRef: React.RefObject<boolean>,
  resolvedRef: React.RefObject<ResolvedDetent[]>,
  maxDetentRef: React.RefObject<number>,
  firstDetentRef: React.RefObject<number>,
  dimStartRef: React.RefObject<number>,
  dimEndRef: React.RefObject<number>,
  baseRadiusRef: React.RefObject<number>,
  fullHeightRef: React.RefObject<boolean>,
  detachedRef: React.RefObject<boolean>,
): SheetMeasure {
  const lastInsetMirrorRef = React.useRef("");
  const measureCtxRef = React.useRef<DetentContext | null>(null);

  /**
   * Resolve detents against the current viewport and rebuild snap stops.
   * `rebuildSnapStops` defaults to true for every caller except the
   * content-morph effect, which defers the snap-stop DOM rebuild until
   * after its own tween lands — see `syncSnapStops`'s doc comment below for
   * why.
   */
  const measure = React.useCallback((rebuildSnapStops = true) => {
    const dialog = dialogRef.current;
    const track = trackRef.current;
    const canvas = canvasRef.current;
    const body = bodyRef.current;
    const panel = panelRef.current;
    if (!dialog || !track || !canvas || !body || !panel) return;
    const geometry = geometryFor(ctxRef.current.side);

    // Feeds .scrollsheet-canvas::after's overdraw fill — see styles.ts for
    // why this can't just be `background: inherit` on the pseudo itself.
    // One computed-style resolve per measure — three separate calls each
    // forced style recalc on a hot path (every resize/keyboard/morph).
    const panelStyle = getComputedStyle(panel);
    canvas.style.setProperty("--scrollsheet-panel-bg", panelStyle.backgroundColor);

    // Desktop drawers take the Handle out of flow, so the top spacing the
    // pill would otherwise provide has to be added back explicitly — only
    // on sheets that actually render one. Reflected as an attribute rather than matched with
    // :has() so the rule holds on every browser the library supports (:has()
    // is Firefox 121+, above this library's 112 floor), and re-evaluated with
    // the rest of measure() so a multi-view sheet that swaps a handle in or
    // out doesn't keep stale spacing.
    // Written only on an actual change: this attribute drives a padding rule,
    // so an unconditional write would invalidate style every measure() and
    // force a recalc on the `contentHeight` read below — measure() runs on
    // every resize, keyboard move, and content morph.
    const hasHandle = body.querySelector("[data-scrollsheet-handle]") !== null;
    setBoolAttr(dialog, "data-scrollsheet-has-handle", hasHandle);

    // Center presentation: the panel is content-sized by the center CSS
    // block and there is no travel range — detent resolution, snap stops,
    // dim ranges, and the detached/full-height machinery are all inert.
    // Only the two writes above (overdraw fill color, handle spacing) are
    // meaningful, and every measure() caller (resize, keyboard, morph)
    // stays safe through this single early return.
    if (ctxRef.current.center) return;

    const viewportSize = track[geometry.clientSizeProp];
    // Detached (floating-card) sheets reserve their margin out of the
    // detent space itself: 'full' resolves to viewport minus the top and
    // bottom gaps, so a full detent still floats instead of touching the
    // edges. Parsed here (not only in the detached block below) because the
    // detent resolution needs it first.
    const rawInsetBottom = panelStyle.getPropertyValue("--scrollsheet-inset-bottom");
    const parsedInsetBottom = Number.parseFloat(rawInsetBottom);
    const detached = Number.isFinite(parsedInsetBottom) && parsedInsetBottom > 0;
    // Written HERE, before contentHeight is read below and before the
    // detent resolution. core.css's own [data-scrollsheet-detached] rule
    // replaces the panel's padding-bottom (the attached rule clears the
    // home indicator; the detached one must not, or the card pads twice),
    // and measureContentHeight reads that padding off panelStyle — the
    // attribute must land before that first read, or a detached sheet's
    // first measure sizes against the attached padding and opens taller
    // than its content by the safe-area inset, with nothing to remeasure it.
    // Conditional write for the same reason has-handle above is: an
    // unconditional one invalidates style on every measure().
    detachedRef.current = detached;
    setBoolAttr(dialog, "data-scrollsheet-detached", detached);
    // Mirrored onto the canvas for the outside-variant Handle's offset:
    // --scrollsheet-inset-bottom is scoped to the PANEL (the desktop dock
    // sets it there, consumers' detached-card classes target it there),
    // and the canvas-portaled pill is a sibling — it never inherits the
    // real value, so without this mirror it would silently read 0.
    // Conditional write, same reason as the attributes above.
    const insetMirror = `${detached ? parsedInsetBottom : 0}px`;
    if (canvas && lastInsetMirrorRef.current !== insetMirror) {
      lastInsetMirrorRef.current = insetMirror;
      canvas.style.setProperty("--scrollsheet-ib", insetMirror);
    }
    const measureCtx: DetentContext = {
      viewportHeight: viewportSize,
      contentHeight: measureContentHeight(
        body,
        geometry.offsetSizeProp,
        fillRef.current,
        panelStyle,
        geometry.axis,
      ),
      topInset: detached ? parsedInsetBottom * 2 : 0,
    };
    measureCtxRef.current = measureCtx;
    const resolved = resolveDetents(ctxRef.current.detents, measureCtx);
    resolvedRef.current = resolved;
    const maxDetent = resolved[resolved.length - 1]?.height ?? 0;
    const firstDetent = resolved[0]?.height ?? 0;
    maxDetentRef.current = maxDetent;
    firstDetentRef.current = firstDetent;

    // largestUndimmedDetent: dimStart is its resolved height (0 if unset —
    // the prop's default), dimEnd is the next *resolved* detent above it, or
    // maxDetent if it's already the tallest. Clamped to maxDetent-1 so
    // dimStart < dimEnd always holds, even when largestUndimmedDetent
    // resolves at or above every configured detent (e.g. a short
    // 'content'-only detents list with a taller largestUndimmedDetent) —
    // without this an inverted dimStart > dimEnd range gets written to
    // --scrollsheet-fade-start/-end, which is undefined behavior on the CSS
    // scroll-driven-animation fast path (core.css's animation-range).
    const undimmedSpec = ctxRef.current.largestUndimmedDetent;
    const resolvedDimStart =
      undimmedSpec !== undefined ? Math.round(resolveDetent(undimmedSpec, measureCtx)) : 0;
    const dimStart = Math.max(0, Math.min(maxDetent - 1, resolvedDimStart));
    // Warn only when it resolves *above* every configured detent (the actual
    // misconfiguration — e.g. a short 'content'-only detents list with a
    // taller largestUndimmedDetent) — not merely equal to the tallest one,
    // which is a legitimate, common pattern (vaul's own default: "fade only
    // at the topmost snap point") that the clamp above already handles
    // correctly with no behavior change worth flagging.
    if (
      process.env.NODE_ENV !== "production" &&
      undimmedSpec !== undefined &&
      resolvedDimStart > maxDetent
    ) {
      warnLargestUndimmedDetentOutOfRange();
    }
    const dimEnd = resolved.find((d) => d.height > dimStart)?.height ?? maxDetent;
    dimStartRef.current = dimStart;
    dimEndRef.current = dimEnd;

    dialog.style.setProperty("--scrollsheet-max-detent", `${maxDetent}px`);
    // The SDA progress animation's own range (core.css): 0 at rest-closed
    // through firstDetent, matching travelProgress's own definition below —
    // written unconditionally like max-detent/fade-start/-end, cheap and
    // harmless on engines that never read it.
    dialog.style.setProperty("--scrollsheet-first-detent", `${firstDetent}px`);
    dialog.style.setProperty("--scrollsheet-fade-start", `${dimStart}px`);
    dialog.style.setProperty("--scrollsheet-fade-end", `${dimEnd}px`);

    // Full-height detection (radius-flatten): the largest detent reaching
    // the true viewport edge (resolveDetent caps every spec at
    // viewportHeight - topInset, so "full" and any >=100% fraction land
    // here within rounding).
    fullHeightRef.current = maxDetent >= viewportSize - 1;
    // --scrollsheet-radius is declared as a real custom property on the
    // panel's default-look rule in styles.ts (not just embedded inside a
    // var(...,fallback) call), specifically so it's reliably readable here
    // regardless of whether a consumer overrode it.
    const rawRadius = panelStyle.getPropertyValue("--scrollsheet-radius").trim();
    const parsedRadius = Number.parseFloat(rawRadius);
    baseRadiusRef.current = Number.isFinite(parsedRadius) ? parsedRadius : DEFAULT_RADIUS_PX;

    // Direction mirror for the desktop drawer's travel rules: core.css keys
    // its RTL resting transforms on this, and transformSide() reads the same
    // computed direction — the signal margin-inline (the dock itself)
    // resolves against, which a :dir() selector would miss for a CSS-only
    // `direction: rtl`. Conditional write like has-handle above: it drives
    // transform rules and measure() runs on every resize/keyboard/morph —
    // which is also this mirror's refresh cadence, so a live direction flip
    // with the sheet open waits for the next of those (the WAAPI legs read
    // computed direction directly and stay correct regardless).
    const rtl = panelStyle.direction === "rtl";
    setBoolAttr(dialog, "data-scrollsheet-rtl", rtl);

    if (rebuildSnapStops) syncSnapStops();
  }, []);

  // Deferred to after the content-morph tween's own scrollTo lands — see
  // syncSnapStops's doc comment for why an inline rebuild mid-tween misfires.
  const syncSnapStops = React.useCallback(() => {
    syncSnapStopsImpl({
      canvas: canvasRef.current,
      side: ctxRef.current.side,
      dismissible: ctxRef.current.dismissible,
      resolved: resolvedRef.current,
      maxDetent: maxDetentRef.current,
    });
  }, []);

  const resolveSpec = React.useCallback((spec: DetentSpec): ResolvedDetent | undefined => {
    const resolved = resolvedRef.current;
    const bySpec = resolved.find((d) => Object.is(d.spec, spec));
    if (bySpec) return bySpec;
    // The spec collapsed into another during de-dup (two specs resolved to the
    // same height). Resolve its true height and snap to the nearest survivor
    // rather than guessing by list position — the sorted/deduped `resolved`
    // array and the declaration-order detents array are different index spaces.
    const measureCtx = measureCtxRef.current;
    if (measureCtx) {
      const height = Math.round(resolveDetent(spec, measureCtx));
      return nearestDetent(height, resolved) ?? resolved[resolved.length - 1];
    }
    return resolved[resolved.length - 1];
  }, []);

  return [measure, syncSnapStops, resolveSpec];
}
