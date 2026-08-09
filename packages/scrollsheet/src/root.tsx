"use client";

import * as React from "react";
import { SheetContext, type TravelInfo } from "./context";
import type { DetentSpec } from "./internal/detents";
import { warnUnresolvableSnapToDetent } from "./internal/env";
import { useControllableState } from "./internal/use-controllable-state";
import type { Side } from "./motion/geometry";

/** Imperative escape hatch — see `actionsRef` on `<Sheet.Root>`. */
export interface SheetActions {
  open(): void;
  close(): void;
  /**
   * Moves the sheet to `detent` through the same `setActiveDetent` path a
   * controlled `activeDetent` change uses, so it animates identically. Warns
   * in dev (once) if `detent` isn't one of this sheet's configured
   * `detents` — only the panel's *rest position* resolves to the nearest
   * configured detent in that case; `activeDetent`/`onActiveDetentChange`
   * (and Handle's `aria-valuenow`/`aria-valuetext`) still reflect the
   * literal value passed in here, not the resolved one.
   */
  snapTo(detent: DetentSpec): void;
}

export interface SheetRootProps {
  children?: React.ReactNode;
  /** Controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Fires once the open/close *transition* finishes (not just the state
   * flip) — `true` when the sheet has fully settled open, `false` once it's
   * fully closed and unmounted. Backed by the same phase timers that drive
   * `data-scrollsheet-state`/`data-scrollsheet-side` (see Content) — no
   * separate timer of its own.
   */
  onOpenChangeComplete?: (open: boolean) => void;
  /**
   * Imperative escape hatch for cases a controlled `open`/`activeDetent`
   * prop is awkward for (deep links, push notifications, a descendant
   * component reaching up without prop-drilling): `ref.current?.close()` /
   * `.open()` / `.snapTo(detent)`. Thin wrappers over the same `setOpen`/
   * `setActiveDetent` the rest of the sheet uses — not a separate code path.
   */
  actionsRef?: React.Ref<SheetActions>;
  /**
   * The stops the sheet can rest at, UISheetPresentationController-style.
   * `'content'` (natural height), `'medium'` (50%), `'full'`, a 0–1 fraction,
   * or `'320px'`.
   * @default ['content']
   */
  detents?: readonly DetentSpec[];
  /** Controlled active detent (one of `detents`). */
  activeDetent?: DetentSpec;
  onActiveDetentChange?: (detent: DetentSpec) => void;
  /**
   * Master switch: when false, swipe/drag-to-dismiss, backdrop tap and Esc
   * all stop closing the sheet. `escapeDismissible`/`backdropDismissible`
   * below let you turn off just one of the pointer/keyboard paths while
   * leaving the others (and swipe-to-dismiss, which only this prop gates)
   * alone — both default to whatever `dismissible` is.
   * @default true
   */
  dismissible?: boolean;
  /** Whether Esc closes the sheet. @default `dismissible` */
  escapeDismissible?: boolean;
  /** Whether tapping the backdrop/empty track closes the sheet. @default `dismissible` */
  backdropDismissible?: boolean;
  /** CSP nonce for the injected style tag. */
  nonce?: string;
  /**
   * Blend the page's `<meta name="theme-color">` toward black as the sheet
   * travels, so the browser chrome (iOS Safari tints both the status bar area
   * and the bottom toolbar from this tag; Android tints the status bar) dims
   * along with the backdrop. Every theme-color tag is dimmed from its own
   * base color, so the usual media-scoped light/dark pair works and stays
   * correct even if the OS scheme flips while the sheet is open. On a
   * bottom-anchored attached sheet, the strip behind the bottom toolbar takes
   * the panel's own color instead (via a fixed sentinel element), so the bar
   * reads as part of the sheet, not the dimmed page. No-ops if no
   * tag holds a parseable color, or on platforms that ignore theme-color.
   * @default false
   */
  themeColorDimming?: boolean;
  /**
   * Fires on every frame the sheet travels: revealed px, 0-1 progress
   * (against the first detent, same number `--scrollsheet-progress` uses),
   * and `info` — per-detent progress plus the resolved travel range. `info`
   * is reused and mutated in place every frame (this is the highest-
   * frequency callback in the library); read it synchronously, don't store
   * the reference. Keep this handler cheap — it runs on every travel frame.
   */
  onTravel?: (revealedPx: number, progress: number, info: TravelInfo) => void;
  /** Which edge the sheet is anchored to. @default 'bottom' */
  side?: Side;
  /**
   * When false, the page behind stays fully interactive and scrollable — no
   * backdrop, no focus trap, no inert-ing the rest of the page. Renders on a
   * `<div popover="manual">` (top layer, non-blocking) where supported,
   * falling back to a non-modal `<dialog>` (`.show()`) otherwise.
   * @default true
   */
  modal?: boolean;
  /**
   * Applies an iOS-style card effect to the page element marked
   * `data-scrollsheet-background`, driven by this sheet's own travel
   * progress. `'scale'` scales/insets/rounds it; `'parallax'` only shifts it.
   * No-ops if no element is marked.
   *
   * Left unset, a full-height bottom sheet in the mobile presentation gets
   * `'scale'` — that is how the platform presents a sheet that covers the
   * screen. Desktop drawers dock beside the page and never move it, and a
   * detached (floating-card) sheet never claims the full screen, so neither
   * defaults on. `'none'` opts out anywhere.
   */
  backgroundEffect?: "scale" | "parallax" | "none";
  /**
   * Explicit target for backgroundEffect, instead of the default document-wide
   * `[data-scrollsheet-background]` query. Pass the same ref you'd otherwise
   * mark with the attribute. Skips the ownership check the implicit default
   * applies (an explicit ref is unambiguous about which page element it
   * means) — matches how an explicit `backgroundEffect` prop today already
   * bypasses the implicit default's full-height/opener-containment check.
   */
  backgroundRef?: React.RefObject<HTMLElement | null>;
  /**
   * Inner-content-overflow scrollbar style, for the panel's own scroll at
   * max detent (or any content taller than the panel). `'overlay'`: a thin
   * auto-hiding thumb (iOS/macOS-style). `'hidden'`: no thumb, no native
   * scrollbar either. `'native'`: let the browser draw
   * its own.
   * @default 'overlay'
   */
  scrollbar?: "overlay" | "hidden" | "native";
  /**
   * Scoped to exactly two things: the backdrop's opacity and
   * `themeColorDimming`. Both stay fully transparent/undimmed while the
   * sheet is at or below this detent's resolved height, then interpolate
   * from there up to the next detent above it (or the tallest detent, if
   * this is already the tallest). Unset (default): dims across the full
   * range from closed to the first detent, today's behavior. Does *not*
   * affect `onTravel`'s progress argument, `--scrollsheet-progress`,
   * stacking recede, or `backgroundEffect` — those all track the sheet's
   * full-range travel 1:1 regardless of this prop.
   */
  largestUndimmedDetent?: DetentSpec;
  /**
   * Drag sessions (mouse, and touch on non-modal sheets) only start from
   * `<Sheet.Handle>` — a pointerdown elsewhere on the panel no-ops. Modal
   * touch (native scroll drives the gesture) is restricted via
   * `touch-action` instead, except at the tallest detent, where the panel's
   * own content scroll still needs it.
   * @default false
   */
  handleOnly?: boolean;
  /**
   * No drag sessions at all, handle included — detent changes are
   * programmatic (`activeDetent`, `actionsRef`) or click/keyboard
   * (`<Sheet.Handle>`) only. Esc and backdrop dismissal are unaffected.
   * @default false
   */
  disableDrag?: boolean;
  /**
   * A release never skips over an intermediate detent — the resolved target
   * is clamped to the immediate neighbor of the detent the gesture started
   * from (or, for a native-scroll settle, the last settled detent).
   * @default false
   */
  sequentialDetents?: boolean;
  /**
   * Fraction (0-1) of the first detent below which a release dismisses the
   * sheet, replacing the built-in half-of-first-detent rule.
   * @default 0.5
   */
  closeThreshold?: number;
  /**
   * Bottom sheets only. When the software keyboard opens with a text field
   * focused inside the sheet, promote to the tallest detent so the field
   * has the whole remaining viewport to scroll within — a short peek detent
   * can't show a field the keyboard would otherwise cover. Restores the
   * previous detent on blur unless something else (a drag, a controlled
   * change) moved the sheet in between. Gated on the keyboard actually
   * appearing (a nonzero measured inset), never on focus alone, so a
   * desktop click into an input doesn't expand anything. Promotion goes
   * through the same `setActiveDetent` path a controlled change uses — a
   * controlled sheet must apply `onActiveDetentChange` back to
   * `activeDetent` or this prop has no visible effect.
   * @default false
   */
  keyboardExpands?: boolean;
  /**
   * Fires once a drag session resolves, with the real pointer event (the
   * `buttons===0` recovery path may pass the triggering `pointermove`
   * instead of a `pointerup`) and whether the sheet is staying open —
   * `false` only when the release resolved to a dismiss.
   */
  onRelease?: (event: PointerEvent, willRemainOpen: boolean) => void;
}

