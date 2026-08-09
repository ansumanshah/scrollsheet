import * as React from "react";

import type { SheetContextValue } from "../context";
import { type AnimateHandle, animate } from "../motion/animate";
import { geometryFor, mapScroll } from "../motion/geometry";
import { scaleDismissDuration, selectEnterExitCurve } from "../motion/spring-leg";
import {
  type Overlay,
  type Phase,
  applyRecede,
  offscreenTransform,
  restingInset,
  transformSide,
  restoreFocusFallback,
} from "./content-helpers";
import { env } from "./env";

export interface UseEnterExitLegInput {
  phase: Phase;
  setPhase: (phase: Phase) => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
  dialogRef: React.RefObject<Overlay | null>;
  ctxRef: React.RefObject<SheetContextValue>;
  overlayOpenRef: React.RefObject<boolean>;
  previousFocusRef: React.RefObject<HTMLElement | null>;
  childCountRef: React.RefObject<number>;
  childProgressRef: React.RefObject<number>;
  detachedRef: React.RefObject<boolean>;
}

export interface UseEnterExitLegResult {
  /**
   * The in-flight WAAPI enter/exit leg. One owner, one slot — a new leg
   * always stop()s the previous one first. Also read by the drag engine
   * (mid-entrance-grab handoff) and unmount safety, which must thread this
   * exact ref rather than create their own.
   */
  enterExitRef: React.RefObject<AnimateHandle | null>;
}

/**
 * Drives the WAAPI spring-driven open/close animation. `data-scrollsheet-
 * state` (pre/opening/open/closing) stays the CSS hook, but the panel's own
 * travel is a WAAPI leg, not a CSS transition: the leg's `finished` promise
 * (not a duration+50ms guess) advances the phase and fires
 * `onOpenChangeComplete`. Each state's resting transform is the *end* of its
 * leg, so dropping the animation at finish (or losing WAAPI entirely)
 * degrades to an instant jump, never a stuck sheet.
 */
