"use client";

/**
 * Per-row swipe-to-dismiss for the new shell — 2-axis, direction-locked,
 * dampened against a disallowed direction, dismissing on either a distance
 * threshold or a velocity flick. See ./swipe-math.ts for the pure math this
 * wraps (ported from real Sonner's own Toast component,
 * ~/code/references/sonner/src/index.tsx:310-427) and the port design's
 * Swipe section for the port's own rationale.
 *
 * Same direct-DOM-write contract the old (Sheet-backed) use-toast-swipe.ts
 * already established: pointer handlers write --scrollsheet-toast-swipe-x/-y
 * straight onto the row element, no React state per move. "Live" (transition:none,
 * mid-gesture) is toggled via data-swiping="true"/"false" instead of that
 * file's bare-presence data-sonner-swiping — this shell's own unprefixed,
 * literal-valued attribute convention (toast-row.tsx's own motionAttrs),
 * not the old prefixed/presence-based one, and it's what lets a consumer's
 * CSS written against real Sonner's own [data-swiping='true'] selector work
 * unmodified against this shell.
 */

import * as React from "react";
import { prefersReducedMotion } from "../../internal/env";
import type { SwipeDirection } from "../state";
import {
  computeSwipeAxisAmount,
  isSwipeReleaseAllowed,
  lockSwipeAxis,
  resolveSwipeOutDirection,
  shouldDismissOnSwipeRelease,
} from "./swipe-math";

export interface ToastSwipeHandlers {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
}

interface SwipeAmount {
  x: number;
  y: number;
}

const ZERO_AMOUNT: SwipeAmount = { x: 0, y: 0 };

/**
 * `elRef` is the row's own DOM node (direct style/attribute target).
 * `enabled` gates the whole gesture — the caller computes it the same way
 * the old Toaster's own ToastRow did (`!removed && dismissible &&
 * record.type !== "loading"`), matching real Sonner's own
 * `disabled = toastType === 'loading'` / `!dismissible` gate
 * (index.tsx:147/317). `directions` is this row's own already-resolved
 * swipeDirections — a per-position default or the Toaster's own override,
 * resolved once by the caller (toaster-shell.tsx's PositionGroup), not
 * recomputed per row per move. `onSwipeDismiss` fires once the release CSS
 * animation ([data-swipe-out="true"]) finishes — or, under reduced motion,
 * immediately (see the release() branch below) — never synchronously on
 * threshold-cross, so the visual dismiss and the actual toast.dismiss() call
 * land on the same frame.
 */
export function useToastSwipe(
  elRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  directions: readonly SwipeDirection[],
  onSwipeDismiss: () => void,
): ToastSwipeHandlers {
  const draggingRef = React.useRef(false);
  const axisRef = React.useRef<"x" | "y" | null>(null);
  const startRef = React.useRef<SwipeAmount>(ZERO_AMOUNT);
  const amountRef = React.useRef<SwipeAmount>(ZERO_AMOUNT);
  const dragStartRef = React.useRef(0);
  const onSwipeDismissRef = React.useRef(onSwipeDismiss);
  onSwipeDismissRef.current = onSwipeDismiss;

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      // A close/action/cancel button's own click must not also arm a drag —
      // real Sonner's own guard (index.tsx:322), checked before pointer
      // capture (unlike real Sonner, which captures first regardless) so a
      // button press never has its own click retargeted by capture at all.
      if ((event.target as HTMLElement).tagName === "BUTTON") return;
      const el = elRef.current;
      if (!el) return;
      draggingRef.current = true;
      axisRef.current = null;
      amountRef.current = ZERO_AMOUNT;
      startRef.current = { x: event.clientX, y: event.clientY };
      dragStartRef.current = Date.now();
      el.setPointerCapture(event.pointerId);
      el.setAttribute("data-swiping", "true");
    },
    [enabled, elRef],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!draggingRef.current) return;
      const el = elRef.current;
      if (!el) return;
      // A text selection in progress wins over the drag — real Sonner's own
      // guard (index.tsx:374-375).
      if ((window.getSelection?.()?.toString().length ?? 0) > 0) return;

      const start = startRef.current;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (axisRef.current === null) axisRef.current = lockSwipeAxis(dx, dy);
      const axis = axisRef.current;
      if (axis === null) return;

      const raw = axis === "x" ? dx : dy;
      const resolved = computeSwipeAxisAmount(axis, raw, directions);
      const amount: SwipeAmount = axis === "x" ? { x: resolved, y: 0 } : { x: 0, y: resolved };
      amountRef.current = amount;
      if (resolved !== 0) el.setAttribute("data-swiped", "true");

      el.style.setProperty("--scrollsheet-toast-swipe-x", `${amount.x}px`);
      el.style.setProperty("--scrollsheet-toast-swipe-y", `${amount.y}px`);
    },
    [elRef, directions],
  );

  const release = React.useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const el = elRef.current;
    const axis = axisRef.current;
    axisRef.current = null;
    if (!el) return;

    if (axis === null) {
      // Never crossed the 1px lock threshold — nothing to resolve.
      el.setAttribute("data-swiping", "false");
      return;
    }

    const amount = axis === "x" ? amountRef.current.x : amountRef.current.y;
    // Same-millisecond releases (only realistically reachable from a
    // synthetic/test dispatch, never a real gesture) would otherwise divide
    // by zero — clamped to 1ms rather than porting real Sonner's own
    // unguarded division (index.tsx:339), which resolves to Infinity there.
    const elapsed = Math.max(1, Date.now() - dragStartRef.current);
    const velocity = Math.abs(amount) / elapsed;
    const allowed = isSwipeReleaseAllowed(axis, amount, directions);

    if (allowed && shouldDismissOnSwipeRelease(amount, velocity)) {
      const direction = resolveSwipeOutDirection(axis, amount);
      el.setAttribute("data-swipe-direction", direction);
      if (prefersReducedMotion()) {
        // No CSS animation plays under reduced motion (toast.css neutralizes
        // it), so no animationend event will ever fire — dismiss
        // immediately instead of waiting for one, matching the old hook's
        // own reduced-motion branch.
        el.setAttribute("data-swipe-out", "true");
        onSwipeDismissRef.current();
        return;
      }
      const onAnimEnd = () => {
        el.removeEventListener("animationend", onAnimEnd);
        onSwipeDismissRef.current();
      };
      el.addEventListener("animationend", onAnimEnd);
      el.setAttribute("data-swipe-out", "true");
      return;
    }

    // Snap back: clearing data-swiping first restores the eased `transition`
    // (toast.css), so resetting the vars to 0 right after animates smoothly
    // back to rest instead of popping.
    el.setAttribute("data-swiping", "false");
    el.setAttribute("data-swiped", "false");
    el.style.setProperty("--scrollsheet-toast-swipe-x", "0px");
    el.style.setProperty("--scrollsheet-toast-swipe-y", "0px");
  }, [elRef, directions]);

  const onPointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (elRef.current?.hasPointerCapture(event.pointerId)) {
        elRef.current.releasePointerCapture(event.pointerId);
      }
      release();
    },
    [elRef, release],
  );

  const onPointerCancel = React.useCallback(() => release(), [release]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