/** Mounted-instance counter: register() increments, its cleanup decrements. */
function useRegisterCounter(): [number, () => () => void] {
  const [count, setCount] = React.useState(0);
  const register = React.useCallback(() => {
    setCount((c) => c + 1);
    return () => setCount((c) => c - 1);
  }, []);
  return [count, register];
}

export function Root({
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  onOpenChangeComplete,
  actionsRef,
  detents = ["content"],
  activeDetent: activeDetentProp,
  onActiveDetentChange,
  dismissible = true,
  escapeDismissible,
  backdropDismissible,
  nonce,
  themeColorDimming = false,
  onTravel,
  side = "bottom",
  modal = true,
  backgroundEffect,
  backgroundRef,
  scrollbar = "overlay",
  largestUndimmedDetent,
  handleOnly = false,
  disableDrag = false,
  sequentialDetents = false,
  closeThreshold = 0.5,
  keyboardExpands = false,
  onRelease,
}: SheetRootProps) {
  const [open, setOpen] = useControllableState<boolean>({
    prop: openProp,
    defaultProp: defaultOpen,
    onChange: onOpenChange,
  });
  const firstDetent = detents[0] ?? "content";
  const [activeDetent, setActiveDetent] = useControllableState<DetentSpec>({
    prop: activeDetentProp,
    defaultProp: firstDetent,
    onChange: onActiveDetentChange,
  });

  React.useImperativeHandle(
    actionsRef,
    () => ({
      open: () => setOpen(true),
      close: () => setOpen(false),
      snapTo: (detent) => {
        if (!detents.includes(detent)) warnUnresolvableSnapToDetent();
        setActiveDetent(detent);
      },
    }),
    [setOpen, setActiveDetent, detents],
  );

  const reactId = React.useId();
  const [titleCount, registerTitle] = useRegisterCounter();
  const [descriptionCount, registerDescription] = useRegisterCounter();

  const openerRef = React.useRef<HTMLElement | null>(null);
  const [canvasEl, setCanvasEl] = React.useState<HTMLElement | null>(null);

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      openerRef,
      onOpenChangeComplete,
      detents,
      activeDetent,
      setActiveDetent,
      dismissible,
      escapeDismissible: escapeDismissible ?? dismissible,
      backdropDismissible: backdropDismissible ?? dismissible,
      nonce,
      themeColorDimming,
      onTravel,
      side,
      modal,
      backgroundEffect,
      backgroundRef,
      scrollbar,
      largestUndimmedDetent,
      handleOnly,
      disableDrag,
      sequentialDetents,
      closeThreshold,
      keyboardExpands,
      onRelease,
      canvasEl,
      setCanvasEl,
      titleId: `scrollsheet-title-${reactId}`,
      descriptionId: `scrollsheet-desc-${reactId}`,
      hasTitle: titleCount > 0,
      hasDescription: descriptionCount > 0,
      registerTitle,
      registerDescription,
    }),
    [
      open,
      setOpen,
      onOpenChangeComplete,
      detents,
      activeDetent,
      setActiveDetent,
      dismissible,
      escapeDismissible,
      backdropDismissible,
      nonce,
      themeColorDimming,
      onTravel,
      side,
      modal,
      backgroundEffect,
      backgroundRef,
      scrollbar,
      largestUndimmedDetent,
      handleOnly,
      disableDrag,
      sequentialDetents,
      closeThreshold,
      keyboardExpands,
      onRelease,
      canvasEl,
      reactId,
      titleCount,
      descriptionCount,
      registerTitle,
      registerDescription,
    ],
  );

  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>;
}
