import * as React from "react";

import type { SheetContextValue, StackContextValue } from "../context";
import { applyRecede, clearRecede } from "./content-helpers";
import type { Phase } from "./content-helpers";

export interface UseStackRecedeInput {
  parentStack: StackContextValue | null;
  present: boolean;
  phase: Phase;
  phaseRef: React.RefObject<Phase>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  ctxRef: React.RefObject<SheetContextValue>;
  childCountRef: React.RefObject<number>;
  childProgressRef: React.RefObject<number>;
  setChildCount: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Parent-sheet recede stacking: provides `stackValue` for this sheet's own
 * `<StackContext.Provider>` (so a child sheet opened inside it can tell it
 * to recede), and separately tells *this* sheet's own parent (if any) to
 * recede while it's present.
 *
 * Gated on `present && phase !== 'closing'`, not bare `present`: the parent
 * should start un-receding the moment this sheet starts closing (its own
 * exit transform beginning), not only once it's fully unmounted — the
 * cleanup below fires exactly at that transition, unregistering this child
 * so the parent springs to the remaining children's effective recede
 * (0 when none remain, in parallel with this sheet's own exit).
 */
export function useStackRecede({
  parentStack,
  present,
  phase,
  phaseRef,
  panelRef,
  ctxRef,
  childCountRef,
  childProgressRef,
  setChildCount,
}: UseStackRecedeInput): { stackValue: StackContextValue; childKey: object } {
  // This sheet's own identity as a CHILD of its parent's registry.
  const childKeyRef = React.useRef<object>({});
  // Per-child progress, keyed by each child's stable identity. The applied
  // recede is the MAX across open children: closing one of several
  // concurrently-open children must not un-recede the parent while a sibling
  // still holds it back.
  const childrenRef = React.useRef(new Map<object, number>());
  const stackValue = React.useMemo<StackContextValue>(() => {
    const applyEffective = (live: boolean) => {
      let effective = 0;
      for (const p of childrenRef.current.values()) effective = Math.max(effective, p);
      // Always record, even when the write below is skipped — the enter/
      // exit leg's finish() re-applies the latest value once it owns the
      // panel again.
      childProgressRef.current = effective;
      // Skip while this (parent) sheet is mid-exit, not yet open, or
      // mid-leg: during 'opening'/'closing' the panel's transform belongs
      // to an active WAAPI enter/exit animation, which outranks an inline
      // write in the cascade — a recede written here would be silently
      // masked and then thrown away by the leg's cleanup.
      if (phaseRef.current !== "open") return;
      applyRecede(panelRef.current, ctxRef.current.side, effective, live);
    };
    return {
      setChildOpen: (open, key) => {
        const children = childrenRef.current;
        if (open) {
          // A previous child's close leaves inline recede styles on this
          // panel (applyRecede's cleanup call sets transform/custom
          // properties for its resting, non-live zero — indistinguishable
          // at write time from a live drag frame that happens to pass
          // through 0, so it can't skip the write instead). Those inline
          // values outrank the CSS static default
          // ([data-scrollsheet-behind] .scrollsheet-panel) in the cascade
          // and are otherwise never cleared except by this panel's own
          // clearRecede() on the *parent's* own close — wipe them here, on
          // a new FIRST child relationship, so a second (or Nth) silent
          // (no-drag) child open starts fresh from that default instead of
          // inheriting the previous child's already-settled-to-zero values.
          // Skipped while another child is live: wiping then would blink
          // that child's active recede for a frame.
          if (children.size === 0) clearRecede(panelRef.current);
          children.set(key, children.get(key) ?? 0);
        } else {
          children.delete(key);
          // Non-live so the un-recede springs — but only as far as the
          // remaining children allow (effective stays up while one is open).
          applyEffective(false);
        }
        childCountRef.current = children.size;
        setChildCount(children.size);
      },
      setChildProgress: (progress, live, key) => {
        const children = childrenRef.current;
        // Unregistered key: the child already ran its close cleanup (its
        // setChildOpen(false) both deletes AND un-recedes), or never opened.
        if (!children.has(key)) return;
        children.set(key, progress);
        applyEffective(live);
      },
    };
  }, []);

  const stackActive = present && phase !== "closing";
  React.useEffect(() => {
    if (!parentStack || !stackActive) return;
    const key = childKeyRef.current;
    parentStack.setChildOpen(true, key);
    // setChildOpen(false) both unregisters this child and re-applies the
    // remaining children's effective recede (non-live 0 when none remain).
    return () => parentStack.setChildOpen(false, key);
  }, [parentStack, stackActive]);

  return { stackValue, childKey: childKeyRef.current };
}
