import * as React from "react";

import type { SheetContextValue } from "../context";
import {
  FOCUS_SCROLL_DEBOUNCE_MS,
  KEYBOARD_BASELINE_MAX_PX,
  KEYBOARD_RESIZE_THRESHOLD_PX,
  type Overlay,
  type Phase,
  getVirtualKeyboardApi,
  jumpScroll,
  willOpenKeyboard,
} from "./content-helpers";
import type { DetentSpec, ResolvedDetent } from "./detents";
import type { ScrollAnimation } from "../motion/scroll-animator";

export interface UseKeyboardViewportInput {
  present: boolean;
  side: SheetContextValue["side"];
  /** Reactive (not via ctxRef): the divergence effect must observe changes. */
  activeDetent: DetentSpec;
  dialogRef: React.RefObject<Overlay | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  measure: (rebuildSnapStops?: boolean) => void;
  resolveSpec: (spec: DetentSpec) => ResolvedDetent | undefined;
  resolvedRef: React.RefObject<readonly ResolvedDetent[]>;
  updateTravel: () => void;
  phaseRef: React.RefObject<Phase>;
  ctxRef: React.RefObject<SheetContextValue>;
  animRef: React.RefObject<ScrollAnimation | null>;
}

/**
 * visualViewport pinning + software-keyboard inset. A software keyboard
 * always pushes up from the screen's bottom edge, so the concerns split by
 * side:
 *
 * Bottom sheets get the full engine — (1) track repositioning
 * (vv-top/vv-height, then measure()+jumpScroll), unconditional on focus
 * since a real resize/rotation must remeasure regardless of what's focused;
 * (2) the exposed `--scrollsheet-keyboard` inset, gated on a
 * keyboard-summoning element (willOpenKeyboard) having focus, so Safari's
 * toolbar collapse never counts as "the keyboard opened"; (3) optional
 * detent promotion (`keyboardExpands`).
 *
 * Top/left/right sheets are edge-anchored, so the panel itself never moves
 * for the keyboard — but their CONTENT can still sit under it. They get
 * concern (2) only: the inset var, which core.css turns into bottom
 * clearance on [data-scrollsheet-body] (padding) and the panel
 * (scroll-padding), so the focused field can scroll clear.
 *
 * A second, separate effect brings the focused field into view within the
 * sheet once relayout settles — every side.
 */
