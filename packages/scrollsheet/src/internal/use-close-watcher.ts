"use client";

import * as React from "react";

import { hasCloseWatcherSupport } from "./env";

/** No CloseWatcher type in TS's lib.dom.d.ts yet — minimal shape, duck-typed via hasCloseWatcherSupport. */
interface CloseWatcherLike {
  close(): void;
  destroy(): void;
  requestClose(): void;
  onclose: (() => void) | null;
  oncancel: (() => void) | null;
}

export interface UseCloseWatcherInput {
  /** Mount-gated like every other per-sheet effect — see content.tsx's `present`. */
  present: boolean;
  /** `modal === false`. A modal dialog already owns a platform close watcher via `closedby`. */
  nonModal: boolean;
  /** Resolved `escapeDismissible` — the same gate the non-modal Esc keydown handler uses. */
  escapeDismissible: boolean;
  onClose: () => void;
}

/**
 * Android back gesture (and any other OS "close" signal) for a non-modal
 * sheet — popover or the non-modal `<dialog>` fallback, neither of which
 * gets a platform close watcher of its own the way a `showModal()` dialog
 * does. Without this, back falls through to page navigation instead of
 * dismissing the sheet.
 *
 * One watcher per open, dismissible, non-modal sheet; destroyed on close or
 * unmount. `escapeDismissible` already folds in the `dismissible` master
 * switch (see root.tsx), and gates this exactly like the Esc handler — a
 * non-dismissible sheet must not consume the gesture.
 *
 * Touch-primary devices only (hover: none + pointer: coarse): Esc is ALSO a
 * platform close signal wherever CloseWatcher exists, and a desktop watcher
 * would close the sheet on Esc pressed anywhere on the page — non-modal Esc
 * is deliberately focus-scoped instead (content.tsx's onNonModalKeyDown; the
 * sheet coexists with the page and must not steal its Esc). The device gate
 * keeps that contract on desktop while the devices that actually have a
 * back gesture get the watcher.
 *
 * Spec quirk, not a bug here: watchers created outside a user-activation
 * window group together, and a single platform signal closes every grouped
 * watcher at once — only bites nested non-modal sheets, and needs a real
 * device to confirm either way (device-verification-pending, see
 * CHANGELOG).
 */
export function useCloseWatcher({
  present,
  nonModal,
  escapeDismissible,
  onClose,
}: UseCloseWatcherInput): void {
  const onCloseRef = React.useRef(onClose);
  React.useInsertionEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    if (!present || !nonModal || !escapeDismissible) return;
    if (!hasCloseWatcherSupport()) return;
    if (
      typeof window.matchMedia !== "function" ||
      !window.matchMedia("(hover: none) and (pointer: coarse)").matches
    ) {
      return;
    }
    const Ctor = (window as unknown as { CloseWatcher: new () => CloseWatcherLike }).CloseWatcher;
    const watcher = new Ctor();
    watcher.onclose = () => onCloseRef.current();
    return () => watcher.destroy();
  }, [present, nonModal, escapeDismissible]);
}
