import * as React from "react";

import type { SheetContextValue } from "../context";

interface Snapshot {
  users: number;
  original: {
    transform: string;
    transformOrigin: string;
    borderRadius: string;
    transition: string;
  };
}
/** Per-target, shared across every sheet driving the same wrapper. */
const SNAPSHOTS = new WeakMap<HTMLElement, Snapshot>();
/** Clears the restore transition if no transitionend arrives (nothing to animate). */
const RESTORE_FALLBACK_MS = 600;

export interface UseBackgroundEffectInput {
  present: boolean;
  backgroundEffect: SheetContextValue["backgroundEffect"];
  /** Explicit target, skipping the document-wide marker query entirely when set. */
  backgroundRef?: SheetContextValue["backgroundRef"];
  backgroundTargetRef: React.RefObject<HTMLElement | null>;
  /** Which effect updateTravel last wrote, or null if it never did. */
  backgroundAppliedRef: React.RefObject<"scale" | "parallax" | null>;
}

/**
 * Mounts/unmounts the page-wrapper background-effect target (the element
 * marked `data-scrollsheet-background`), restoring its original inline
 * styles on cleanup. This hook is the sole writer of `backgroundTargetRef`;
 * `updateTravel` in content.tsx is its only reader, applying the effect
 * every travel frame via `applyBackgroundEffect`.
 */
export function useBackgroundEffect({
  present,
  backgroundEffect,
  backgroundRef,
  backgroundTargetRef,
  backgroundAppliedRef,
}: UseBackgroundEffectInput): void {
  React.useEffect(() => {
    // Not gated on `backgroundEffect` being set: it can also resolve to
    // 'scale' by default once measure() knows the sheet is full-height, and
    // that happens after this effect runs. Only an explicit 'none' opts out
    // of even looking for a target. Nothing is written here — the restore
    // below is gated on the travel loop having actually applied something.
    if (!present || backgroundEffect === "none") return;
    // An explicit ref is unambiguous, so it skips the marker query (and the
    // attribute) entirely — the fallback stays for the implicit/attribute path.
    const target =
      backgroundRef?.current ??
      document.querySelector<HTMLElement>("[data-scrollsheet-background]");
    if (!target) return;
    backgroundTargetRef.current = target;
    // One snapshot per target, not per sheet: two sheets can legitimately
    // drive the same wrapper (an explicit prop skips the ownership check the
    // implicit default applies). Whoever arrives second would otherwise
    // snapshot the first sheet's *transformed* state as "original" and
    // restore the page to it on close, snapping the still-open sheet's
    // background out from under it. The first arrival captures, the last
    // departure restores.
    let entry = SNAPSHOTS.get(target);
    if (!entry) {
      entry = {
        users: 0,
        original: {
          transform: target.style.transform,
          transformOrigin: target.style.transformOrigin,
          borderRadius: target.style.borderRadius,
          transition: target.style.transition,
        },
      };
      SNAPSHOTS.set(target, entry);
    }
    entry.users += 1;

    return () => {
      backgroundTargetRef.current = null;
      const applied = backgroundAppliedRef.current;
      backgroundAppliedRef.current = null;
      const current = SNAPSHOTS.get(target);
      if (!current) return;
      current.users -= 1;
      if (current.users > 0) return;
      SNAPSHOTS.delete(target);
      if (!applied) return;
      const { original } = current;
      // The restore transition has to survive the current task to play at
      // all — writing `original.transition` back synchronously here would
      // overwrite it before a single frame is painted, snapping the page
      // instead of easing it out alongside the sheet's own close.
      target.style.transition =
        "transform var(--scrollsheet-dur) var(--scrollsheet-ease), border-radius var(--scrollsheet-dur) var(--scrollsheet-ease)";
      target.style.transform = original.transform;
      target.style.borderRadius = original.borderRadius;
      target.style.transformOrigin = original.transformOrigin;
      const done = () => {
        target.removeEventListener("transitionend", done);
        clearTimeout(timer);
        // Only if nothing re-claimed the target in the meantime.
        if (!SNAPSHOTS.has(target)) target.style.transition = original.transition;
      };
      const timer = setTimeout(done, RESTORE_FALLBACK_MS);
      target.addEventListener("transitionend", done);
    };
  }, [present, backgroundEffect, backgroundRef]);
}
