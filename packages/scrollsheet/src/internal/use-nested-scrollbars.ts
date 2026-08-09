import * as React from "react";

import type { SheetContextValue } from "../context";
import {
  type ThumbController,
  createThumbController,
  hasScrollableOverflow,
} from "./scrollbar-layout";

export interface UseNestedScrollbarsInput {
  present: boolean;
  scrollbar: SheetContextValue["scrollbar"];
  dialogRef: React.RefObject<HTMLElement | null>;
}

const NESTED_SELECTOR = "[data-scrollsheet-nested-scroll]";

interface ScrollerState {
  thumb: HTMLDivElement;
  controller: ThumbController;
}

/**
 * scrollbar='overlay' extends the panel's own overlay thumb (see
 * use-overlay-scrollbar.ts, whose layout math this shares) to every
 * [data-scrollsheet-nested-scroll] descendant — native scrollbars are hidden
 * on those elements unconditionally by core.css (opted out for
 * scrollbar='native'); this hook is only what adds the managed thumb on top,
 * so it's a no-op for 'hidden' and 'native'.
 *
 * Discovery mirrors content.tsx's nested-scroll handoff effect: a querySelectorAll
 * at mount, then a MutationObserver on the dialog subtree adopts scrollers a
 * later morph adds and releases state for ones it removes (isConnected sweep,
 * not a per-node subscription — there's nothing to unwire for an element that
 * was never adopted). One delegated capture-phase 'scroll' listener drives
 * every tracked thumb; 'scroll' targets the scrolling element itself (it
 * doesn't bubble, but capture still reaches it), so no closest() walk is
 * needed the way the touch-boundary effect needs one for its own targets.
 */
export function useNestedScrollbars({
  present,
  scrollbar,
  dialogRef,
}: UseNestedScrollbarsInput): void {
  React.useEffect(() => {
    if (!present || scrollbar !== "overlay") return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const scrollers = new Map<HTMLElement, ScrollerState>();

    const release = (el: HTMLElement) => {
      const state = scrollers.get(el);
      if (!state) return;
      scrollers.delete(el);
      state.controller.dispose();
      state.thumb.remove();
    };

    // A scroller discovered with no overflow gets no thumb at all — unlike
    // the panel's own React-rendered thumb (always present, only its
    // visibility toggles), thumb creation here is imperative, so there's no
    // reason to inject a dormant node. A scroller whose content grows past
    // the overflow threshold only after discovery goes unnoticed until the
    // next dialog childList mutation re-triggers discover() for it.
    const adopt = (el: HTMLElement) => {
      if (scrollers.has(el) || !hasScrollableOverflow(el)) return;
      const thumb = document.createElement("div");
      thumb.className = "scrollsheet-scrollbar";
      thumb.setAttribute("data-scrollsheet-scrollbar", "");
      thumb.setAttribute("aria-hidden", "true");
      el.appendChild(thumb);
      const controller = createThumbController(el, thumb);
      scrollers.set(el, { thumb, controller });
      // Initial flash, same affordance as the panel's own thumb on appear.
      controller.flash();
    };

    const discover = () => {
      for (const el of dialog.querySelectorAll<HTMLElement>(NESTED_SELECTOR)) adopt(el);
    };

    const sweep = () => {
      for (const [el, state] of scrollers) {
        // A consumer re-render can wipe el's children (taking the injected
        // thumb with them) while el itself stays mounted — release so the
        // discover() that follows re-adopts with a fresh thumb.
        if (!el.isConnected || !state.thumb.isConnected) release(el);
      }
    };

    discover();

    const onScroll = (event: Event) => {
      if (scrollers.size === 0) return; // hot path: nothing tracked, skip the lookup
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const state = scrollers.get(target);
      if (!state) return;
      state.controller.scheduleScrollUpdate();
    };

    // adopt()'s own appendChild echoes through this observer once per new
    // thumb; discover() short-circuits on scrollers.has(el), so the echo is
    // a single bounded no-op pass. sweep() runs before discover() so a
    // child-wipe (removed + added in one batch) releases the orphaned state
    // first and re-adopts in the same tick; discover() also runs on pure
    // removals for the thumb-only-removed case.
    const observer = new MutationObserver((records) => {
      let changed = false;
      let removed = false;
      for (const record of records) {
        if (record.addedNodes.length > 0) changed = true;
        if (record.removedNodes.length > 0) {
          changed = true;
          removed = true;
        }
      }
      if (!changed) return;
      if (removed) sweep();
      discover();
    });
    observer.observe(dialog, { childList: true, subtree: true });

    dialog.addEventListener("scroll", onScroll, { passive: true, capture: true });

    return () => {
      observer.disconnect();
      dialog.removeEventListener("scroll", onScroll, true);
      for (const el of Array.from(scrollers.keys())) release(el);
    };
  }, [present, scrollbar]);
}
