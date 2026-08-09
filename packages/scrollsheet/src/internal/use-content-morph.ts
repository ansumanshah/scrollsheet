import * as React from "react";

import type { SheetContextValue } from "../context";
import { geometryFor, mapScroll } from "../motion/geometry";
import type { ScrollAnimation } from "../motion/scroll-animator";
import type { DetentSpec, ResolvedDetent } from "./detents";
import { jumpScroll, type Phase } from "./content-helpers";

export interface UseContentMorphInput {
  phase: Phase;
  phaseRef: React.RefObject<Phase>;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  ctxRef: React.RefObject<SheetContextValue>;
  /** fill stretches body itself, so its box stops reflecting content — observe its children instead. */
  fill: boolean;
  maxDetentRef: React.RefObject<number>;
  animRef: React.RefObject<ScrollAnimation | null>;
  measure: (rebuildSnapStops?: boolean) => void;
  resolveSpec: (spec: DetentSpec) => ResolvedDetent | undefined;
  syncSnapStops: () => void;
  startTween: (
    track: HTMLElement,
    target: number,
    axis: "x" | "y",
    suspendSnap?: boolean,
  ) => ScrollAnimation;
}

/**
 * Animates detent travel when the panel's content height changes: switching
 * views inside the sheet springs to the new height instead of jumping.
 *
 * Not a CSS height transition, so `calc-size()`/`interpolate-size` (see
 * env.ts's `calcSize`) has no purchase here: the panel's box height is
 * `--scrollsheet-max-detent`, an explicit measured px written by measure()
 * every call, never the `auto` keyword — the visible "grow/shrink" is
 * `track.scrollTop` translating the panel within the oversized canvas (core
 * .css), and that scroll offset also has to stay the single source of truth
 * for drag/snap/nested-scroll-boundary state throughout the transition, not
 * just at its end. A native keyword-interpolated height transition would run
 * independently of that scroll position, desyncing the visual size from the
 * actual scrollable/snap geometry for the whole animation.
 */
export function useContentMorph({
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
}: UseContentMorphInput): void {
  React.useEffect(() => {
    if (phase !== "open" || typeof ResizeObserver === "undefined") return;
    const body = bodyRef.current;
    const track = trackRef.current;
    if (!body || !track) return;
    let raf = 0;

    const scheduleMorph = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (phaseRef.current !== "open") return;
        const geometry = geometryFor(ctxRef.current.side);
        const before = maxDetentRef.current;
        // false: defer the snap-stop DOM rebuild to syncSnapStops() below,
        // once the new scroll position has actually landed — see that
        // function's doc comment for why rebuilding it inline here (measure's
        // default) can misfire settle() into dismissing the sheet.
        measure(false);
        if (maxDetentRef.current === before) {
          syncSnapStops();
          return;
        }
        const target = resolveSpec(ctxRef.current.activeDetent);
        if (!target) {
          syncSnapStops();
          return;
        }
        const rawTarget = mapScroll(target.height, maxDetentRef.current, geometry.sign);
        if (Math.abs(track[geometry.scrollProp] - rawTarget) <= 2) {
          syncSnapStops();
          return;
        }
        animRef.current?.cancel();
        // Reduced motion: land on the new height in one frame instead of
        // tweening — same bookkeeping (syncSnapStops) as the animated path's
        // `finished.finally`, just not deferred behind a spring.
        const reduced =
          typeof matchMedia === "function" &&
          matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduced) {
          jumpScroll(track, geometry.axis, rawTarget);
          syncSnapStops();
          return;
        }
        // suspendSnap: true — this is the one call site that needs it (see
        // scroll-animator.ts's doc comment); the other two (Handle/keyboard
        // detent travel, drag-release) omit it deliberately.
        const animation = startTween(track, rawTarget, geometry.axis, true);
        animation.finished.finally(syncSnapStops);
      });
    };

    const observer = new ResizeObserver(scheduleMorph);
    let mutation: MutationObserver | undefined;
    if (fill) {
      // Mirrors measure()'s own switch: once fill stretches body, its box no
      // longer changes with content, so the observer watches every direct
      // child — the same set the stretch-neutralized measurement reads. A
      // single-child watch missed changes in later children (a second view
      // mounting, a list growing) and left the panel at a stale height.
      const syncObserved = () => {
        observer.disconnect();
        for (const child of body.children) observer.observe(child);
      };
      syncObserved();
      // ResizeObserver never reports for elements that weren't observed when
      // they appeared (or that left the DOM) — childList changes both re-sync
      // the watch set and are themselves content-height changes.
      mutation = new MutationObserver(() => {
        syncObserved();
        scheduleMorph();
      });
      mutation.observe(body, { childList: true });
    } else {
      observer.observe(body);
    }
    return () => {
      mutation?.disconnect();
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [phase, fill, measure, resolveSpec, syncSnapStops, startTween]);
}
