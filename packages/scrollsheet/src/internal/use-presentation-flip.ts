import * as React from "react";

import type { SheetContextValue } from "../context";
import type {
  geometryFor as geometryForFn,
  mapScroll as mapScrollFn,
  Side,
} from "../motion/geometry";
import type { ScrollAnimation } from "../motion/scroll-animator";
import type { DetentSpec, ResolvedDetent } from "./detents";
import type { ThemeColorController } from "./theme-color";
import type { jumpScroll as jumpScrollFn, Phase } from "./content-helpers";

export interface UsePresentationFlipInput {
  present: boolean;
  phase: Phase;
  ctxRef: React.RefObject<SheetContextValue>;
  /** Resolved side/center — root.tsx's desktopSide/breakpoint output. */
  side: Side;
  center: boolean;
  dialogRef: React.RefObject<HTMLElement | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  backdropRef: React.RefObject<HTMLDivElement | null>;
  topChromeRef: React.RefObject<HTMLDivElement | null>;
  bottomChromeDimRef: React.RefObject<HTMLDivElement | null>;
  themeColorRef: React.RefObject<ThemeColorController | null>;
  maxDetentRef: React.RefObject<number>;
  animRef: React.RefObject<ScrollAnimation | null>;
  measure: (rebuildSnapStops?: boolean) => void;
  resolveSpec: (spec: DetentSpec) => ResolvedDetent | undefined;
  updateTravel: () => void;
  /** Core helpers arrive as props: a static value edge would chain this
   *  lazy chunk back to the core (lazy-chunk-imports.test.ts). */
  geometryFor: typeof geometryForFn;
  mapScroll: typeof mapScrollFn;
  jumpScroll: typeof jumpScrollFn;
}

/**
 * Live desktopSide flips while open: the open-sequence effect only sets up
 * geometry at phase "pre" (it owns focus/showModal, which must never replay
 * on a flip), so this narrower re-jump handles flips landing after that.
 * The `applied` marker keeps ordinary opens from re-jumping; a mid-leg flip
 * reconciles at "open"; first mounting while already "open" (the chunk
 * resolving after a fast first open) records the current presentation as
 * applied.
 *
 * The re-present runs a microtask AFTER the commit, not in this child's own
 * layout effect: as a lazy-chunk component its layout effects run before
 * Content's, and measure() against the mid-flip DOM (body still
 * center-styled) resolves zero detents. The microtask lands after every
 * layout effect and before paint, so the flip stays visually instant.
 */
export function usePresentationFlip({
  present,
  phase,
  ctxRef,
  side,
  center,
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
  geometryFor,
  mapScroll,
  jumpScroll,
}: UsePresentationFlipInput): void {
  const appliedRef = React.useRef<{ side: Side; center: boolean } | null>(
    phase === "open" ? { side, center } : null,
  );

  React.useLayoutEffect(() => {
    if (phase === "pre") appliedRef.current = { side, center };
  }, [phase, side, center]);

  React.useLayoutEffect(() => {
    if (!present || phase !== "open") return;
    const applied = appliedRef.current;
    if (applied && applied.side === side && applied.center === center) return;
    queueMicrotask(() => {
      // Re-check: a rapid second flip or a close may have landed meanwhile.
      const current = appliedRef.current;
      if (current && current.side === side && current.center === center) return;
      // A drag or wheel session owns the scroll position — resolveDrag /
      // endWheelSession re-target against the by-then-current side on their
      // own completion, same pair of guards settle() uses.
      if (dialogRef.current?.hasAttribute("data-scrollsheet-dragging")) return;
      if (dialogRef.current?.hasAttribute("data-scrollsheet-wheel-session")) return;
      const track = trackRef.current;
      if (!track) return;
      appliedRef.current = { side, center };
      measure();
      if (center) {
        backdropRef.current?.style.setProperty("--scrollsheet-progress", "1");
        for (const el of [backdropRef.current, topChromeRef.current, bottomChromeDimRef.current]) {
          el?.style.setProperty("--scrollsheet-dim", "1");
        }
        // Same pin the open sequence's center branch makes: center has no
        // travel frames, so nothing else ever applies the meta blend.
        themeColorRef.current?.apply(1, true);
        return;
      }
      const geometry = geometryFor(side);
      const target = resolveSpec(ctxRef.current.activeDetent);
      const rawTarget = mapScroll(
        target?.height ?? maxDetentRef.current,
        maxDetentRef.current,
        geometry.sign,
      );
      animRef.current?.cancel();
      jumpScroll(track, geometry.axis, rawTarget);
      updateTravel();
    });
  }, [
    present,
    phase,
    side,
    center,
    measure,
    resolveSpec,
    updateTravel,
    geometryFor,
    mapScroll,
    jumpScroll,
  ]);
}

/** Null-rendering mount surface for the lazy chunk. */
export function PresentationFlipFeature(props: UsePresentationFlipInput): null {
  usePresentationFlip(props);
  return null;
}