export function useEnterExitLeg({
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
}: UseEnterExitLegInput): UseEnterExitLegResult {
  const enterExitRef = React.useRef<AnimateHandle | null>(null);

  /**
   * Start (or retarget onto) the WAAPI enter/exit leg toward `to` (0 = open,
   * 1 = offscreen). An in-flight previous leg is stop()'d first — its
   * current position and velocity seed a fresh spring, so a reopen tapped
   * mid-close (or a close mid-open) bends the motion from where it is
   * instead of restarting cold. Reduced motion, a from≈to no-op, or a
   * platform without `linear()` easing each degrade explicitly (instant /
   * plain ease-out) rather than crashing or waiting out a full duration.
   */
  const startEnterExitLeg = React.useCallback((to: 0 | 1): AnimateHandle | null => {
    const panel = panelRef.current;
    if (!panel) return null;
    const side = ctxRef.current.side;
    const prev = enterExitRef.current;
    let from = to === 0 ? 1 : 0;
    let velocity = 0; // progress-units/sec for the new leg's spring
    if (prev && !prev.settled) {
      const s = prev.stop();
      from = s.value;
      const distance = to - from;
      velocity = Math.abs(distance) > 1e-3 ? s.velocity / distance : 0;
    }
    const reduced =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Consumer opt-out of the travel animation (--scrollsheet-travel: none),
    // for sheets whose entrance is carried by something else — a View
    // Transition morphing a thumbnail into the panel reads wrong with a
    // slide-in playing underneath it. Same degrade as reduced motion: the
    // leg still runs and settles the phase machine, in zero time.
    const noTravel =
      getComputedStyle(panel).getPropertyValue("--scrollsheet-travel").trim() === "none";
    let { curve, config } = selectEnterExitCurve({
      from,
      to,
      velocity,
      reduced,
      noTravel,
      linearEasing: env().linearEasing,
    });
    // Interrupted legs scale too, not just fresh drag-release dismissals —
    // an enter grabbed by a close is mostly hidden already, so full duration
    // there is a dead tail.
    if (to === 1 && curve.durationMs > 0) {
      // A drag-release dismiss hands over a sheet that is often already
      // mostly hidden via track scroll. The leg's translate range is the
      // full panel size, so the visible remainder vanishes early and the
      // rest of the duration is a dead tail: dialog still open, backdrop
      // lingering. Scale the leg to the actually-revealed fraction — read
      // from track scroll, not the panel rect: the closing state's resting
      // transform has already parked the rect offscreen by the time this
      // runs.
      const track = dialogRef.current?.querySelector<HTMLElement>(".scrollsheet-track");
      const geometry = geometryFor(side);
      const rect = panel.getBoundingClientRect();
      const size = geometry.axis === "x" ? rect.width : rect.height;
      if (track && size > 0) {
        const scrollSize = geometry.axis === "x" ? track.scrollWidth : track.scrollHeight;
        const clientSize = geometry.axis === "x" ? track.clientWidth : track.clientHeight;
        const range = scrollSize - clientSize;
        if (range > 0) {
          const raw = Math.min(Math.max(track[geometry.scrollProp], 0), range);
          const revealed = mapScroll(raw, range, geometry.sign);
          const fraction = Math.min(1, Math.max(0, revealed) / Math.min(size, range));
          curve = scaleDismissDuration(curve, fraction);
        }
      }
    }
    // Resolved once per leg, not per formatter call: transformSide reads
    // computed style (direction) on the desktop-drawer path, and the axis
    // must not change mid-leg anyway.
    const travelSide = transformSide(side, detachedRef.current, panel);
    // Same reason as travelSide: one computed-style read per leg, and the
    // panel's resting inset must not change mid-flight.
    const inset = restingInset(panel, travelSide);
    const handle = animate(
      panel,
      "transform",
      from,
      to,
      (v) => offscreenTransform(travelSide, v, inset),
      curve,
      config,
    );
    enterExitRef.current = handle;
    return handle;
  }, []);

  // Layout effect, not effect: the state flip re-renders with the end-state
  // resting transform, and the leg must be driving the panel before that
  // paints.
  React.useLayoutEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const to: 0 | 1 = phase === "opening" ? 0 : 1;
    // Reuse an identical in-flight leg (StrictMode re-invoke) instead of
    // stop()-freezing and restarting it.
    let leg = enterExitRef.current;
    if (!leg || leg.settled || leg.to !== to) {
      leg = startEnterExitLeg(to);
    }
    let alive = true;
    const finish = () => {
      if (!alive) return;
      alive = false;
      clearTimeout(backstop);
      // Clear any inline transform a mid-flight stop() committed — the
      // resting rule for this state holds the same end value from here on,
      // and a lingering inline freeze would override every later CSS state.
      const panel = panelRef.current;
      if (panel) panel.style.transform = "";
      if (to === 0) {
        // The leg's animation was masking any recede writes a still-open
        // child pushed while it ran (animations outrank inline styles).
        // Re-apply the child's latest *nonzero* progress now that the leg no
        // longer owns the transform. A zero progress means the child never
        // traveled — the static [data-scrollsheet-behind] CSS rule is the
        // designed recede there, and an inline scale(1) would override it.
        if (panel && childCountRef.current > 0 && childProgressRef.current > 0) {
          applyRecede(panel, ctxRef.current.side, childProgressRef.current, false);
        }
        setPhase("open");
        ctxRef.current.onOpenChangeComplete?.(true);
      } else {
        const dialog = dialogRef.current;
        if (dialog && overlayOpenRef.current) {
          if ("showModal" in dialog) (dialog as HTMLDialogElement).close();
          else (dialog as HTMLDivElement & { hidePopover: () => void }).hidePopover();
          overlayOpenRef.current = false;
        }
        restoreFocusFallback(previousFocusRef.current);
        previousFocusRef.current = null;
        setPhase("pre");
        ctxRef.current.onOpenChangeComplete?.(false);
      }
    };
    // The backstop covers a stalled WAAPI clock (throttled/occluded tab —
    // the same failure mode startTween's backstop guards) so a leg can
    // never wedge the phase machine. A grabbed leg (mid-enter pointerdown,
    // which stop()s it and flips the phase itself) unmounts this effect via
    // that flip, clearing the backstop before it could fire.
    const backstop = setTimeout(finish, (leg?.durationMs ?? 0) + 150);
    leg?.finished.then(finish);
    return () => {
      alive = false;
      clearTimeout(backstop);
    };
  }, [phase, startEnterExitLeg]);

  return { enterExitRef };
}
