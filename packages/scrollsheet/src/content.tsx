"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { StackContext, type SheetContextValue, type TravelInfo, useSheetContext } from "./context";
import {
  DEFAULT_RADIUS_PX,
  FULL_HEIGHT_RADIUS_FLATTEN_PX,
  type Overlay,
  type Phase,
  SETTLE_FALLBACK_MS,
  TRAVEL_MS,
  applyBackgroundEffect,
  applyFullHeightRadius,
  clearRecede,
  isPhantomScrollStep,
  jumpScroll,
  measureContentHeight,
  resolveClosedBy,
  readRevealed,
  restoreFocusFallback,
  setBoolAttr,
} from "./internal/content-helpers";
import {
  clampSequentialDetent,
  type DetentContext,
  type DetentSpec,
  isBelowCloseThreshold,
  nearestDetent,
  resolveDetent,
  resolveDetents,
  type ResolvedDetent,
} from "./internal/detents";
import {
  env,
  hasClosedBySupport,
  hasDialogSupport,
  hasPopoverSupport,
  warnContentAsChildInvalidChild,
  warnCoreStylesMissing,
  warnLargestUndimmedDetentOutOfRange,
  warnMissingDialogSupport,
} from "./internal/env";
import { preloadFallbackSheet } from "./internal/fallback-sheet-loader";
import { Slot, composeRefs } from "./internal/slot";
import { injectStyles } from "./internal/styles";
import type { ThemeColorController } from "./internal/theme-color";
import { preloadThemeColor } from "./internal/theme-color-loader";
import { useBackgroundEffect } from "./internal/use-background-effect";
import { useCloseWatcher } from "./internal/use-close-watcher";
import { useContentMorph } from "./internal/use-content-morph";
import { geometryFor, mapScroll } from "./motion/geometry";
import { type ScrollAnimation, animateScrollTo } from "./motion/scroll-animator";
import { isAtScrollBoundary } from "./motion/scroll-handoff";
import { syncSnapStops as syncSnapStopsImpl } from "./motion/snap-stops";
import { useDragEngine } from "./internal/use-drag-engine";
import { useEnterExitLeg } from "./internal/use-enter-exit-leg";
import { usePresentationFlip } from "./internal/use-presentation-flip";
import { useBodyFreeze } from "./internal/use-body-freeze";
import { useKeyboardViewport } from "./internal/use-keyboard-viewport";
import { useNestedScrollbars } from "./internal/use-nested-scrollbars";
import { useOverlayScrollbar } from "./internal/use-overlay-scrollbar";
import { useStackRecede } from "./internal/use-stack-recede";

// Marks an Escape keydown as already claimed by the topmost non-modal sheet,
// so the React-portal replay doesn't also close ancestor sheets. Symbol.for,
// not a local symbol: two bundle copies must agree on the claim.
const ESC_CLAIMED = /* @__PURE__ */ Symbol.for("scrollsheet-esc-claimed");

export interface SheetContentProps extends React.ComponentProps<"div"> {
  /** Accessible name when no <Sheet.Title> is rendered. */
  "aria-label"?: string;
  /**
   * Stretches [data-scrollsheet-body] to fill the panel (flex column, the
   * body itself flex:1/min-height:0) instead of sizing to its natural content
   * height. Promotes the docs "Full-height content" recipe into the library —
   * write your own inner-scroll child (flex:1, overflow-y:auto) with no CSS
   * of your own required on the wrapper.
   * @default false
   */
  fill?: boolean;
  /**
   * Render the child element instead of scrollsheet's own panel `<div>`,
   * merging the panel's props (role, tabIndex, ref, `data-scrollsheet-*`)
   * into it — matches Radix `Dialog.Content asChild`: the child replaces the
   * panel outright rather than nesting inside it. The child must be a single
   * non-Fragment element; whatever it was given as its own children is
   * hoisted into the body wrapper below (detent measurement and stacking
   * still need a real DOM descendant there regardless of which element ends
   * up as the panel).
   * If `children` isn't a single non-Fragment element (missing, a string,
   * multiple elements, a `<>...</>` Fragment…), `asChild` is ignored for
   * that render — the default panel `<div>` is used instead, with a
   * one-time dev warning.
   * @default false
   */
  asChild?: boolean;
}

/**
 * Pure per-frame math for onTravel's TravelInfo. Mutates `target` in
 * place (the reused-Map contract TravelInfo's TSDoc documents) rather than
 * returning a fresh Map. Keyed by resolved px height, not DetentSpec, since
 * `resolved` is already de-duped by height (resolveDetents' contract) — a
 * duplicate-resolving spec must not double-count here either.
 */
export function fillProgressAtDetents(
  target: Map<number, number>,
  resolved: readonly ResolvedDetent[],
  revealed: number,
): void {
  target.clear();
  for (const detent of resolved) {
    const progress = detent.height > 0 ? Math.min(1, Math.max(0, revealed / detent.height)) : 0;
    target.set(detent.height, progress);
  }
}

function round3(x: number): string {
  return String(Math.round(x * 1000) / 1000);
}

/**
 * Whether the CSS scroll-driven-animation path (core.css's `@supports
 * (animation-timeline: scroll())` block, active once `data-scrollsheet-sda`
 * is stamped) owns the backdrop's dim opacity and `--scrollsheet-progress`
 * for this frame — updateTravel must skip writing either then, or the JS
 * write and the compositor animation fight over the same custom properties
 * for no reason (the animation always wins the cascade regardless, so the
 * skip is a pure main-thread-cost cut, not a correctness fix).
 *
 * Scoped to phase 'open' only, matching core.css's own selector: during
 * 'opening'/'closing' the track's scroll position is already at rest (jumped
 * to its target before the WAAPI enter/exit leg starts animating the
 * PANEL's transform — see the open sequence effect), so there is no live
 * scroll delta for a timeline to read yet. That entrance/exit fade stays the
 * existing transition-driven write on every engine, SDA or not.
 */
export function sdaOwnsBackdrop(sdaSupported: boolean, phase: Phase): boolean {
  return sdaSupported && phase === "open";
}

