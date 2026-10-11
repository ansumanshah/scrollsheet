import * as React from "react";

import type { SheetContextValue } from "../context";
import type { isAtScrollBoundary as isAtScrollBoundaryFn } from "../motion/scroll-handoff";
import type { setBoolAttr as setBoolAttrFn } from "./content-helpers";
import type {
  createThumbController as createThumbControllerFn,
  hasScrollableOverflow as hasScrollableOverflowFn,
  ThumbController,
} from "./scrollbar-layout";

/**
 * Everything a `[data-scrollsheet-nested-scroll]` descendant needs from the
 * sheet: the touch-boundary drag handoff and the managed overlay thumb. A
 * lazy feature chunk (see nested-scroll-loader.ts): the marker is opt-in, so
 * a sheet with no nested scroller never ships either hook. Import-free
 * beyond react (types aside) like every other feature chunk, so it can never
 * chain itself to the core chunk — the shared helpers arrive as props.
 */
export interface UseNestedScrollInput {
  present: boolean;
  scrollbar: SheetContextValue["scrollbar"];
  dialogRef: React.RefObject<HTMLElement | null>;
  isAtScrollBoundary: typeof isAtScrollBoundaryFn;
  setBoolAttr: typeof setBoolAttrFn;
  createThumbController: typeof createThumbControllerFn;
  hasScrollableOverflow: typeof hasScrollableOverflowFn;
}

const NESTED_SELECTOR = "[data-scrollsheet-nested-scroll]";

/**
 * Nested-scroll handoff. [data-scrollsheet-nested-scroll] descendants of the
 * body already receive touch scroll directly (no CSS change needed for that
 * half — see core.css). This effect watches marked elements' own top boundary
 * and toggles data-scrollsheet-at-nested-boundary on the dialog, which
 * re-admits the track/canvas touch-action core.css otherwise blocks under
 * handleOnly/disableDrag — the SAME swipe then continues as sheet travel via
 * native scroll-snap, no manual delta-tracking.
 *
 * Delegated, not per-node: every listener lives on the dialog itself
 * (present for the whole session — [present] is the only dep) and resolves
 * the marked element per event via
 * event.target.closest("[data-scrollsheet-nested-scroll]"). A content morph
 * that adds, removes, or replaces marked elements needs no re-wiring — there
 * is nothing wired to a specific node to begin with, so a session that opens
 * with zero marked elements still picks up ones a later morph adds. `scroll`
 * doesn't bubble, so it's listened for in the CAPTURE phase on the dialog
 * (capture still reaches non-bubbling events on their way down to the
 * target).
 *
 * Gating is per-gesture, not per-rest-state: touch-action is an ancestor
 * property (setting it on track/canvas affects EVERY touch landing inside
 * them, not just the one over the nested element), so the only way to keep
 * handleOnly/disableDrag's "touch anywhere is not a sheet drag" guarantee
 * intact elsewhere is to only ever flip the attribute while a live touch
 * sequence that STARTED inside a marked element is in flight. touchstart
 * opens that element's gesture window (evaluating the boundary right away,
 * so a list already at rest at touchstart hands off immediately — correct,
 * that's "reveal more sheet" from the first pixel).
 *
 * Gesture windows are tracked by Touch.identifier, not by a global "any
 * touch still down" count — the earlier count-based gate let an unrelated
 * concurrent touch (e.g. a simultaneous handle drag with a second finger)
 * keep a lifted finger's window alive, a 3-touch exploit of the same "touch
 * anywhere becomes a sheet drag" defeat this effect exists to prevent.
 * `touchOwner` maps each active identifier to the element its touchstart
 * landed in; `activeCount` refcounts how many of an element's own touches
 * are still down. An element's boundary participation ends exactly when ITS
 * OWN last tracked touch ends, independent of any other finger touching
 * anywhere else.
 *
 * A morph can remove a marked element mid-gesture without firing any further
 * touch/scroll event for it — touch events have no spec'd retargeting for a
 * detached target (unlike pointer events), and WebKit has historically
 * dropped them outright, so a purely reactive sweep (only running when the
 * next event happens to fire) can leave the attribute stuck ON for the rest
 * of the session on iOS, our primary platform. A MutationObserver on the
 * dialog subtree re-runs applyBoundaryState (which sweeps every tracking
 * structure for disconnected elements) on any childList removal, so cleanup
 * doesn't depend on another event ever arriving.
 *
 * Shadow-DOM-nested scrollers are out of scope for v1: `scroll` doesn't
 * compose across a shadow boundary and touch-event retargeting hides a
 * shadow root's interior from a light-DOM closest() walk.
 */
export function useNestedScrollHandoff({
  present,
  dialogRef,
  isAtScrollBoundary,
  setBoolAttr,
}: UseNestedScrollInput): void {
  React.useEffect(() => {
    if (!present) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

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
      setBoolAttr(dialog, "data-scrollsheet-at-nested-boundary", atBoundary.size > 0);
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
}

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
 * Discovery: a querySelectorAll at mount, then a MutationObserver on the dialog subtree adopts scrollers a later
 * morph adds and releases state for ones it removes (isConnected sweep, not
 * a per-node subscription — there's nothing to unwire for an element that
 * was never adopted). One delegated capture-phase 'scroll' listener drives
 * every tracked thumb; 'scroll' targets the scrolling element itself (it
 * doesn't bubble, but capture still reaches it), so no closest() walk is
 * needed the way the touch-boundary effect needs one for its own targets.
 */
export function useNestedScrollbars({
  present,
  scrollbar,
  dialogRef,
  createThumbController,
  hasScrollableOverflow,
}: UseNestedScrollInput): void {
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

/** Component form, so Content can mount it conditionally once the chunk resolves. */
export function NestedScrollFeature(props: UseNestedScrollInput): null {
  useNestedScrollHandoff(props);
  useNestedScrollbars(props);
  return null;
}
