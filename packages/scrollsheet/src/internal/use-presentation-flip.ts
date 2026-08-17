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
  /**
   * Core geometry/scroll helpers arrive as props, not imports: this module
   * is a lazy chunk, and a static value edge into the sheet core would chain
   * the chunk graphs back together (see lazy-chunk-imports.test.ts).
   */
  geometryFor: typeof geometryForFn;
  mapScroll: typeof mapScrollFn;
  jumpScroll: typeof jumpScrollFn;
}

/**
 * `desktopSide` can flip the resolved `side`/`center` while the sheet is
 * already fully open (a viewport crossing `desktopBreakpoint`) — a case the
 * library never had before this prop existed, since `side` was otherwise
 * fixed for a Root's whole mounted lifetime. The open-sequence effect's own
 * geometry setup only runs at `phase === "pre"` (it owns focus/showModal
 * too, which must never replay on a live flip), so a flip landing after
 * that needs this separate, narrower re-jump instead: same target math, no
 * phase/focus side effects, "re-present instantly" with no morph.
 *
 * `phase` is a real dependency: a flip that lands mid-"opening"/"closing"
 * is reconciled the moment `phase` reaches "open", not dropped. The
 * `applied` marker is what keeps the ordinary pre-opening-open transition
 * from re-jumping: the open sequence applies the current presentation at
 * "pre", this hook records it there, and a matching marker at "open" is a
 * no-op. First mounting while already "open" (the chunk resolving after a
 * fast first open) records the current presentation the same way — the open
 * sequence applied it, so it is applied.
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

  // The open sequence at "pre" always sets up the presentation current at
  // that moment — record it as applied so the settle to "open" (and every
  // ordinary open) is recognized as already reconciled.
  React.useLayoutEffect(() => {
    if (phase === "pre") appliedRef.current = { side, center };
  }, [phase, side, center]);

  React.useLayoutEffect(() => {
    if (!present || phase !== "open") return;
    const applied = appliedRef.current;
    if (applied && applied.side === side && applied.center === center) return;
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