export function useKeyboardViewport({
  present,
  side,
  activeDetent,
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
}: UseKeyboardViewportInput): void {
  const focusedKeyboardElRef = React.useRef<HTMLElement | null>(null);
  const focusScrollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // The detent to restore once the keyboard closes, set only when
  // keyboardExpands actually promoted (null = nothing to restore), plus the
  // spec it promoted TO — the divergence effect below needs to tell "still
  // parked where the promotion put it" apart from "moved since".
  const preExpandDetentRef = React.useRef<DetentSpec | null>(null);
  const promotedSpecRef = React.useRef<DetentSpec | null>(null);

  const restorePreExpandDetent = React.useCallback(() => {
    const previous = preExpandDetentRef.current;
    const promoted = promotedSpecRef.current;
    preExpandDetentRef.current = null;
    promotedSpecRef.current = null;
    if (previous !== null && promoted !== null && ctxRef.current.activeDetent === promoted) {
      ctxRef.current.setActiveDetent(previous);
    }
  }, [ctxRef]);

  // Divergence cancels the pending restore: any activeDetent value while
  // armed that isn't the promoted spec means a drag, a controlled change, or
  // snapTo moved the sheet since the promotion — the user (or consumer) owns
  // the position now, and a later keyboard-close must not fight it. This is
  // an effect on the REACTIVE activeDetent, not a check at the falling edge:
  // the falling-edge position alone can't distinguish "never moved" from
  // "moved away and deliberately came back to the tallest detent".
  React.useEffect(() => {
    if (promotedSpecRef.current === null) return;
    if (activeDetent !== promotedSpecRef.current) {
      preExpandDetentRef.current = null;
      promotedSpecRef.current = null;
    }
  }, [activeDetent]);

  React.useEffect(() => {
    if (!present) return;
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!dialog || !panel) return;
    const isBottom = side === "bottom";
    // NOT window.innerHeight: with the body frozen (use-body-freeze), iOS
    // collapses innerHeight toward the keyboard-shrunk box while the ICB
    // keeps the true layout height — and the ICB is what every keyboard
    // estimate here measures against.
    const layoutHeight = () => document.documentElement.clientHeight || window.innerHeight;
    let raf = 0;
    // Tracks the last *committed* (post-threshold) delta, for concern #1's
    // gate only (not the keyboard inset itself, which concern #2 owns).
    let committedDelta = 0;
    // The no-keyboard gap between the layout and visual viewports. On real
    // iPhones the expanded Safari toolbar already makes vv.height smaller
    // than innerHeight before any keyboard, so `innerHeight - vv.height`
    // alone overshoots by the toolbar height and the panel lifts past the
    // keyboard, leaving a strip of page in between. Sampled only while no
    // keyboard-summoning element is focused (the keyboard can't be part of
    // the gap then) and subtracted from the armed estimate.
    let baselineDelta = 0;

    /**
     * The keyboard estimate, computed synchronously so the caller can write
     * it in the same frame as --scrollsheet-vv-height: the track's height is
     * calc(vv-height + keyboard), so writing the two on different clocks
     * shrank the track for a beat, re-resolved every
     * detent against the shrunken height, and left a stale jump behind.
     * Writing them together makes the sum invariant while the keyboard
     * animates, which also makes debouncing unnecessary. No offsetTop in
     * the estimate: iOS Safari grows offsetTop by roughly what the height
     * shrank (its focus-reveal scroll), which cancelled the keyboard out
     * entirely on device. The focus gate plus the resize threshold filter
     * toolbar collapses.
     */
    // Must run while unarmed — the keyboard can't be part of the gap then.
    // Called eagerly (setup, focusin before arming), not only from vv
    // events: with the toolbar expanded since load, no vv event ever fires
    // before the first focus, and a lazily-sampled baseline would still be
    // its initial 0. A gap over the plausible-toolbar cap is REJECTED, not
    // clamped into range: "unarmed" is a focus-tracking heuristic, not proof
    // the on-screen keyboard is actually gone — a blur that doesn't really
    // dismiss it (a re-render remounting the focused input, a validation
    // library's blur-then-refocus, an a11y tool moving focus) reports the
    // still-open keyboard's height right here. Clamping into the cap would latch a bogus
    // baseline for the session; keeping the last known-good baseline means a spurious unarm changes
    // nothing, while a real toolbar-only gap (at or under the cap) still
    // updates it exactly as before.
    const sampleBaseline = () => {
      const vv = window.visualViewport;
      if (vv && vv.scale === 1 && focusedKeyboardElRef.current === null) {
        const gap = Math.max(0, layoutHeight() - vv.height);
        if (gap <= KEYBOARD_BASELINE_MAX_PX) baselineDelta = gap;
      }
    };
    const keyboardInsetPx = (): number => {
      const vv = window.visualViewport;
      const armed = focusedKeyboardElRef.current !== null;
      if (!armed) {
        sampleBaseline();
        return 0;
      }
      const vk = getVirtualKeyboardApi();
      if (vk?.overlaysContent) return Math.round(vk.boundingRect.height);
      if (vv && vv.scale === 1) {
        const gap = Math.max(0, layoutHeight() - vv.height);
        // Self-heal downward while armed: iOS collapses the toolbar as the
        // keyboard opens, so a gap that ever drops below the sampled
        // baseline proves the baseline was measured against a taller
        // toolbar than the current one — adopt the smaller value rather
        // than undershoot the inset for the rest of the focus session.
        if (gap < baselineDelta) baselineDelta = gap;
        const rawKeyboard = gap - baselineDelta;
        if (rawKeyboard >= KEYBOARD_RESIZE_THRESHOLD_PX) return Math.round(rawKeyboard);
      }
      return 0;
    };
    sampleBaseline();

    /**
     * keyboardExpands: promote to the tallest detent on the keyboard's
     * RISING edge (inset 0 -> nonzero while armed), never on focus alone —
     * a desktop click into an input has no software keyboard and must not
     * expand anything. Bottom sheets only: other sides' detents are widths
     * or top-anchored heights, where "taller" buys the field nothing.
     * Restore is symmetric (disarm/inset gone), and any detent change that
     * isn't the promotion itself CANCELS the pending restore outright (the
     * divergence effect below) — a user who dragged away and back to the
     * tallest detent meant to be there, and must not get yanked down when
     * the keyboard closes.
     */
    const syncKeyboardExpand = (insetPx: number) => {
      if (!isBottom || !ctxRef.current.keyboardExpands) return;
      const resolved = resolvedRef.current;
      const tallest = resolved[resolved.length - 1];
      if (!tallest) return;
      if (insetPx > 0 && preExpandDetentRef.current === null) {
        const active = ctxRef.current.activeDetent;
        if (active === tallest.spec) return;
        const activeHeight = resolveSpec(active)?.height ?? 0;
        if (activeHeight >= tallest.height) return;
        preExpandDetentRef.current = active;
        promotedSpecRef.current = tallest.spec;
        ctxRef.current.setActiveDetent(tallest.spec);
      } else if (insetPx === 0 && preExpandDetentRef.current !== null) {
        restorePreExpandDetent();
      }
    };

    // Written on the DIALOG, not the track: descendants (track height, panel
    // lift, canvas overdraw, body clearance) all inherit it, and the dialog
    // needs it for its own clip box — its height is the layout viewport,
    // which ends exactly at the visual viewport's bottom edge while the
    // keyboard is up, so overflow:clip would otherwise cut the under-panel
    // overdraw away and let the page show through behind the keyboard and
    // the browser's collapsed toolbar.

    const updateKeyboardInset = () => {
      const insetPx = keyboardInsetPx();
      dialog.style.setProperty("--scrollsheet-keyboard", `${insetPx}px`);
      // Gates the panel's keyboard-mode inner scroll (see core.css).
      const wasActive = dialog.hasAttribute("data-scrollsheet-kb");
      if (insetPx > 0) dialog.setAttribute("data-scrollsheet-kb", "");
      else dialog.removeAttribute("data-scrollsheet-kb");
      // Rising edge: write --scrollsheet-kb-hang (updateTravel gates it on
      // the attribute just set) independent of relayout's significance
      // gate — on devices where offsetTop compensates the keyboard shrink,
      // rawDelta stays ~0 and that gate never opens, leaving the hang at
      // its 0px fallback and the anchor lift inert for the whole session.
      if (insetPx > 0 && !wasActive) updateTravel();
      syncKeyboardExpand(insetPx);
    };

    const relayout = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const vv = window.visualViewport;
        const track = trackRef.current;
        // Pinch-zoom: visualViewport resize/scroll also fires for scale
        // changes, which have nothing to do with the keyboard — bail rather
        // than fight an in-progress zoom gesture.
        if (vv && vv.scale !== 1) return;
        if (!isBottom) {
          // Edge-anchored sides never reposition for the keyboard; the
          // inset var (body clearance) is the whole relayout.
          updateKeyboardInset();
          return;
        }
        let significant = true;
        if (vv && track) {
          // Pin the track to the visual viewport so the keyboard never leaves a
          // gap (see core.css). Scoped to the track (its only CSS consumer) so
          // these per-frame writes don't recalc the whole sheet subtree.
          track.style.setProperty("--scrollsheet-vv-top", `${Math.round(vv.offsetTop)}px`);
          track.style.setProperty("--scrollsheet-vv-height", `${Math.round(vv.height)}px`);
          const rawDelta = Math.max(0, layoutHeight() - vv.height - vv.offsetTop);
          // Below-threshold deltas are skipped unless something was already
          // committed, so a real resize/rotation still works while toolbar-
          // animation jitter doesn't visibly snap the sheet.
          const delta =
            rawDelta < KEYBOARD_RESIZE_THRESHOLD_PX && committedDelta === 0 ? 0 : rawDelta;
          significant = delta !== 0 || committedDelta !== 0;
          committedDelta = delta;
        }
        updateKeyboardInset();
        if (!significant) return;
        measure();
        const target = resolveSpec(ctxRef.current.activeDetent);
        if (track && target && phaseRef.current === "open" && !animRef.current) {
          jumpScroll(track, "y", target.height);
        }
        updateTravel();
      });
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && willOpenKeyboard(target)) {
        // Last unarmed instant: the keyboard hasn't animated yet, so the
        // current gap is pure toolbar — capture it before arming freezes it.
        sampleBaseline();
        focusedKeyboardElRef.current = target;
        updateKeyboardInset();
      }
    };
    const onFocusOut = () => {
      // A frame's grace: if focus is moving straight to another
      // keyboard-summoning field (e.g. Tab between inputs), don't flash the
      // inset to 0 and back — check where focus actually landed once it's
      // settled, same as the reference implementation.
      requestAnimationFrame(() => {
        const active = document.activeElement;
        focusedKeyboardElRef.current =
          active instanceof HTMLElement && panel.contains(active) && willOpenKeyboard(active)
            ? active
            : null;
        updateKeyboardInset();
      });
    };

    // Overlay mode (the consumer set navigator.virtualKeyboard.overlaysContent
    // = true, opting out of the browser's own viewport resize): the keyboard
    // no longer resizes visualViewport at all, so geometrychange is the ONLY
    // signal that it opened. The library never sets overlaysContent itself —
    // that is a document-wide behavior change, the page's call to make.
    const vk = getVirtualKeyboardApi();
    panel.addEventListener("focusin", onFocusIn);
    panel.addEventListener("focusout", onFocusOut);
    vk?.addEventListener("geometrychange", relayout);
    window.addEventListener("resize", relayout);
    // `resize` fires when the keyboard's height changes; `scroll` fires when
    // only `offsetTop` shifts (e.g. iOS settling post-dismiss without a size
    // change) — both are needed or the keyboard inset can go stale.
    window.visualViewport?.addEventListener("resize", relayout);
    window.visualViewport?.addEventListener("scroll", relayout);
    return () => {
      panel.removeEventListener("focusin", onFocusIn);
      panel.removeEventListener("focusout", onFocusOut);
      vk?.removeEventListener("geometrychange", relayout);
      window.removeEventListener("resize", relayout);
      window.visualViewport?.removeEventListener("resize", relayout);
      window.visualViewport?.removeEventListener("scroll", relayout);
      if (raf) cancelAnimationFrame(raf);
      focusedKeyboardElRef.current = null;
    };
  }, [present, side, measure, resolveSpec, updateTravel]);

  // Close/teardown while promoted is a falling edge that will never arrive
  // through events — restore then, or the promoted detent leaks into the
  // sheet's NEXT open (activeDetent state lives in Root and survives Content
  // unmounting). Deliberately its own effect keyed on [present, side], NOT
  // part of the tracking effect above: that one also re-runs when a callback
  // dep changes identity, and a restore firing on a mere re-render churn
  // would yank a still-promoted sheet down mid-typing.
  React.useEffect(() => {
    if (!present || side !== "bottom") return;
    return () => {
      restorePreExpandDetent();
    };
  }, [present, side, restorePreExpandDetent]);

  // Waits for the visualViewport resize/scroll above to settle, then brings
  // the focused field into view within the sheet so it's never left under
  // the keyboard. Every side: edge-anchored panels don't move for the
  // keyboard, but their content still scrolls, and core.css's
  // scroll-padding-bottom (fed by the inset var above) makes this land the
  // field above the keyboard there too.
  React.useEffect(() => {
    if (!present) return;
    const panel = panelRef.current;
    if (!panel) return;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!willOpenKeyboard(target)) return;
      if (focusScrollTimerRef.current) clearTimeout(focusScrollTimerRef.current);
      focusScrollTimerRef.current = setTimeout(() => {
        focusScrollTimerRef.current = null;
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      }, FOCUS_SCROLL_DEBOUNCE_MS);
    };

    panel.addEventListener("focusin", onFocusIn);
    return () => {
      panel.removeEventListener("focusin", onFocusIn);
      if (focusScrollTimerRef.current) {
        clearTimeout(focusScrollTimerRef.current);
        focusScrollTimerRef.current = null;
      }
    };
  }, [present]);
}
