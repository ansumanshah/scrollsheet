import * as React from "react";
import type { DetentSpec } from "./internal/detents";
import type { Side } from "./motion/geometry";

/**
 * onTravel's third argument. Reused and mutated in place every travel frame
 * (see content.tsx's updateTravel) — read it synchronously, don't retain the
 * reference across frames.
 */
export interface TravelInfo {
  /** [0, maxDetent] — the full resolved travel range in px, this frame. */
  range: readonly [number, number];
  /**
   * 0-1 progress toward EACH configured detent, keyed by the detent's
   * resolved height in px (not its spec — a spec like 'content' isn't a
   * stable identity across resizes, but its resolved height this frame is
   * what a consumer interpolates against).
   */
  progressAtDetents: ReadonlyMap<number, number>;
}

export interface SheetContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Trigger records itself here on activation — focus is no opener proxy (Safari never focuses clicked buttons). */
  openerRef: React.RefObject<HTMLElement | null>;
  detents: readonly DetentSpec[];
  activeDetent: DetentSpec;
  setActiveDetent: (detent: DetentSpec) => void;
  dismissible: boolean;
  nonce?: string;
  themeColorDimming: boolean;
  onTravel?: (revealedPx: number, progress: number, info: TravelInfo) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  escapeDismissible: boolean;
  backdropDismissible: boolean;
  /** Which edge the sheet is anchored to. @default 'bottom' */
  side: Side;
  /**
   * True for `side="center"`: a centered modal presentation with no travel,
   * detents, or drag — zoom+fade enter/exit instead. `side` stays "bottom"
   * as an inert fallback for geometry paths that never run in center mode,
   * so the 4-side geometry math never sees a fifth value.
   */
  center: boolean;
  /**
   * The mounted canvas element — Handle `variant="outside"` portals its
   * pill here, outside the panel's overflow clip, riding the same scroll
   * layer as the panel. Null until Content commits.
   */
  canvasEl: HTMLElement | null;
  /** Content publishes its canvas element here on mount (stable setter). */
  setCanvasEl: (el: HTMLElement | null) => void;
  /** Inner-content-overflow scrollbar style. @default 'overlay' */
  scrollbar: "overlay" | "hidden" | "native";
  /** Modal (blocks/dims the page, traps focus) vs. non-modal (page stays interactive). @default true */
  modal: boolean;
  /** Applies a card-stack effect to the marked page wrapper as this sheet travels. */
  backgroundEffect?: "scale" | "parallax" | "none";
  /** Explicit backgroundEffect target, bypassing the document-wide `[data-scrollsheet-background]` query. */
  backgroundRef?: React.RefObject<HTMLElement | null>;
  /**
   * The backdrop opacity and themeColorDimming (only — not onTravel,
   * --scrollsheet-progress, stacking recede, or backgroundEffect, which all
   * stay full-range) stay fully transparent/undimmed at or below this
   * detent — see updateTravel's `dimProgress`.
   */
  largestUndimmedDetent?: DetentSpec;
  /** Drag sessions only start from `<Sheet.Handle>`. */
  handleOnly: boolean;
  /** No drag sessions at all (handle included) — detent changes are programmatic-only. */
  disableDrag: boolean;
  /** A release never skips an intermediate detent. */
  sequentialDetents: boolean;
  /** Fraction (0-1) of the first detent below which a release dismisses. */
  closeThreshold: number;
  /**
   * Wind back scroll excursions nobody performed (single-event track
   * teleports with no recent input — test tooling's scrollIntoViewIfNeeded,
   * find-in-page, focus scrolls, extensions) instead of letting them
   * dismiss the sheet or change its detent. @default true
   */
  phantomScrollGuard: boolean;
  /** Bottom sheets: promote to the tallest detent while the software keyboard is up. */
  keyboardExpands: boolean;
  /** Fires on drag release with the real pointer event and whether the sheet is staying open. */
  onRelease?: (event: PointerEvent, willRemainOpen: boolean) => void;
  titleId: string;
  descriptionId: string;
  hasTitle: boolean;
  hasDescription: boolean;
  registerTitle: () => () => void;
  registerDescription: () => () => void;
}

export const SheetContext = /* @__PURE__ */ React.createContext<SheetContextValue | null>(null);

export function useSheetContext(component: string): SheetContextValue {
  const ctx = React.useContext(SheetContext);
  if (!ctx) throw new Error(`scrollsheet: <Sheet.${component}> must be used inside <Sheet.Root>`);
  return ctx;
}

/**
 * Sheet stacking. Each Content provides this to its subtree; a sheet opened
 * from inside another sheet tells its parent to recede (scale back), the way
 * stacked sheets behave in iOS.
 */
export interface StackContextValue {
  /**
   * Toggled true while the child is present and not mid-exit — see
   * content.tsx's `stackActive`. `key` is the child's stable identity (any
   * object): the parent tracks progress per child, so closing one of several
   * concurrently-open children un-recedes only that child's contribution,
   * not the whole parent while a sibling is still open.
   */
  setChildOpen: (open: boolean, key: object) => void;
  /**
   * The child's live travel progress (0–1, from its own `updateTravel`),
   * rAF-throttled by construction (called from within the child's own
   * per-frame travel update). `live=true` while the child is settled-open
   * (a real drag/scroll is moving it — no transition, 1:1 tracking);
   * `live=false` for its own open/close spring (transition enabled, so the
   * parent's un-recede springs in parallel with the child's exit). Ignored
   * for a `key` that isn't currently registered via `setChildOpen`.
   */
  setChildProgress: (progress: number, live: boolean, key: object) => void;
}

export const StackContext = /* @__PURE__ */ React.createContext<StackContextValue | null>(null);
