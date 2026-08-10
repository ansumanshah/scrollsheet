import * as React from "react";

import { createPortal } from "react-dom";
import type { Side } from "../motion/geometry";

/**
 * The no-`<dialog>` degradation path (~4% global: Opera Mini, some old in-app
 * WebViews, iOS ≤15.3).
 *
 * Everything the main path builds on is unavailable here — no top layer, so
 * no guaranteed stacking; no `showModal()`, so no native focus trap or inert
 * backdrop; and the scroll-snap track that powers detents and drag would need
 * the engine's per-frame measurement to mean anything. So this renders none
 * of it: a plain fixed-position panel, a backdrop, tap-to-close, Escape, and
 * a focus round-trip. The gestures are gone; the content is reachable and a
 * checkout still completes.
 *
 * Deliberately NOT a polyfill. It does not fake the top layer (a z-index war
 * this library would lose against arbitrary app CSS), does not trap focus
 * (a real trap needs the inert-ing `showModal()` provides, and a half-trap is
 * worse than none for screen-reader users), and does not animate. It is the
 * boring modal that always works, kept boring on purpose.
 */

/**
 * Local two-ref merge instead of slot.tsx's composeRefs: this module is a
 * lazily loaded chunk, and importing slot would drag the whole sheet-core
 * chunk into this one's static graph, which un-tree-shakes every other
 * entry that shares a chunk with it (measured: the toast shape ballooned
 * from 6.6 to 21.7 kB gzip through exactly that edge).
 */
function mergeRefs<T>(
  a: React.RefObject<T | null>,
  b: React.Ref<T> | undefined,
): React.RefCallback<T> {
  return (node) => {
    a.current = node;
    if (typeof b === "function") b(node);
    else if (b) (b as React.MutableRefObject<T | null>).current = node;
  };
}

/** Refcounted so nested degraded sheets don't fight over the body scroll lock. */
let scrollLockCount = 0;
let overflowToRestore = "";

/**
 * Innermost-first stack of open degraded sheets, behind ONE shared document
 * listener. Per-instance listeners would close the wrong sheet: document
 * listeners fire in registration order, so the outer (earlier-mounted) sheet
 * would win the keystroke and the nested one would stay open.
 */
const escapeStack: Array<() => void> = [];
let escapeListening = false;

function onDocumentEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const topmost = escapeStack[escapeStack.length - 1];
  if (!topmost) return;
  event.preventDefault();
  topmost();
}

/** Registers `handler` as the topmost Escape target; returns its remover. */
function pushEscapeHandler(handler: () => void): () => void {
  escapeStack.push(handler);
  if (!escapeListening) {
    document.addEventListener("keydown", onDocumentEscape);
    escapeListening = true;
  }
  return () => {
    const index = escapeStack.indexOf(handler);
    if (index !== -1) escapeStack.splice(index, 1);
    if (escapeStack.length === 0 && escapeListening) {
      document.removeEventListener("keydown", onDocumentEscape);
      escapeListening = false;
    }
  };
}

export interface FallbackSheetProps {
  side: Side;
  modal: boolean;
  backdropDismissible: boolean;
  escapeDismissible: boolean;
  onDismiss: () => void;
  labelledBy?: string;
  describedBy?: string;
  className?: string;
  panelProps: React.HTMLAttributes<HTMLDivElement> & { "aria-label"?: string };
  children?: React.ReactNode;
}

export const FallbackSheet = React.forwardRef<HTMLDivElement, FallbackSheetProps>(
  function FallbackSheet(
    {
      side,
      modal,
      backdropDismissible,
      escapeDismissible,
      onDismiss,
      labelledBy,
      describedBy,
      className,
      panelProps,
      children,
    },
    forwardedRef,
  ) {
    const panelRef = React.useRef<HTMLDivElement>(null);
    // Latest-ref so the Escape/backdrop handlers never close over a stale
    // callback without re-subscribing (same pattern as the main path).
    const dismissRef = React.useRef(onDismiss);
    dismissRef.current = onDismiss;

    // Style injection is the CALLER's job (content.tsx's degraded effect):
    // this module is a lazily loaded chunk, and importing styles.ts here would
    // statically chain it to the sheet-core chunk, un-tree-shaking every entry
    // that shares a chunk with it. Same constraint as mergeRefs above.

    // Focus round-trip. `showModal()` would do this natively; here it is the
    // difference between "the sheet opened" and "the sheet opened somewhere a
    // keyboard user can't reach".
    //
    // Restored synchronously in the cleanup, NOT via the main path's
    // restoreFocusFallback: that helper waits two rAFs and then only acts if
    // focus has landed on <body>/<html>/nowhere, which fits the main path
    // where the browser has already cleared it during dialog.close(). Here the
    // cleanup runs BEFORE React removes the panel from the DOM, so focus is
    // usually still on the panel at that moment — the helper's own
    // DOM-ownership check would read that as "someone else owns focus now" and
    // skip the restore. Doing it synchronously here avoids that race entirely.
    React.useEffect(() => {
      const previouslyFocused = document.activeElement;
      const panel = panelRef.current;
      panel?.focus();
      return () => {
        if (!(previouslyFocused instanceof HTMLElement)) return;
        if (!document.body.contains(previouslyFocused)) return;
        const active = document.activeElement;
        // Restore only if focus is still ours (inside the panel) or nowhere —
        // never yank it back from somewhere a consumer moved it in onOpenChange.
        const stillOurs =
          active === null ||
          active === document.body ||
          active === document.documentElement ||
          (panel !== null && panel.contains(active));
        if (!stillOurs) return;
        previouslyFocused.focus({ preventScroll: true });
      };
    }, []);

    // Escape on `document`, not as an onKeyDown on the subtree below: there is
    // no focus trap on this path (see the module comment), so Tab can carry
    // focus out of the panel into the live page — and a subtree handler would
    // then stop dismissing entirely. The main path doesn't have this problem
    // because showModal()'s `cancel` fires wherever focus is.
    React.useEffect(() => {
      if (!escapeDismissible) return;
      return pushEscapeHandler(() => dismissRef.current());
    }, [escapeDismissible]);

    // Body scroll lock, modal only — without a top layer the page behind stays
    // scrollable, and a bottom sheet over a scrolling page reads as broken.
    React.useEffect(() => {
      if (!modal) return;
      if (scrollLockCount === 0) {
        overflowToRestore = document.body.style.overflow;
        document.body.style.overflow = "hidden";
      }
      scrollLockCount += 1;
      return () => {
        scrollLockCount -= 1;
        if (scrollLockCount === 0) document.body.style.overflow = overflowToRestore;
      };
    }, [modal]);

    if (typeof document === "undefined") return null;

    return createPortal(
      <div
        className="scrollsheet-fallback"
        data-scrollsheet-fallback
        data-scrollsheet-side={side}
        data-scrollsheet-modal={modal ? undefined : "false"}
      >
        {modal && (
          <div
            className="scrollsheet-fallback-backdrop"
            data-scrollsheet-backdrop
            onClick={backdropDismissible ? () => dismissRef.current() : undefined}
          />
        )}
        <div
          {...panelProps}
          ref={mergeRefs(panelRef, forwardedRef)}
          tabIndex={-1}
          role="dialog"
          aria-modal={modal ? true : undefined}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          className={
            className ? `scrollsheet-fallback-panel ${className}` : "scrollsheet-fallback-panel"
          }
          data-scrollsheet-panel
        >
          <div className="scrollsheet-body" data-scrollsheet-body>
            {children}
          </div>
        </div>
      </div>,
      document.body,
    );
  },
);
