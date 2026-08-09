"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { useSheetContext } from "./context";
import { cn } from "./internal/cn";
import type { DetentSpec } from "./internal/detents";
import { Slot } from "./internal/slot";

export interface SheetHandleProps extends React.ComponentProps<"button"> {
  /** Render the child element instead of a `<button>`, merging props into it. */
  asChild?: boolean;
  /**
   * Where the pill sits. `'inside'` (default) flows at the top of the
   * sheet's content. `'floating'` overlays the content — absolutely
   * positioned over the panel's top edge, for full-bleed content (maps,
   * photos) a flow pill would push down. `'outside'` floats in the backdrop
   * above the sheet's top edge (bottom sheets only; other sides render as
   * `'inside'`) — it rides the canvas layer outside the panel's clip and
   * drags, clicks, and keys exactly like the others.
   * @default 'inside'
   */
  variant?: "inside" | "floating" | "outside";
}

/** Human-readable detent name for aria-valuetext. */
function detentLabel(spec: DetentSpec | undefined): string {
  if (spec === "full") return "Full";
  if (spec === "medium") return "Half";
  if (spec === "content") return "Fit content";
  if (typeof spec === "number") return `${Math.round(spec * 100)}%`;
  return spec ?? "";
}

/**
 * The grabber pill. Click cycles detents; ArrowUp/ArrowDown (or Left/Right
 * for side sheets) move between them, Home/End jump to the first/last — so
 * multi-detent sheets are fully keyboard-operable. With two or more detents
 * it exposes itself as a slider (role, value min/max/now, value text) so
 * screen readers announce the current stop, not just "button".
 *
 * The handle is optional. It's purely a click/keyboard affordance layered on
 * top of the drag engine, which listens on the whole panel, not the handle —
 * omit `<Sheet.Handle>` and the whole panel still drags and dismisses, in
 * every mode (modal and non-modal) and every side (bottom/top/left/right).
 * There's no boolean prop for this; omission is the API.
 */
export const Handle = /* @__PURE__ */ React.forwardRef<HTMLButtonElement, SheetHandleProps>(
  function Handle({ asChild, onClick, onKeyDown, className, variant = "inside", ...props }, ref) {
    const ctx = useSheetContext("Handle");
    // 'outside' needs the bottom-sheet geometry (the canvas offset formula in
    // core.css is anchored-edge math for that side only) — elsewhere it
    // degrades to the flow pill rather than rendering somewhere wrong. The
    // same degradation covers render paths with no canvas at all: the
    // FallbackSheet (no-<dialog> engines) never publishes one, and without
    // this the pill silently vanished there. `mounted` separates "no canvas
    // YET" (the normal one-commit portal delay — render nothing, no flash
    // of an inside pill) from "no canvas EVER" (fall back to inside).
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);
    const outside = variant === "outside" && ctx.side === "bottom" && !(mounted && !ctx.canvasEl);
    const variantAttr = outside ? "outside" : variant === "floating" ? "floating" : undefined;
    const specs = ctx.detents;
    const horizontal = ctx.side === "left" || ctx.side === "right";
    const multi = specs.length >= 2;
    const activeIndex = specs.findIndex((s) => Object.is(s, ctx.activeDetent));

    const move = (delta: number) => {
      if (!multi) return false;
      const index = specs.findIndex((s) => Object.is(s, ctx.activeDetent));
      const next = specs[index + delta];
      if (next === undefined) return false;
      ctx.setActiveDetent(next);
      return true;
    };

    const sliderAria = multi
      ? {
          role: "slider" as const,
          "aria-orientation": (horizontal ? "horizontal" : "vertical") as "horizontal" | "vertical",
          "aria-valuemin": 0,
          "aria-valuemax": specs.length - 1,
          // A controlled activeDetent matching no detents entry (index -1) omits
          // the value rather than announcing a fabricated "first detent".
          ...(activeIndex >= 0
            ? {
                "aria-valuenow": activeIndex,
                "aria-valuetext": detentLabel(specs[activeIndex]),
              }
            : {}),
        }
      : {};

    const Comp: React.ElementType = asChild ? Slot : "button";
    const button = (
      <Comp
        {...(asChild ? {} : { type: "button" as const })}
        aria-label={horizontal ? "Adjust sheet width" : "Adjust sheet height"}
        {...sliderAria}
        {...props}
        ref={ref}
        className={cn("scrollsheet-handle", className)}
        data-scrollsheet-handle
        data-scrollsheet-handle-variant={variantAttr}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          // Cycle: advance to the next detent, wrap to the first.
          if (!multi) return;
          const index = specs.findIndex((s) => Object.is(s, ctx.activeDetent));
          const next = specs[(index + 1) % specs.length];
          if (next !== undefined) ctx.setActiveDetent(next);
        }}
        onKeyDown={(event: React.KeyboardEvent<HTMLButtonElement>) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          // Horizontal sheets (left/right) use the arrow keys matching their
          // own axis; vertical sheets (bottom/top, the default) keep Up/Down.
          const expandKey = horizontal ? "ArrowRight" : "ArrowUp";
          const collapseKey = horizontal ? "ArrowLeft" : "ArrowDown";
          // preventDefault unconditionally for both of *this widget's own*
          // designated keys, even at the boundary where move() can't go
          // further — same convention native range-like widgets use. Without
          // it, the browser's own default arrow-key-scroll fires on
          // .scrollsheet-track directly and drags activeDetent along via the
          // scroll engine's settle().
          if (event.key === expandKey) {
            event.preventDefault();
            move(1);
          } else if (event.key === collapseKey) {
            event.preventDefault();
            if (!move(-1) && ctx.dismissible) {
              ctx.setOpen(false);
            }
          } else if (multi && event.key === "Home") {
            event.preventDefault();
            const first = specs[0];
            if (first !== undefined) ctx.setActiveDetent(first);
          } else if (multi && event.key === "End") {
            event.preventDefault();
            const last = specs[specs.length - 1];
            if (last !== undefined) ctx.setActiveDetent(last);
          }
        }}
      />
    );
    // The panel's overflow clip would swallow a pill above its edge, so the
    // outside variant renders at the canvas layer — same scroll layer, so it
    // rides every drag 1:1 (see the kb-fade overlay's reasoning). Null until
    // the canvas commits; the pill appears one render later.
    if (outside) {
      return ctx.canvasEl ? createPortal(button, ctx.canvasEl) : null;
    }
    return button;
  },
);
