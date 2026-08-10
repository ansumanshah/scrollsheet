import * as React from "react";

import type { SheetContextValue } from "../context";
import { geometryFor, mapScroll, type Side } from "../motion/geometry";
import type { ScrollAnimation } from "../motion/scroll-animator";
import type { DetentSpec, ResolvedDetent } from "./detents";
import { jumpScroll, type Phase } from "./content-helpers";

export interface UsePresentationFlipInput {
  present: boolean;
  phaseRef: React.RefObject<Phase>;
  ctxRef: React.RefObject<SheetContextValue>;
  /** Resolved side/center — root.tsx's desktopSide/breakpoint output. */
  side: Side;
  center: boolean;
  dialogRef: React.RefObject<HTMLElement | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  backdropRef: React.RefObject<HTMLDivElement | null>;
  topChromeRef: React.RefObject<HTMLDivElement | null>;
  bottomChromeDimRef: React.RefObject<HTMLDivElement | null>;
  maxDetentRef: React.RefObject<number>;
  animRef: React.RefObject<ScrollAnimation | null>;
  measure: (rebuildSnapStops?: boolean) => void;
  resolveSpec: (spec: DetentSpec) => ResolvedDetent | undefined;
  updateTravel: () => void;
}

/**
 * `desktopSide` can flip the resolved `side`/`center` while the sheet is
 * already fully open (a viewport crossing `desktopBreakpoint`) — a case the
 * library never had before this prop existed, since `side` was otherwise
 * fixed for a Root's whole mounted lifetime. The open-sequence effect's own
 * geometry setup only runs at `phase === "pre"` (it owns focus/showModal
 * too, which must never replay on a live flip), so a flip landing once the
 * sheet has settled open — the common case — needs this separate, narrower
 * re-jump instead: same target math, no phase/focus side effects,
 * "re-present instantly" with no morph.
 *
 * Deliberately keyed on `side`/`center` alone (`phase` read from the ref,
 * not a dependency): the effect only re-fires on a genuine flip, never on
 * the ordinary pre→opening→open transition every sheet already goes
 * through, so there's no redundant re-jump (and no need to guard one) on a
 * normal open. The tradeoff is a flip landing mid-transition (`phase`
 * "opening"/"closing") isn't reconciled once `phase` reaches "open" unless
 * `side`/`center` change again — narrow enough to accept: the flip's own
 * CSS attribute has already repainted correctly by then regardless.
 */
export function usePresentationFlip({
  present,
  phaseRef,
  ctxRef,
  side,
  center,
  dialogRef,
  trackRef,
  backdropRef,
  topChromeRef,
  bottomChromeDimRef,
  maxDetentRef,
  animRef,
  measure,
  resolveSpec,
  updateTravel,
}: UsePresentationFlipInput): void {
  React.useLayoutEffect(() => {
    if (!present || phaseRef.current !== "open") return;
    // A drag session owns the scroll position — resolveDrag re-targets it
    // (against the by-then-current side) on release, same guard the
    // programmatic-detent-travel effect uses for the same reason.
    if (dialogRef.current?.hasAttribute("data-scrollsheet-dragging")) return;
    const track = trackRef.current;
    if (!track) return;
    measure();
    if (center) {
      backdropRef.current?.style.setProperty("--scrollsheet-progress", "1");
      for (const el of [backdropRef.current, topChromeRef.current, bottomChromeDimRef.current]) {
        el?.style.setProperty("--scrollsheet-dim", "1");
      }
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
  }, [present, side, center, measure, resolveSpec, updateTravel]);
}