export const Content = /* @__PURE__ */ React.forwardRef<HTMLDivElement, SheetContentProps>(
  function Content({ children, className, fill = false, asChild = false, ...panelProps }, ref) {
    const ctx = useSheetContext("Content");
    const parentStack = React.useContext(StackContext);
    const [phase, setPhase] = React.useState<Phase>("pre");
    const [childCount, setChildCount] = React.useState(0);
    // The dialog is portaled to <body>, so it never sits under a transformed or
    // filtered ancestor (a parent sheet's "recede" transform would otherwise
    // become the containing block for this dialog's fixed-position track on
    // engines that don't fully isolate the top layer — notably iOS Safari).
    // Mount-gated so SSR renders nothing and the client's first render matches.
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    // Browsers without a real <dialog> (~4% global — Opera Mini, some old
    // in-app WebViews, iOS ≤15.3) degrade to a plain fixed-position modal
    // (internal/fallback-sheet.tsx) instead of rendering nothing: no top
    // layer, no detents, no drag, but the content is reachable and dismissible
    // so a checkout still completes. The engine below stays fully inert on
    // that path — `present` gates every effect and it is false there.
    const dialogOk = hasDialogSupport();
    // Feature-detected once (env.ts, cached for the process) and stamped as
    // data-scrollsheet-sda on the dialog below — the same signal core.css's
    // `@supports (animation-timeline: scroll())` block gates its rules on, so
    // a consumer's own CSS and this file's DOM-visible tests can key off the
    // identical boolean rather than re-deriving it.
    const sda = env().scrollTimeline;

    const dialogRef = React.useRef<Overlay | null>(null);
    const overlayOpenRef = React.useRef(false);
    const backdropRef = React.useRef<HTMLDivElement>(null);
    const trackRef = React.useRef<HTMLDivElement>(null);
    const canvasRef = React.useRef<HTMLDivElement>(null);
    const panelRef = React.useRef<HTMLDivElement>(null);
    const bodyRef = React.useRef<HTMLDivElement>(null);
    // Memoized so the composed callback stays identity-stable across renders
    // — an inline compose would detach/reattach the ref every render, churning
    // ctx.setCanvasEl through null.
    const setCanvasNode = React.useMemo(
      () => composeRefs(canvasRef, ctx.setCanvasEl),
      [ctx.setCanvasEl],
    );

    const lastInsetMirrorRef = React.useRef("");
    const resolvedRef = React.useRef<ResolvedDetent[]>([]);
    const measureCtxRef = React.useRef<DetentContext | null>(null);
    const maxDetentRef = React.useRef(0);
    const firstDetentRef = React.useRef(0);
    // onTravel's 3rd arg: one object + one Map, reused and mutated in place
    // every travel frame instead of allocated fresh — see TravelInfo's TSDoc.
    const travelInfoRef = React.useRef<{
      range: [number, number];
      progressAtDetents: Map<number, number>;
    }>({
      range: [0, 0],
      progressAtDetents: new Map(),
    });
    // largestUndimmedDetent's resolved dim range, px — see updateTravel's
    // `dimProgress` (backdrop/themeColorDimming only; travelProgress, driving
    // everything else, is unaffected by this prop). dimStart 0 / dimEnd
    // firstDetent (the prop's default, unset) reduces to today's behavior
    // exactly.
    const dimStartRef = React.useRef(0);
    const dimEndRef = React.useRef(0);
    const atMaxRef = React.useRef(false);
    const animRef = React.useRef<ScrollAnimation | null>(null);
    // Set for the lifetime of any in-flight animateScrollTo tween (Handle/
    // keyboard detent travel, content-morph, drag-release-to-nearest-detent —
    // every call site that starts one), cleared via its `finished` promise on
    // both natural completion and cancellation. Gates settle() below — see
    // that function's doc comment for why a tween in flight needs to suppress
    // it.
    const tweenActiveRef = React.useRef(false);
    const settleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const themeColorRef = React.useRef<ThemeColorController | null>(null);
    // The fixed bottom-chrome sentinel theme-color.ts paints for engines
    // that sample browser-chrome color off fixed elements rather than
    // <meta name="theme-color"> — see that module's doc comment.
    const bottomChromeRef = React.useRef<HTMLDivElement | null>(null);
    // The top-chrome strip: a second backdrop clipped to the status-bar edge
    // (see the JSX comment where it renders). updateTravel mirrors the dim
    // var onto it because the var is scoped per-element, not on the dialog.
    const topChromeRef = React.useRef<HTMLDivElement | null>(null);
    // Last written --scrollsheet-kb-hang / --scrollsheet-reveal px, to skip
    // same-value writes on the travel hot path (at rest neither changes
    // frame to frame).
    const lastKbHangRef = React.useRef(-1);
    const lastRevealRef = React.useRef(-1);
    // Bottom mirror of topChromeRef (see the JSX comment where it renders).
    const bottomChromeDimRef = React.useRef<HTMLDivElement | null>(null);
    const previousFocusRef = React.useRef<HTMLElement | null>(null);
    const openerElementRef = React.useRef<HTMLElement | null>(null);
    const backgroundTargetRef = React.useRef<HTMLElement | null>(null);
    const scrollbarRef = React.useRef<HTMLDivElement>(null);
    const baseRadiusRef = React.useRef(DEFAULT_RADIUS_PX);
    const fullHeightRef = React.useRef(false);
    const detachedRef = React.useRef(false);
    const radiusOverrideAppliedRef = React.useRef(false);
    /** Which effect updateTravel last wrote, so it can be wound back. */
    const backgroundAppliedRef = React.useRef<"scale" | "parallax" | null>(null);

    const ctxRef = React.useRef(ctx);
    const phaseRef = React.useRef<Phase>(phase);
    const parentStackRef = React.useRef(parentStack);
    /** performance.now() of the last direct input on the dialog — see
     *  USER_SCROLL_ATTRIBUTION_MS. 0 = no input yet this presentation. */
    const lastUserInputRef = React.useRef(0);
    /** A scroll frame teleported the track while input-stale (see
     *  PHANTOM_SCROLL_JUMP_PX) — the next settle winds back instead of
     *  judging. Cleared by any direct input: once a person has seen the
     *  sheet wherever it is, their next outcome is their own. */
    const phantomScrollRef = React.useRef(false);
    /** Track position at the previous scroll frame, for the classifier's
     *  per-event delta. Null = no frame observed yet this attachment. */
    const lastScrollPosRef = React.useRef<number | null>(null);
    // fill is a Content prop, not context — measure() (a `[]`-deps useCallback)
    // reads it via ref like every other per-render value it needs.
    const fillRef = React.useRef(fill);
    React.useInsertionEffect(() => {
      ctxRef.current = ctx;
      phaseRef.current = phase;
      parentStackRef.current = parentStack;
      fillRef.current = fill;
    });

    /**
     * The effective backgroundEffect. Unset defaults to 'scale' for a
     * full-height bottom sheet in the mobile presentation — the platform
     * pushes the page back behind a sheet that covers the screen. Excluded:
     * every other side; the desktop dock (the drawer sits beside the page, so
     * moving the page would read as the whole app sliding); and detached
     * floating cards (they never claim the full screen). Reads refs measure()
     * owns, so it is evaluated per frame rather than cached — a rotation or a
     * detent change can flip full-height either way mid-session.
     */
    const resolveBackgroundEffect = React.useCallback(():
      | Exclude<SheetContextValue["backgroundEffect"], "none">
      | undefined => {
      const explicit = ctxRef.current.backgroundEffect;
      if (explicit) return explicit === "none" ? undefined : explicit;
      if (ctxRef.current.side !== "bottom") return undefined;
      if (!fullHeightRef.current || detachedRef.current) return undefined;
      // The marker is found by a document-wide query, so an implicit default
      // must prove the found element is *this* sheet's page: the wrapper must
      // contain the element that opened the sheet (Trigger-recorded; focus
      // fallback for programmatic opens). Unattributable opens decline rather
      // than move a wrapper they cannot claim. An explicit prop keeps the
      // document-wide behavior, unchanged.
      const target = backgroundTargetRef.current;
      const opener = openerElementRef.current;
      if (!target || !opener || !target.contains(opener)) return undefined;
      return "scale";
    }, []);

    const present = dialogOk && mounted && (ctx.open || phase !== "pre");
    // No enter/exit legs on the degraded path (no WAAPI travel to run), so it
    // tracks ctx.open directly instead of the phase machine — it appears and
    // disappears rather than animating.
    const degraded = !dialogOk && mounted && ctx.open;
    // Hoisted above the hook section (JSX below re-reads the same value) —
    // useCloseWatcher needs it before any early return.
    const nonModal = ctx.modal === false;

    // Dev-only, one-shot: only warns once a consumer actually tries to open a
    // sheet on a platform with no <dialog> support, not on every mount.
    React.useEffect(() => {
      if (!dialogOk && ctx.open) warnMissingDialogSupport();
    }, [dialogOk, ctx.open]);

    // Style injection for the degraded path lives HERE, not inside
    // FallbackSheet: that module must stay import-free so its lazy chunk
    // never chains to the sheet core (see its own doc comments).
    React.useEffect(() => {
      if (degraded) injectStyles(ctx.nonce);
    }, [degraded, ctx.nonce]);

    // The degraded modal is code-split: the ~96% with <dialog> never ship
    // it. Keyed on the platform probe at MOUNT (not on open) so the module
    // is resident before the first open on the platforms that need it; a
    // defaultOpen first render there shows the modal one microtask late.
    const [LoadedFallbackSheet, setLoadedFallbackSheet] = React.useState<
      typeof import("./internal/fallback-sheet").FallbackSheet | null
    >(null);
    React.useEffect(() => {
      if (dialogOk || !mounted || LoadedFallbackSheet) return;
      let alive = true;
      void preloadFallbackSheet().then((mod) => {
        if (alive && mod) setLoadedFallbackSheet(() => mod.FallbackSheet);
      });
      return () => {
        alive = false;
      };
    }, [dialogOk, mounted, LoadedFallbackSheet]);

    // panelRef never changes identity, so this only re-composes when the
    // consumer's own ref does.
    const composedPanelRef = React.useMemo(() => composeRefs(panelRef, ref), [ref]);

    // Mirrors of childCount / the child's last travel progress, readable from
    // the enter/exit leg's finish() (which must re-apply a recede the leg's
    // WAAPI animation was masking).
    const childCountRef = React.useRef(0);
    const childProgressRef = React.useRef(0);

    const { stackValue, childKey } = useStackRecede({
      parentStack,
      present,
      phase,
      phaseRef,
      panelRef,
      ctxRef,
      childCountRef,
      childProgressRef,
      setChildCount,
    });

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
      if (undimmedSpec !== undefined && resolvedDimStart > maxDetent) {
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

    const updateTravel = React.useCallback(() => {
      const dialog = dialogRef.current;
      const track = trackRef.current;
      if (!dialog || !track) return;
      // Center: no travel exists. The open sequence writes the static
      // dim/progress values once; every per-frame consumer below (onTravel,
      // stack progress, backgroundEffect, radius-flatten) is travel-defined
      // and deliberately never fires.
      if (ctxRef.current.center) return;
      const geometry = geometryFor(ctxRef.current.side);
      const maxDetent = maxDetentRef.current;
      const revealed = readRevealed(track, geometry, maxDetent);

      // The panel's hang: how far its bottom edge sits past the track's far
      // edge at the current reveal (max-detent tall, bottom-anchored, so the
      // unrevealed remainder hangs below the viewport). Only keyboard mode's
      // eg calc reads it (core.css), so ordinary drags skip the write; the
      // dedupe resets on exit so the next keyboard session's first frame
      // always writes fresh.
      if (dialog.hasAttribute("data-scrollsheet-kb")) {
        const hang = Math.max(0, Math.round(maxDetent - revealed));
        if (hang !== lastKbHangRef.current) {
          lastKbHangRef.current = hang;
          canvasRef.current?.style.setProperty("--scrollsheet-kb-hang", `${hang}px`);
        }
      } else {
        lastKbHangRef.current = -1;
      }
      // Caps the sentinel's rest height (see its style comment) — always
      // relevant while themeColorDimming renders it, keyboard or not.
      const revealPx = Math.max(0, Math.round(revealed));
      if (revealPx !== lastRevealRef.current) {
        lastRevealRef.current = revealPx;
        bottomChromeRef.current?.style.setProperty("--scrollsheet-reveal", `${revealPx}px`);
      }

      // travelProgress: the original, pre-largestUndimmedDetent 0-1 ratio
      // against the first detent — the single definition of "progress" this
      // library had before largestUndimmedDetent existed. Drives the
      // --scrollsheet-progress CSS var, onTravel's second argument, stacking
      // recede (setChildProgress) and backgroundEffect: all four are
      // documented as tracking the sheet's travel 1:1, and none of them are
      // largestUndimmedDetent's concern.
      const firstDetent = firstDetentRef.current;
      const travelProgress = firstDetent > 0 ? Math.min(1, revealed / firstDetent) : 0;

      // dimProgress: largestUndimmedDetent's dim range (dimStart/dimEnd from
      // measure()) — scoped to exactly what the prop's own docs describe, the
      // backdrop and themeColorDimming. Unset (dimStart=0/dimEnd=firstDetent)
      // reduces to travelProgress exactly.
      const dimStart = dimStartRef.current;
      const dimRange = dimEndRef.current - dimStart;
      const dimProgress =
        dimRange > 0
          ? Math.min(1, Math.max(0, (revealed - dimStart) / dimRange))
          : revealed >= dimEndRef.current
            ? 1
            : 0;
      // Scoped to the backdrop (its only CSS consumer): a per-frame variable on
      // the dialog would force style recalc of the entire sheet subtree.
      // --scrollsheet-progress stays travelProgress (see core.css doc); the
      // internal --scrollsheet-dim var is what the backdrop opacity/fade rules
      // actually read. Skipped once SDA owns this frame (sdaOwnsBackdrop) —
      // core.css's scroll-driven animation computes the identical numbers
      // straight off the track's live scroll position, off the main thread.
      if (!sdaOwnsBackdrop(env().scrollTimeline, phaseRef.current)) {
        backdropRef.current?.style.setProperty("--scrollsheet-progress", round3(travelProgress));
        const dimValue = round3(dimProgress);
        for (const el of [backdropRef.current, topChromeRef.current, bottomChromeDimRef.current]) {
          el?.style.setProperty("--scrollsheet-dim", dimValue);
        }
      }
      // Not CSS-drivable (it sets a <meta> tag, not a style) — computed and
      // applied every frame regardless of SDA.
      themeColorRef.current?.apply(dimProgress, travelProgress > 0);
      const atMax = maxDetent > 0 && revealed >= maxDetent - 1;
      if (atMax !== atMaxRef.current) {
        atMaxRef.current = atMax;
        if (atMax) dialog.setAttribute("data-scrollsheet-at-max", "");
        else dialog.removeAttribute("data-scrollsheet-at-max");
      }
      if (ctxRef.current.onTravel) {
        const info = travelInfoRef.current;
        info.range = [0, maxDetent];
        fillProgressAtDetents(info.progressAtDetents, resolvedRef.current, revealed);
        ctxRef.current.onTravel(revealed, travelProgress, info);
      }

      // Full-height radius-flatten (UISheetPresentationController-style): only
      // for sheets whose tallest detent reaches the true screen edge, and
      // never for detached (floating-card) sheets — they don't meet the edge,
      // so they never square off. Squares off over the last
      // FULL_HEIGHT_RADIUS_FLATTEN_PX of travel approaching max, and back on
      // the way down; tracks the finger 1:1 (no transition — it's driven by
      // scroll position every frame, not a separate animation), so
      // prefers-reduced-motion doesn't apply.
      const panel = panelRef.current;
      if (panel && fullHeightRef.current && !detachedRef.current) {
        const t = Math.min(Math.max((maxDetent - revealed) / FULL_HEIGHT_RADIUS_FLATTEN_PX, 0), 1);
        applyFullHeightRadius(panel, ctxRef.current.side, baseRadiusRef.current * t);
        radiusOverrideAppliedRef.current = true;
      } else if (panel && radiusOverrideAppliedRef.current) {
        panel.style.borderRadius = "";
        radiusOverrideAppliedRef.current = false;
      }

      // Travel-linked stacking: publish this frame's progress to the parent
      // (if any) while settled-open — a real drag/scroll frame, so no
      // transition (1:1 tracking). The 'opening' jump and the 'closing' reset
      // are each pushed once, explicitly, by their own effects instead.
      if (parentStackRef.current && phaseRef.current === "open") {
        parentStackRef.current.setChildProgress(travelProgress, true, childKey);
      }

      // Background-effect: this sheet's own travel drives the marked page
      // wrapper, independent of any parent/child stacking relationship.
      const bgTarget = backgroundTargetRef.current;
      const effect = resolveBackgroundEffect();
      if (bgTarget && effect) {
        applyBackgroundEffect(bgTarget, effect, travelProgress, phaseRef.current === "open");
        backgroundAppliedRef.current = effect;
      } else if (bgTarget && backgroundAppliedRef.current) {
        // The rule stopped qualifying while the sheet stayed open — a rotation
        // re-measured it out of full-height, a resize crossed into the desktop
        // dock, or the element that opened it left the DOM. Wind the wrapper
        // back to rest with the effect that was actually applied; skipping the
        // branch instead would freeze it at its last qualifying frame for the
        // rest of the session.
        applyBackgroundEffect(bgTarget, backgroundAppliedRef.current, 0, false);
        backgroundAppliedRef.current = null;
      }
    }, []);

    /**
     * Starts an animateScrollTo tween, tracked consistently in `animRef` /
     * `tweenActiveRef` across every call site that needs one — see `settle`'s
     * doc comment for why `tweenActiveRef` exists. A backstop timer
     * force-clears `tweenActiveRef` even if `finished` never resolves (rAF can
     * stall entirely under heavy CPU contention, e.g. a throttled/occluded
     * tab), since without it a stalled tween would suppress settle() forever
     * instead of just for its own bounded duration.
     */
    const startTween = React.useCallback(
      (
        track: HTMLElement,
        target: number,
        axis: "x" | "y",
        suspendSnap = false,
      ): ScrollAnimation => {
        const animation = animateScrollTo(track, target, TRAVEL_MS, axis, suspendSnap);
        animRef.current = animation;
        tweenActiveRef.current = true;
        let cleared = false;
        const clear = () => {
          // Only clear if this tween is still the active one. A later tween that
          // replaced us has already set tweenActiveRef=true; a stale clear from
          // the old tween's finished/timeout must not clobber it back to false
          // (which would unguard settle() for the rest of the new tween).
          if (cleared || animRef.current !== animation) return;
          cleared = true;
          tweenActiveRef.current = false;
        };
        animation.finished.finally(clear);
        setTimeout(clear, TRAVEL_MS + 100);
        return animation;
      },
      [],
    );

    /**
     * Promotes the nearest resolved detent into React state once the track's
     * scroll position settles, and dismisses if it settled below half the
     * first detent. No-op while `tweenActiveRef.current` is true: a browser
     * fires native `scrollend` after *every* `scrollTo({behavior:'instant'})`
     * call, not just the tween's true final frame, so an intermediate frame
     * mid-tween could misfire the dismiss check before the tween lands.
     *
     * Defined after startTween on purpose: the origin-attribution branch
     * below restores the active detent through the same tracked tween path
     * every other correction uses.
     */
    const settle = React.useCallback(() => {
      if (tweenActiveRef.current) return;
      // An active drag session owns the scroll position — a scrollend firing
      // mid-hold (the pointer paused, or a mid-enter grab just jumped the
      // scroll) must not dismiss or promote anything under the user's finger.
      // resolveDrag settles on release.
      if (dialogRef.current?.hasAttribute("data-scrollsheet-dragging")) return;
      // A live wheel session owns its outcome: endWheelSession dismisses or
      // re-tweens after the idle gap, and scrollend must not pre-empt it.
      if (dialogRef.current?.hasAttribute("data-scrollsheet-wheel-session")) return;
      const track = trackRef.current;
      if (!track) return;
      const current = ctxRef.current;
      const geometry = geometryFor(current.side);
      /* Origin attribution: a scroll excursion flagged as phantom (a
         single-event teleport with no recent input — the two factors are
         documented on PHANTOM_SCROLL_JUMP_PX) gets wound back to the
         resting detent, never judged as a dismissal or a detent change.
         A flag set by the classifier, not a bare staleness check here, is
         deliberate: input that produces no DOM input events at all — a
         screen reader's own scroll gesture, the long tail of a native
         momentum coast — still moves in trains of small steps and must
         keep dismissing exactly as before (review findings, 2026-08-16). */
      if (phantomScrollRef.current) {
        phantomScrollRef.current = false;
        const target = resolveSpec(current.activeDetent);
        if (target) {
          const raw = mapScroll(target.height, maxDetentRef.current, geometry.sign);
          if (Math.abs(track[geometry.scrollProp] - raw) > 1) {
            startTween(track, raw, geometry.axis, true);
          }
        }
        return;
      }
      const revealed = readRevealed(track, geometry, maxDetentRef.current);
      if (
        current.dismissible &&
        isBelowCloseThreshold(revealed, firstDetentRef.current, current.closeThreshold)
      ) {
        current.setOpen(false);
        return;
      }
      let nearest = nearestDetent(revealed, resolvedRef.current);
      // sequentialDetents: native scroll-snap can still resolve a fast fling
      // onto a non-adjacent stop — clamp relative to the *last settled*
      // activeDetent, not this gesture's start (settle() has no drag session
      // to read a start detent from).
      if (nearest && current.sequentialDetents) {
        nearest = clampSequentialDetent(
          nearest,
          resolveSpec(current.activeDetent)?.index ?? -1,
          resolvedRef.current,
        );
      }
      if (nearest && !Object.is(nearest.spec, current.activeDetent)) {
        current.setActiveDetent(nearest.spec);
      }
    }, [resolveSpec, startTween]);

    // ── Open sequence ────────────────────────────────────────────────────────
    React.useLayoutEffect(() => {
      if (!present || !ctx.open || phase !== "pre") return;
      const dialog = dialogRef.current;
      const track = trackRef.current;
      const panel = panelRef.current;
      if (!dialog || !track || !panel) return;
      const geometry = geometryFor(ctx.side);

      injectStyles(ctx.nonce);
      if (!overlayOpenRef.current) {
        // Snapshot focus the same instant showModal()/showPopover() would, so
        // a manual restore-fallback on close (see restoreFocusFallback)
        // targets exactly what the platform's own focus-restoration algorithm
        // would (dialog) or what we restore ourselves (popover/non-modal).
        const preOpenFocus = document.activeElement;
        previousFocusRef.current = preOpenFocus instanceof HTMLElement ? preOpenFocus : null;
        // Trigger-recorded opener wins; focus is the fallback for programmatic
        // opens and is wrong on Safari (buttons never focus on click/tap).
        openerElementRef.current = ctx.openerRef.current ?? previousFocusRef.current;
        ctx.openerRef.current = null;
        if ("showModal" in dialog) {
          if (ctx.modal) (dialog as HTMLDialogElement).showModal();
          else (dialog as HTMLDialogElement).show();
        } else {
          (dialog as HTMLDivElement & { showPopover: () => void }).showPopover();
        }
        overlayOpenRef.current = true;
      }
      measure();
      if (ctx.center) {
        // No travel: the backdrop's dim rides the state-transition CSS
        // alone, so its inputs are pinned to their settled-open values once,
        // here, instead of per travel frame. The chrome strips share the
        // same var (they render for modal themeColorDimming regardless of
        // side).
        backdropRef.current?.style.setProperty("--scrollsheet-progress", "1");
        for (const el of [backdropRef.current, topChromeRef.current, bottomChromeDimRef.current]) {
          el?.style.setProperty("--scrollsheet-dim", "1");
        }
        // The meta-tag blend is JS-only (updateTravel's apply() never runs
        // for center), so pin it to settled-open here too. The controller
        // arrives async; the creation effect re-applies for center on
        // resolve, covering an open that beats the chunk.
        themeColorRef.current?.apply(1, true);
      } else {
        const target = resolveSpec(ctx.activeDetent);
        const rawTarget = mapScroll(
          target?.height ?? maxDetentRef.current,
          maxDetentRef.current,
          geometry.sign,
        );
        jumpScroll(track, geometry.axis, rawTarget);
        updateTravel();
      }

      // Respect an explicit [autofocus] the consumer rendered; otherwise keep
      // focus on the panel so mobile keyboards don't pop unrequested.
      const active = document.activeElement;
      if (!active || active === dialog || !dialog.contains(active)) {
        panel.focus({ preventScroll: true });
      }

      // rAF starves entirely in hidden/throttled tabs (visibility: hidden means
      // no frames at all) — the timer keeps the phase machine advancing so a
      // sheet opened there isn't stuck invisible at "pre" until the tab fronts.
      const raf = requestAnimationFrame(() => {
        clearTimeout(timer);
        setPhase("opening");
      });
      const timer = setTimeout(() => {
        cancelAnimationFrame(raf);
        setPhase("opening");
      }, 64);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }, [
      present,
      ctx.open,
      phase,
      ctx.activeDetent,
      ctx.nonce,
      ctx.side,
      // ctx.side stays "bottom" across a bottom<->center flip (center is the
      // flag, not the side), so the flag must invalidate this effect itself.
      ctx.center,
      ctx.modal,
      measure,
      resolveSpec,
      updateTravel,
    ]);

    // ── Enter/exit legs ──────────────────────────────────────────────────────
    const { enterExitRef } = useEnterExitLeg({
      phase,
      setPhase,
      panelRef,
      dialogRef,
      ctxRef,
      overlayOpenRef,
      previousFocusRef,
      childCountRef,
      childProgressRef,
      detachedRef,
    });

    // ── Close request ────────────────────────────────────────────────────────
    React.useEffect(() => {
      if (!ctx.open && (phase === "opening" || phase === "open")) {
        animRef.current?.cancel();
        // Un-dim immediately so the browser chrome matches the backdrop's own
        // fade-out, rather than snapping back only once the dialog fully closes.
        themeColorRef.current?.apply(0, false);
        // Clear lingering inline recede styles (a child had been open) so the
        // exit leg's final cleanup lands on the resting rule, not a stale
        // scale/translate. Covers the parent closing while a child is still
        // open; the ordinary child-close path resets via the stack effect.
        clearRecede(panelRef.current);
        setPhase("closing");
      }
      if (ctx.open && phase === "closing") {
        // Reopened mid-exit: transition back in from wherever the panel is.
        setPhase("opening");
      }
    }, [ctx.open, phase]);

    // ── Theme-color dimming ──────────────────────────────────────────────────
    // Lives for as long as the sheet is present at all (mount through the close
    // animation), so `restore()` always fires on both close and unmount via the
    // effect cleanup — there's no separate teardown path to keep in sync.
    // The module behind the opt-in prop is code-split; kick the load at mount
    // (prop set, sheet not yet open) so it is resident before a user gesture
    // can open the sheet, instead of racing the first open.
    React.useEffect(() => {
      if (ctx.themeColorDimming) void preloadThemeColor();
    }, [ctx.themeColorDimming]);

    React.useEffect(() => {
      if (!present || !ctx.themeColorDimming) return;
      let cancelled = false;
      let controller: ThemeColorController | null = null;
      // Resolved from the mount-time preload's cached promise — a microtask,
      // not a network fetch, in every case but a defaultOpen first render.
      // The controller is only ever consumed on travel frames (themeColorRef,
      // read by updateTravel), so a late arrival degrades to the next frame
      // picking it up, never a missed teardown: cleanup runs on the same
      // closure regardless of when creation resolved.
      void preloadThemeColor().then((mod) => {
        if (cancelled || !mod) return;
        controller = mod.createThemeColorController({
          getBackdropColor: () => {
            // The attribute, not the class: the top-chrome strip shares the
            // class and would match first in document order.
            const backdrop = dialogRef.current?.querySelector("[data-scrollsheet-backdrop]");
            return backdrop ? getComputedStyle(backdrop).backgroundColor : null;
          },
          // Already resolved by measure() onto the canvas — a style.getPropertyValue
          // read, not a second getComputedStyle call.
          getPanelColor: () =>
            canvasRef.current?.style.getPropertyValue("--scrollsheet-panel-bg") || null,
          isBottomAttached: () =>
            ctxRef.current.side === "bottom" && !ctxRef.current.center && !detachedRef.current,
          getBottomChromeEl: () => bottomChromeRef.current,
          getBottomDimEl: () => bottomChromeDimRef.current,
        });
        themeColorRef.current = controller;
        // The next scroll/settle frame (already in flight from the open
        // sequence's own scrollTop assignment) calls updateTravel() and
        // applies the current progress — no initial value computed here.
        // EXCEPT center: it has no travel frames, so nothing ever applies a
        // value after this resolve. Apply settled-open unconditionally —
        // this effect only runs while the sheet is present, and dimming a
        // frame before "opening" matches the chrome strips' own pre-state
        // snap (iOS samples its backings at that exact first paint).
        if (ctxRef.current.center) controller?.apply(1, true);
      });
      return () => {
        cancelled = true;
        controller?.restore();
        themeColorRef.current = null;
      };
    }, [present, ctx.themeColorDimming]);

    useBackgroundEffect({
      present,
      backgroundEffect: ctx.backgroundEffect,
      backgroundRef: ctx.backgroundRef,
      backgroundTargetRef,
      backgroundAppliedRef,
    });

    // ── Input attribution latch ──────────────────────────────────────────────
    // Feeds the phantom-scroll classifier in the scroll engine below. Both
    // the down and the up edges stamp: a finger can rest on the sheet longer
    // than the attribution window before the flick that actually moves it,
    // and it is the release that starts the scroll whose settle needs
    // crediting. Stamping also clears a pending phantom flag — a person
    // interacting with the sheet wherever it now sits owns what happens next.
    React.useEffect(() => {
      if (!present) return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const stamp = () => {
        lastUserInputRef.current = performance.now();
        phantomScrollRef.current = false;
      };
      const opts = { capture: true, passive: true } as const;
      const events = ["pointerdown", "pointerup", "touchstart", "touchend", "wheel", "keydown"];
      for (const name of events) dialog.addEventListener(name, stamp, opts);
      return () => {
        for (const name of events) dialog.removeEventListener(name, stamp, opts);
      };
    }, [present]);

    // Input-stamp lifetime = the PRESENTATION, not the scroll-engine
    // attachment: a tap in the last session must not credit this one's
    // first phantom (review finding, live-reproduced: interact, close,
    // reopen within 1.5s, teleport — dismissed). Keyed on [present] alone,
    // NOT folded into the scroll engine below — that effect also re-runs on
    // a live ctx.center flip (desktopSide crossing while open), and wiping
    // a real recent stamp there would misclassify the user's next legit
    // jump (fix-round review finding).
    React.useEffect(() => {
      if (present) lastUserInputRef.current = 0;
    }, [present]);

    // ── Scroll engine ────────────────────────────────────────────────────────
    React.useEffect(() => {
      if (!present) return;
      // Center: the track never scrolls, and settle()'s below-threshold
      // check reads "revealed 0" as a dismiss — a stray scrollend from
      // elastic overscroll must never reach it.
      if (ctx.center) return;
      const track = trackRef.current;
      if (!track) return;
      let raf = 0;
      // Fresh observation baseline per LISTENER attachment (reopen AND a
      // live center flip): a position this listener never observed must not
      // classify the first frame it does — which also keeps the flip's own
      // corrective jumpScroll off the classifier (prev === null exemption).
      lastScrollPosRef.current = null;
      phantomScrollRef.current = false;

      const onScroll = () => {
        /* The phantom classifier (both factors documented on
           PHANTOM_SCROLL_JUMP_PX): a per-event displacement no finger step
           produces, arriving while input is stale and while no tween, drag
           session, or wheel session owns the scroll, marks this excursion
           as nobody's. settle() winds it back. Guard opt-out via the
           phantomScrollGuard prop for integrations that legitimately
           jump-scroll the track from outside the sheet's own APIs.
           Geometry read per-event: side can flip responsively without
           re-running this effect. */
        const pos = track[geometryFor(ctxRef.current.side).scrollProp];
        const prev = lastScrollPosRef.current;
        lastScrollPosRef.current = pos;
        if (
          isPhantomScrollStep(
            prev,
            pos,
            ctxRef.current.phantomScrollGuard,
            lastUserInputRef.current,
            performance.now(),
            tweenActiveRef.current,
            dialogRef.current?.hasAttribute("data-scrollsheet-dragging") ?? false,
            dialogRef.current?.hasAttribute("data-scrollsheet-wheel-session") ?? false,
          )
        ) {
          phantomScrollRef.current = true;
        }
        if (!raf) {
          raf = requestAnimationFrame(() => {
            raf = 0;
            updateTravel();
          });
        }
        if (!env().scrollend) {
          if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
          settleTimerRef.current = setTimeout(() => {
            if (phaseRef.current === "open") settle();
          }, SETTLE_FALLBACK_MS);
        }
      };
      const onScrollEnd = () => {
        if (phaseRef.current === "open") settle();
      };

      track.addEventListener("scroll", onScroll, { passive: true });
      if (env().scrollend) track.addEventListener("scrollend", onScrollEnd);
      return () => {
        track.removeEventListener("scroll", onScroll);
        track.removeEventListener("scrollend", onScrollEnd);
        if (raf) cancelAnimationFrame(raf);
        if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      };
    }, [present, ctx.center, settle, updateTravel]);

    // ── Programmatic detent travel ───────────────────────────────────────────
    React.useEffect(() => {
      if (phase !== "open") return;
      // Dev-only, piggybacked on this effect rather than its own (same
      // 'open' gate, one fewer effect wrapper): by the time phase reaches
      // 'open' the enter leg has finished, so both the css-external entry's
      // consumer-side stylesheet link and the auto entry's own on-open
      // injectStyles() call (in the open-sequence effect above, well before
      // this one) have had every chance to take effect — no raf needed on
      // top of that, a plain effect already runs after React's paint.
      // --scrollsheet-dur is set unconditionally on every .scrollsheet-dialog
      // rule in core.css, so an empty read means the stylesheet never loaded,
      // not a themed override shadowing it. Unset is exactly "" per the
      // CSSOM custom-property spec (a set-but-unusual value would still come
      // back non-empty, leading space and all), so no .trim() is needed.
      if (
        process.env.NODE_ENV !== "production" &&
        dialogRef.current &&
        !getComputedStyle(dialogRef.current).getPropertyValue("--scrollsheet-dur")
      ) {
        warnCoreStylesMissing();
      }
      // A drag session in progress owns the scroll position — this effect can
      // fire mid-drag (the mid-enter grab flips phase to 'open' from inside
      // pointerdown, with the scroll handed off away from the detent target),
      // and a tween here would fight the user's finger. resolveDrag tweens to
      // a detent on release regardless.
      if (dialogRef.current?.hasAttribute("data-scrollsheet-dragging")) return;
      const track = trackRef.current;
      if (!track) return;
      const geometry = geometryFor(ctxRef.current.side);
      const target = resolveSpec(ctx.activeDetent);
      if (!target) return;
      const rawTarget = mapScroll(target.height, maxDetentRef.current, geometry.sign);
      if (Math.abs(track[geometry.scrollProp] - rawTarget) <= 2) return;
      animRef.current?.cancel();
      startTween(track, rawTarget, geometry.axis);
    }, [ctx.activeDetent, phase, resolveSpec, startTween]);

    useContentMorph({
      phase,
      phaseRef,
      bodyRef,
      trackRef,
      ctxRef,
      fill,
      maxDetentRef,
      animRef,
      measure,
      resolveSpec,
      syncSnapStops,
      startTween,
    });

    useKeyboardViewport({
      present,
      // Center rides the inert "bottom" here ON PURPOSE and it is
      // load-bearing: the hook's isBottom path writes --scrollsheet-vv-top/
      // -vv-height, which the base track rule sizes off — without them a
      // center dialog's grid box would size against the full layout viewport
      // instead of the keyboard-shrunk visual one and miscenter under a
      // keyboard. measure()/updateTravel() have their own center gates, so
      // the detent-flavored branches downstream all no-op safely.
      side: ctx.side,
      activeDetent: ctx.activeDetent,
      dialogRef,
      panelRef,
      trackRef,
      measure,
      resolveSpec,
      resolvedRef,
      updateTravel,
      phaseRef,
      ctxRef,
      animRef,
    });

    // desktopSide re-presenting the sheet while it's already open (see the
    // hook's own doc comment for why the open-sequence effect above can't
    // cover this case alone).
    usePresentationFlip({
      present,
      phase,
      ctxRef,
      side: ctx.side,
      center: ctx.center,
      dialogRef,
      trackRef,
      backdropRef,
      topChromeRef,
      bottomChromeDimRef,
      themeColorRef,
      maxDetentRef,
      animRef,
      measure,
      resolveSpec,
      updateTravel,
    });

    useOverlayScrollbar({ present, scrollbar: ctx.scrollbar, panelRef, scrollbarRef });
    useBodyFreeze(present && ctx.modal);
    useNestedScrollbars({ present, scrollbar: ctx.scrollbar, dialogRef });

    // ── Nested-scroll handoff ────────────────────────────────────────────────
    // [data-scrollsheet-nested-scroll] descendants of the body already receive
    // touch scroll directly (no CSS change needed for that half — see
    // core.css). This effect watches marked elements' own top boundary and
    // toggles data-scrollsheet-at-nested-boundary on the dialog, which
    // re-admits the track/canvas touch-action core.css otherwise blocks under
    // handleOnly/disableDrag — the SAME swipe then continues as sheet travel
    // via native scroll-snap, no manual delta-tracking.
    //
    // Delegated, not per-node: every listener lives on the dialog itself
    // (present for the whole session — [present] is the only dep) and
    // resolves the marked element per event via
    // event.target.closest("[data-scrollsheet-nested-scroll]"). A content
    // morph that adds, removes, or replaces marked elements needs no re-wiring
    // — there is nothing wired to a specific node to begin with, so a session
    // that opens with zero marked elements still picks up ones a later morph
    // adds. `scroll` doesn't bubble, so it's listened for in the CAPTURE phase
    // on the dialog (capture still reaches non-bubbling events on their way
    // down to the target).
    //
    // Gating is per-gesture, not per-rest-state: touch-action is an ancestor
    // property (setting it on track/canvas affects EVERY touch landing inside
    // them, not just the one over the nested element), so the only way to keep
    // handleOnly/disableDrag's "touch anywhere is not a sheet drag" guarantee
    // intact elsewhere is to only ever flip the attribute while a live touch
    // sequence that STARTED inside a marked element is in flight. touchstart
    // opens that element's gesture window (evaluating the boundary right away,
    // so a list already at rest at touchstart hands off immediately — correct,
    // that's "reveal more sheet" from the first pixel).
    //
    // Gesture windows are tracked by Touch.identifier, not by a global
    // "any touch still down" count — the earlier count-based gate let an
    // unrelated concurrent touch (e.g. a simultaneous handle drag with a
    // second finger) keep a lifted finger's window alive, a 3-touch exploit
    // of the same "touch anywhere becomes a sheet drag" defeat this effect
    // exists to prevent. `touchOwner` maps each active identifier to the
    // element its touchstart landed in; `activeCount` refcounts how many of
    // an element's own touches are still down. An element's boundary
    // participation ends exactly when ITS OWN last tracked touch ends,
    // independent of any other finger touching anywhere else.
    //
    // A morph can remove a marked element mid-gesture without firing any
    // further touch/scroll event for it — touch events have no spec'd
    // retargeting for a detached target (unlike pointer events), and WebKit
    // has historically dropped them outright, so a purely reactive sweep
    // (only running when the next event happens to fire) can leave the
    // attribute stuck ON for the rest of the session on iOS, our primary
    // platform. A MutationObserver on the dialog subtree re-runs
    // applyBoundaryState (which sweeps every tracking structure for
    // disconnected elements) on any childList removal, so cleanup doesn't
    // depend on another event ever arriving.
    //
    // Shadow-DOM-nested scrollers are out of scope for v1: `scroll` doesn't
    // compose across a shadow boundary and touch-event retargeting hides a
    // shadow root's interior from a light-DOM closest() walk.
    React.useEffect(() => {
      if (!present) return;
      const dialog = dialogRef.current;
      if (!dialog) return;

      const NESTED_SELECTOR = "[data-scrollsheet-nested-scroll]";
      const touchOwner = new Map<number, HTMLElement>();
      const activeCount = new Map<HTMLElement, number>();
      const atBoundary = new Set<HTMLElement>();

      const sweepDisconnected = () => {
        for (const [id, el] of touchOwner) {
          if (!el.isConnected) touchOwner.delete(id);
        }
        for (const el of activeCount.keys()) {
          if (!el.isConnected) activeCount.delete(el);
        }
        for (const el of atBoundary) {
          if (!el.isConnected) atBoundary.delete(el);
        }
      };

      const applyBoundaryState = () => {
        sweepDisconnected();
        const has = atBoundary.size > 0;
        setBoolAttr(dialog, "data-scrollsheet-at-nested-boundary", has);
      };

      const evaluate = (el: HTMLElement) => {
        if (!el.isConnected) {
          atBoundary.delete(el);
          applyBoundaryState();
          return;
        }
        const at = isAtScrollBoundary(el, "top");
        if (at === atBoundary.has(el)) return;
        if (at) atBoundary.add(el);
        else atBoundary.delete(el);
        applyBoundaryState();
      };

      const onTouchStart = (event: TouchEvent) => {
        // A touchend the browser never delivered (WebKit drops events whose
        // target was removed) leaves a stale identifier pinning a window open;
        // reconcile against the live touch list before opening new windows.
        if (touchOwner.size > 0) {
          const live = new Set(Array.from(event.touches, (t) => t.identifier));
          let swept = false;
          for (const [id, el] of touchOwner) {
            if (live.has(id)) continue;
            touchOwner.delete(id);
            swept = true;
            const remaining = (activeCount.get(el) ?? 1) - 1;
            if (remaining <= 0) {
              activeCount.delete(el);
              atBoundary.delete(el);
            } else {
              activeCount.set(el, remaining);
            }
          }
          if (swept) applyBoundaryState();
        }
        for (const touch of Array.from(event.changedTouches)) {
          const el = (touch.target as Element | null)?.closest<HTMLElement>(NESTED_SELECTOR);
          if (!el) continue;
          touchOwner.set(touch.identifier, el);
          activeCount.set(el, (activeCount.get(el) ?? 0) + 1);
          evaluate(el);
        }
      };

      const onTouchEnd = (event: TouchEvent) => {
        for (const touch of Array.from(event.changedTouches)) {
          const el = touchOwner.get(touch.identifier);
          if (el === undefined) continue;
          touchOwner.delete(touch.identifier);
          const remaining = (activeCount.get(el) ?? 1) - 1;
          if (remaining <= 0) {
            activeCount.delete(el);
            if (atBoundary.delete(el)) applyBoundaryState();
          } else {
            activeCount.set(el, remaining);
          }
        }
      };

      const onScroll = (event: Event) => {
        if (activeCount.size === 0) return; // hot path: skip closest() on every ordinary scroll tick
        const el = (event.target as Element | null)?.closest<HTMLElement>(NESTED_SELECTOR);
        if (!el || !activeCount.has(el)) return;
        evaluate(el);
      };

      const observer = new MutationObserver((records) => {
        if (touchOwner.size === 0 && atBoundary.size === 0) return;
        for (const record of records) {
          if (record.removedNodes.length > 0) {
            applyBoundaryState();
            return;
          }
        }
      });
      observer.observe(dialog, { childList: true, subtree: true });

      dialog.addEventListener("touchstart", onTouchStart, { passive: true });
      dialog.addEventListener("touchend", onTouchEnd, { passive: true });
      dialog.addEventListener("touchcancel", onTouchEnd, { passive: true });
      dialog.addEventListener("scroll", onScroll, { passive: true, capture: true });

      return () => {
        observer.disconnect();
        dialog.removeEventListener("touchstart", onTouchStart);
        dialog.removeEventListener("touchend", onTouchEnd);
        dialog.removeEventListener("touchcancel", onTouchEnd);
        dialog.removeEventListener("scroll", onScroll, true);
        dialog.removeAttribute("data-scrollsheet-at-nested-boundary");
      };
    }, [present]);

    useDragEngine({
      present,
      dialogRef,
      trackRef,
      panelRef,
      ctxRef,
      phaseRef,
      enterExitRef,
      animRef,
      maxDetentRef,
      firstDetentRef,
      resolvedRef,
      detachedRef,
      setPhase,
      resolveSpec,
      startTween,
    });

    useCloseWatcher({
      present,
      nonModal,
      escapeDismissible: ctx.escapeDismissible,
      onClose: () => ctx.setOpen(false),
    });

    // ── Unmount safety ───────────────────────────────────────────────────────
    React.useEffect(() => {
      return () => {
        animRef.current?.cancel();
        enterExitRef.current?.cancel();
        const dialog = dialogRef.current;
        if (dialog && overlayOpenRef.current) {
          if ("showModal" in dialog) (dialog as HTMLDialogElement).close();
          else (dialog as HTMLDivElement & { hidePopover: () => void }).hidePopover();
          overlayOpenRef.current = false;
        }
        clearRecede(panelRef.current);
      };
    }, []);

    if (degraded) {
      // Null until the mount-time preload resolves (a microtask on the
      // platforms that need it) — the modal appears then, same as any
      // state-driven open. The forwarded ref reaches the fallback panel so
      // compat layers that bridge attributes off the panel node (Dialog's
      // data-state) keep working on this path.
      if (!LoadedFallbackSheet) return null;
      return (
        <LoadedFallbackSheet
          ref={composedPanelRef}
          side={ctx.center ? "center" : ctx.side}
          modal={ctx.modal !== false}
          backdropDismissible={ctx.backdropDismissible}
          escapeDismissible={ctx.escapeDismissible}
          onDismiss={() => ctx.setOpen(false)}
          labelledBy={ctx.hasTitle ? ctx.titleId : undefined}
          describedBy={ctx.hasDescription ? ctx.descriptionId : undefined}
          className={className}
          panelProps={panelProps}
        >
          {children}
        </LoadedFallbackSheet>
      );
    }

    if (!present) return null;

    const usePopover = nonModal && hasPopoverSupport();

    const setDialogRef = (node: Overlay | null) => {
      dialogRef.current = node;
    };

    // Painted only for engines that derive browser-chrome color by sampling
    // fixed/sticky elements at the viewport edge rather than reading <meta
    // name="theme-color"> — see theme-color.ts's module doc comment. A
    // sibling of the dialog (portaled alongside it below, in the same call),
    // never nested inside its overflow:clip track/canvas, so its own
    // position:fixed is never ambiguous with the scroll-driven reveal
    // mechanism. No background-color set here — the CSS default IS
    // transparent, and theme-color.ts is the only writer of that property
    // from here on, only while a bottom-anchored, non-detached sheet is
    // open. Scoped to side==='bottom' at the JSX level (detached is a
    // runtime-only signal, checked inside theme-color.ts instead).
    const bottomChromeSentinel =
      ctx.themeColorDimming && ctx.side === "bottom" && !ctx.center ? (
        // Sizing lives in core.css (.scrollsheet-bottom-sentinel — see its
        // comment for the iOS keyboard-snapshot constraint); theme-color.ts
        // paints the background.
        <div ref={bottomChromeRef} aria-hidden="true" className="scrollsheet-bottom-sentinel" />
      ) : null;

    // Overlays the panel's bottom edge in keyboard mode (display:none
    // otherwise, see core.css): content dissolves into the panel surface
    // just above the keyboard cut instead of slicing against the bar. A
    // canvas-level sibling, not a panel child — the panel is the scroller
    // there, and nothing inside a scroller can pin to its visible edge.
    const kbFadeEl =
      ctx.side === "bottom" && !ctx.center ? (
        <div className="scrollsheet-kb-fade" aria-hidden="true" />
      ) : null;

    const chromeStrips = !nonModal && ctx.themeColorDimming;
    const innerContent = (
      <>
        {/* Chrome strips: slices of backdrop snapped to their target dim
            with no opening fade (core.css), because iOS samples its
            status-bar and bottom-bar backings around the first paint after
            showModal() and never resamples — a backdrop still fading from 0
            latches an UNDIMMED backing. Shared class keeps state rules,
            the scroll timeline, and consumer overrides applying to all
            three; core.css offsets the real backdrop's edges past them so
            alphas never stack. */}
        {chromeStrips && (
          <div
            ref={topChromeRef}
            aria-hidden="true"
            className="scrollsheet-backdrop scrollsheet-top-chrome"
          />
        )}
        {/* Hidden by theme-color.ts while the bottom sentinel's panel match
            owns that edge instead. */}
        {chromeStrips && (
          <div
            ref={bottomChromeDimRef}
            aria-hidden="true"
            className="scrollsheet-backdrop scrollsheet-bottom-chrome"
          />
        )}
        {!nonModal && (
          <div ref={backdropRef} className="scrollsheet-backdrop" data-scrollsheet-backdrop />
        )}
        <div
          ref={trackRef}
          className="scrollsheet-track"
          role="presentation"
          onClick={(event) => {
            if (!ctx.backdropDismissible) return;
            if (event.target === trackRef.current || event.target === canvasRef.current) {
              ctx.setOpen(false);
            }
          }}
        >
          <div ref={setCanvasNode} className="scrollsheet-canvas">
            {(() => {
              // A Fragment (`<>...</>`) still passes React.isValidElement — its
              // `.type` is the Fragment symbol, not a real tag/component — so
              // that's excluded explicitly. Only a genuine single non-Fragment
              // element child is a safe target for Slot's cloneElement merge
              // below, so this is the one check both branches share. Narrowing
              // it into `validChild` (rather than a plain boolean) keeps
              // `children`'s element type visible at every use site below.
              const validChild =
                asChild && React.isValidElement(children) && children.type !== React.Fragment
                  ? children
                  : null;
              if (asChild && !validChild) warnContentAsChildInvalidChild();
              const panelBody = (
                <StackContext.Provider value={stackValue}>
                  <div
                    ref={bodyRef}
                    className="scrollsheet-body"
                    data-scrollsheet-body
                    data-scrollsheet-fill={fill ? "" : undefined}
                  >
                    {/* asChild hoists the consumer element's own children here — the body wrapper is structural, not the consumer's to own. */}
                    {validChild
                      ? (validChild.props as { children?: React.ReactNode }).children
                      : children}
                  </div>
                </StackContext.Provider>
              );
              const scrollbarEl = ctx.scrollbar === "overlay" && (
                <div ref={scrollbarRef} className="scrollsheet-scrollbar" aria-hidden="true" />
              );
              // Invalid (or absent) asChild children degrade to the default
              // panel <div> below — asChild ignored for this render — instead
              // of handing Slot a synthetic Fragment it would happily
              // cloneElement onto, which drops the composed ref and logs
              // invalid-DOM-attribute warnings for every merged prop.
              const PanelComp: React.ElementType = validChild ? Slot : "div";
              const panelChildren = validChild ? (
                React.cloneElement(validChild, undefined, panelBody, scrollbarEl)
              ) : (
                <>
                  {panelBody}
                  {scrollbarEl}
                </>
              );
              return (
                <PanelComp
                  role="document"
                  tabIndex={-1}
                  {...panelProps}
                  aria-label={undefined}
                  ref={composedPanelRef}
                  className={className ? `scrollsheet-panel ${className}` : "scrollsheet-panel"}
                  data-scrollsheet-panel
                  data-scrollsheet-fill={fill ? "" : undefined}
                >
                  {panelChildren}
                </PanelComp>
              );
            })()}
            {kbFadeEl}
          </div>
        </div>
      </>
    );

    // One attribute set, three host elements: every render branch spreads
    // this, so a change to any shared attribute is a one-place edit.
    const sharedProps = {
      className: "scrollsheet-dialog",
      "data-scrollsheet-state": phase,
      "data-scrollsheet-side": ctx.center ? "center" : ctx.side,
      "data-scrollsheet-sda": sda ? "" : undefined,
      "data-scrollsheet-scrollbar": ctx.scrollbar,
      "data-scrollsheet-handle-only": ctx.handleOnly ? "" : undefined,
      "data-scrollsheet-disable-drag": ctx.disableDrag ? "" : undefined,
      "data-scrollsheet-behind": childCount > 0 ? "" : undefined,
      "aria-labelledby": ctx.hasTitle ? ctx.titleId : undefined,
      "aria-describedby": ctx.hasDescription ? ctx.descriptionId : undefined,
      "aria-label": !ctx.hasTitle ? panelProps["aria-label"] : undefined,
    } as const;

    if (!nonModal) {
      return createPortal(
        <>
          {bottomChromeSentinel}
          <dialog
            ref={setDialogRef}
            {...sharedProps}
            // Feature-detected: unsupported engines (Safari as of mid-2026) get
            // no attribute at all. Never "any" — see resolveClosedBy's doc
            // comment for why. The cancel/close handlers below are unchanged
            // either way; this only changes which platform signals reach them.
            closedby={hasClosedBySupport() ? resolveClosedBy(ctx.escapeDismissible) : undefined}
            onCancel={(event) => {
              // 'cancel' doesn't bubble in the DOM, but React still replays it up
              // the *component* tree — so a nested <Sheet.Content> dialog's Esc
              // reaches an ancestor sheet's onCancel too. Only react to the event
              // when this dialog is the one that actually fired it.
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              if (ctx.escapeDismissible) ctx.setOpen(false);
            }}
            onClose={(event) => {
              // Same non-bubbling-but-tree-replayed quirk as onCancel above.
              if (event.target !== event.currentTarget) return;
              // The platform closed us directly (form method="dialog", etc.).
              if (phaseRef.current !== "closing" && phaseRef.current !== "pre") {
                overlayOpenRef.current = false;
                restoreFocusFallback(previousFocusRef.current);
                previousFocusRef.current = null;
                ctx.setOpen(false);
                setPhase("pre");
                // This path never reaches the exit leg (the platform already
                // removed the dialog — there is nothing left to animate), so
                // the leg's own completion callback can't fire for it.
                ctx.onOpenChangeComplete?.(false);
              }
            }}
          >
            {innerContent}
          </dialog>
        </>,
        document.body,
      );
    }

    // Non-modal: Esc only closes when focus is inside the sheet (this handler
    // only ever fires for keydowns whose target is this subtree), and there's
    // no native cancel/close event to react to — every close path here is
    // this library's own (Sheet.Close, consumer state, or this Esc handler).
    const onNonModalKeyDown = (event: React.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The topmost sheet owns Esc, dismissible or not — matching the native
      // dialog stack, where cancel fires on the top dialog only. The keydown
      // replays up the COMPONENT tree (portals propagate through it), so
      // without a claim one Esc closes every ancestor non-modal sheet too.
      // Claimed via a stamp on the native event, NOT stopPropagation: the
      // replay is a React artifact, and stopping real DOM propagation would
      // silently eat the keystroke for a consumer's own document-level
      // Escape listener whenever focus sits inside any non-modal sheet.
      const native = event.nativeEvent as KeyboardEvent & { [ESC_CLAIMED]?: boolean };
      if (native[ESC_CLAIMED]) return;
      native[ESC_CLAIMED] = true;
      if (ctx.escapeDismissible) {
        event.preventDefault();
        ctx.setOpen(false);
      }
    };

    if (usePopover) {
      return createPortal(
        <>
          {bottomChromeSentinel}
          <div
            // biome-ignore lint: popover is a valid global attribute (Baseline
            // widely available); @types/react may lag behind the DOM spec.
            popover="manual"
            ref={setDialogRef}
            {...sharedProps}
            data-scrollsheet-modal="false"
            role="dialog"
            aria-modal="false"
            onKeyDown={onNonModalKeyDown}
          >
            {innerContent}
          </div>
        </>,
        document.body,
      );
    }

    // Fallback for platforms with <dialog> but no Popover API: a non-modal
    // dialog (`.show()`, not `.showModal()`) is not promoted to the top layer,
    // so it's subject to normal stacking-context/overflow clipping from
    // ancestors — an accepted, narrower-compat tradeoff for this rare case.
    return createPortal(
      <>
        {bottomChromeSentinel}
        <dialog
          ref={setDialogRef}
          {...sharedProps}
          data-scrollsheet-modal="false"
          role="dialog"
          aria-modal="false"
          onKeyDown={onNonModalKeyDown}
        >
          {innerContent}
        </dialog>
      </>,
      document.body,
    );
  },
);
