"use client";

/**
 * Shared infra for the sonner-architecture shell (./shell/toaster-shell.tsx),
 * which is what `Toaster` actually resolves to from ../index.tsx — this file
 * no longer defines a Toaster component itself. What lives here is the stuff
 * both the shell and its own tests need and that has nowhere more specific to
 * live: the public `ToasterProps` contract, the mount-flag/document-hidden
 * hooks the shell's rows and timers reuse, and `resolveVisibleToasts`.
 *
 * (Formerly: a non-modal Sheet.Root/Sheet.Content Toaster with a collapsed
 * front-card-plus-ghosts stack. That whole component, its ghost cards, its
 * eviction/queueing window, and its Sheet dependency are gone — see the
 * sonner-port design notes for why: real Sonner's own per-toast-absolute-
 * position DOM has no shared panel-height concept to animate, so the Sheet
 * machinery that solved that had nothing left to do.)
 */

import * as React from "react";
import { _resetWarnOnceForTests } from "../internal/dev-warn";
import { prefersReducedMotion } from "../internal/env";
import type {
  SwipeDirection,
  ToastClassnames,
  ToastData,
  ToastIcons,
  ToastPosition,
} from "./state";

export { _resetWarnOnceForTests };

/** Pure, exported for tests. @default 3, matching real Sonner's own default. */
export function resolveVisibleToasts(count: number | undefined): number {
  if (count === undefined) return 3;
  return Math.max(1, Math.floor(count));
}

export interface ToasterProps {
  /** Routes this Toaster to only the toasts created with a matching `toasterId` — omitted (the common case) renders the default, un-keyed queue. */
  id?: string;
  /** @deprecated Use `id` instead — matches real Sonner's own `Toaster` prop name. */
  toasterId?: string;
  /** Which corner (or edge-center) this Toaster's own default `<ol>` renders in. All six positions are real. @default 'bottom-right' */
  position?: ToastPosition;
  /**
   * v1 always renders the static light card real Sonner ships by default.
   * 'dark'/'system' aren't implemented yet (a v1.1 follow-up) and warn once
   * rather than silently no-op — forcing a real visual mismatch would be
   * worse than an honest warning.
   */
  theme?: "light" | "dark" | "system";
  /** Not implemented yet (v1.1) — warns once if set. */
  richColors?: boolean;
  /** Force the row list open (instead of the collapsed front-card-plus-ghosts) even without hover/focus. */
  expand?: boolean;
  /**
   * Maximum toasts visible (interactive, full opacity) at once per position
   * group. Beyond this, older toasts become hidden — `data-visible="false"`,
   * still a real DOM node, still timing — rather than evicted; nothing is
   * ever dismissed by overflow, and `dismissible: false` earns no special
   * protection (it overflows into hidden exactly like any other toast).
   * @default 3 (matches real Sonner's own visibleToasts default)
   */
  visibleToasts?: number;
  /** @default false */
  closeButton?: boolean;
  /** Milliseconds before auto-dismiss; a per-toast `duration` wins over this. @default 4000 */
  duration?: number;
  /** Gap between stacked rows, px. @default 14 */
  gap?: number;
  /** Distance from the viewport edge, px (or any CSS length). @default 24 (16 at the <600px full-bleed breakpoint) */
  offset?: number | string;
  /**
   * Which edge(s) each toast may be swiped away from, overriding the
   * per-position default (a corner position allows both its own y and x
   * edges; a *-center position only its own y edge). One setting for the
   * whole Toaster, applied uniformly to every position group it renders —
   * matches real Sonner's own single Toaster-wide `swipeDirections` prop
   * (it has no per-toast override).
   */
  swipeDirections?: readonly SwipeDirection[];
  /** Defaults merged underneath each individual `toast()` call's own options. */
  toastOptions?: Omit<ToastData, "id" | "toasterId">;
  /** Per-type icon overrides; a per-toast `icon` always wins over these. */
  icons?: ToastIcons;
  className?: string;
  style?: React.CSSProperties;
  /** Accessible name for the notifications region. @default "Notifications" */
  containerAriaLabel?: string;
  /**
   * Global keyboard shortcut that expands the stack and moves focus into it
   * — every field must be truthy on the event (a modifier like `altKey`, or
   * a `KeyboardEvent.code` match), same contract as real Sonner's own
   * `hotkey` prop. Escape while focus is inside the region collapses it
   * back. Pass `[]` to disable.
   * @default ['altKey', 'KeyT']
   */
  hotkey?: readonly string[];
  /** CSP nonce for the injected style tag. */
  nonce?: string;
  /**
   * True (the default) mirrors every neutral class and attribute with its
   * sonner-dialect twin (`.sonner-toast`, `data-sonner-*`) so CSS written
   * against real Sonner keeps matching. Set false on a fresh integration
   * with no Sonner legacy: rows render the `.scrollsheet-toast` names only.
   * @default true
   */
  sonnerCompat?: boolean;
}

/**
 * Two rAFs (not one): a single rAF after the initial style write can still
 * coalesce with first paint in some engines and skip the transition — the
 * same forced-reflow-ordering caution use-content-morph.ts already applies
 * to its own timing, extended here since this codebase had no existing
 * double-rAF pattern to copy verbatim. Exported for the shell's own
 * ToastRow (./shell/toast-row.tsx), which needs the identical two-phase
 * enter gate.
 */
export function useMountedFlag(): boolean {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    if (prefersReducedMotion()) {
      setMounted(true);
      return;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setMounted(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);
  return mounted;
}

/** Mirrors real Sonner's own `useIsDocumentHidden` (hooks.tsx) — feeds the timer-pause condition below (fix 5). SSR-safe: `document` doesn't exist server-side, so the initial value is just `false`. Exported for reuse by the new shell's own timer effect. */
export function useIsDocumentHidden(): boolean {
  const [hidden, setHidden] = React.useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  React.useEffect(() => {
    const onVisibilityChange = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);
  return hidden;
}
