"use client";

/**
 * A single, persistent toast card. Every live record (visible, or hidden
 * past `visibleToasts`) gets exactly one of these, keyed by id — no ghost,
 * no collapsed/expanded remount: front-promote and expand/collapse are both
 * just this component's own props changing, never a different component
 * mounting or unmounting. Absolutely positioned (like real Sonner's own
 * `<li>`), so every stacked card computes its own offset/scale — nothing
 * needs a shared measured-height box the way the old Sheet.Content
 * `'content'` detent did.
 *
 * Swipe is per-row (useToastSwipe below) but the shared `interacting` signal
 * still comes from the owning `<ol>`'s own delegated pointerdown/up
 * (toaster-shell.tsx's PositionGroup) — matching real Sonner's actual
 * `Toaster` component, not a per-row handler. That delegated listener
 * already fires from a swipe's own pointerdown (events still bubble through
 * an element with pointer capture set on it, capture only affects hit-test
 * targeting) and clears on pointerup the same way, so a mid-swipe row
 * already counts as `interacting` with no extra wiring needed here.
 */
import * as React from "react";
import { cn } from "../../internal/cn";
import type { SwipeDirection, ToastClassnames, ToastIcons, ToastRecord, ToastType } from "../state";
import { useMountedFlag } from "../toaster";
import { useToastSwipe } from "./use-toast-swipe";

function ToastIcon({
  type,
  icons,
  spinnerClassName,
}: {
  type: ToastType;
  icons?: ToastIcons;
  spinnerClassName?: string;
}) {
  if (type === "loading") {
    if (icons?.loading) return <>{icons.loading}</>;
    return <span className={spinnerClassName} />;
  }
  switch (type) {
    case "success":
      return <>{icons?.success ?? "✓"}</>;
    case "error":
      return <>{icons?.error ?? "✕"}</>;
    case "warning":
      return <>{icons?.warning ?? "!"}</>;
    case "info":
      return <>{icons?.info ?? "i"}</>;
    default:
      return null;
  }
}

export interface ToastRowProps {
  record: ToastRecord;
  /** 0-based, newest-first, across the WHOLE position group (visible and hidden alike). */
  index: number;
  /** Total live rows in this row's own position group — z-index is `total - index`, matching real Sonner. */
  total: number;
  toastsBefore: number;
  stackOffset: number;
  /** This record's own last-measured height, or `undefined` before its first ResizeObserver fire. */
  height: number | undefined;
  /** The front (index 0) row's own height — every collapsed row clips to it. */
  frontHeight: number | undefined;
  visible: boolean;
  expanded: boolean;
  removed: boolean;
  yPosition: "top" | "bottom";
  xPosition: "left" | "center" | "right";
  closeButton: boolean;
  /** This row's own resolved swipeDirections — a per-position default or the Toaster's own override, already resolved once by the caller (see toaster-shell.tsx's PositionGroup). */
  directions: readonly SwipeDirection[];
  onDismiss: (record: ToastRecord) => void;
  observe: (id: number | string, el: HTMLElement | null) => void;
  toasterClassNames?: ToastClassnames;
  icons?: ToastIcons;
  toasterCloseButtonAriaLabel?: string;
}

export function ToastRow({
  record,
  index,
  total,
  toastsBefore,
  stackOffset,
  height,
  frontHeight,
  visible,
  expanded,
  removed,
  yPosition,
  xPosition,
  closeButton,
  directions,
  onDismiss,
  observe,
  toasterClassNames,
  icons,
  toasterCloseButtonAriaLabel,
}: ToastRowProps) {
  const role = record.type === "error" ? "alert" : "status";
  const mounted = useMountedFlag();
  const elRef = React.useRef<HTMLDivElement | null>(null);
  const dismissible = record.dismissible !== false;
  const isFront = index === 0;

  const setRefs = React.useCallback(
    (el: HTMLDivElement | null) => {
      elRef.current = el;
      observe(record.id, el);
    },
    [observe, record.id],
  );

  // A loading toast is never swipeable regardless of `dismissible`, and a
  // row already leaving (removed) doesn't re-arm — matches real Sonner's own
  // `disabled = toastType === 'loading'` / `!dismissible` gate (index.tsx:
  // 147/317), plus the exit-hold's own "already gone" state this shell adds.
  const swipeable = !removed && dismissible && record.type !== "loading";
  const swipeHandlers = useToastSwipe(elRef, swipeable, directions, () => onDismiss(record));

  // Same a11y rationale as the Sheet-backed ToastRow's own `removed` gate:
  // `inert` covers every focusable descendant in one shot and pulls it out
  // of the accessibility tree — belt-and-suspenders alongside aria-hidden,
  // since that alone doesn't reliably suppress focus in every engine.
  React.useEffect(() => {
    const el = elRef.current;
    if (el) el.inert = removed;
  }, [removed]);

  const style = {
    "--scrollsheet-toast-toasts-before": toastsBefore,
    "--scrollsheet-toast-stack-offset": `${stackOffset}px`,
    "--scrollsheet-toast-front-height": frontHeight !== undefined ? `${frontHeight}px` : "0px",
    "--scrollsheet-toast-initial-height": height !== undefined ? `${height}px` : "auto",
    zIndex: Math.max(0, total - index),
  } as React.CSSProperties;

  // Neutral name first (what our own toast.css reads, and what a fresh
  // consumer's own CSS targets), sonner name alongside it so a migrant's
  // existing `.sonner-toast {}` rule keeps matching unmodified.
  const rootClassName = cn(
    "scrollsheet-toast",
    "sonner-toast",
    record.className,
    toasterClassNames?.toast,
    record.classNames?.toast,
    toasterClassNames?.default,
    toasterClassNames?.[record.type],
    record.classNames?.[record.type],
  );

  const motionAttrs = {
    "data-mounted": mounted ? "" : undefined,
    "data-removed": removed ? "" : undefined,
    "data-visible": visible ? "true" : "false",
    "data-front": isFront ? "true" : "false",
    "data-expanded": expanded ? "true" : "false",
    "data-y-position": yPosition,
    "data-x-position": xPosition,
    "data-index": index,
    "data-dismissible": dismissible ? "true" : "false",
    // Default rest values for the swipe hook's own imperative attributes —
    // it writes these directly on the DOM node from here on (no React
    // re-render per pointer move), matching --scrollsheet-toast-swipe-x/-y's
    // own direct-style-write convention; rendering them here just seeds the
    // literal "false" a real-Sonner-compatible CSS selector expects to find
    // from first paint, before any gesture has ever touched this row.
    "data-swiping": "false",
    "data-swiped": "false",
    "aria-hidden": removed ? "true" : undefined,
  } as const;

  if (record.jsx !== undefined) {
    return (
      <div
        ref={setRefs}
        className={rootClassName}
        data-scrollsheet-toast=""
        data-sonner-toast=""
        data-scrollsheet-custom=""
        data-sonner-custom=""
        data-testid={record.testId}
        role={role}
        style={style}
        {...motionAttrs}
        {...swipeHandlers}
      >
        {record.jsx}
      </div>
    );
  }

  const showCloseButton = closeButton && dismissible && record.type !== "loading";
  const hasActions = Boolean(record.action || record.cancel || showCloseButton);
  const closeButtonAriaLabel =
    record.closeButtonAriaLabel ?? toasterCloseButtonAriaLabel ?? "Close toast";

  return (
    <div
      ref={setRefs}
      className={rootClassName}
      data-scrollsheet-toast=""
      data-sonner-toast=""
      data-type={record.type}
      data-testid={record.testId}
      role={role}
      style={style}
      {...motionAttrs}
      {...swipeHandlers}
    >
      <span
        className={cn(
          "scrollsheet-toast-icon",
          "sonner-toast-icon",
          toasterClassNames?.icon,
          record.classNames?.icon,
        )}
        data-type={record.type}
        aria-hidden="true"
      >
        {record.icon ?? (
          <ToastIcon
            type={record.type}
            icons={icons}
            spinnerClassName={cn(
              "scrollsheet-toast-spinner",
              "sonner-toast-spinner",
              toasterClassNames?.loader,
              record.classNames?.loader,
            )}
          />
        )}
      </span>
      <div
        className={cn(
          "scrollsheet-toast-body",
          "sonner-toast-body",
          toasterClassNames?.content,
          record.classNames?.content,
        )}
      >
        {record.title !== undefined && (
          <div
            className={cn(
              "scrollsheet-toast-title",
              "sonner-toast-title",
              toasterClassNames?.title,
              record.classNames?.title,
            )}
          >
            {record.title}
          </div>
        )}
        {record.description !== undefined && (
          <div
            className={cn(
              "scrollsheet-toast-description",
              "sonner-toast-description",
              toasterClassNames?.description,
              record.classNames?.description,
            )}
          >
            {record.description}
          </div>
        )}
      </div>
      {hasActions && (
        <div className="scrollsheet-toast-actions sonner-toast-actions">
          {record.cancel && (
            <button
              type="button"
              className={cn(
                "scrollsheet-toast-cancel",
                "sonner-toast-cancel",
                toasterClassNames?.cancelButton,
                record.classNames?.cancelButton,
              )}
              onClick={(event) => {
                // Gated on dismissible BEFORE the consumer's own onClick even
                // runs — matches real Sonner's own cancel handler exactly.
                if (!dismissible) return;
                record.cancel?.onClick(event);
                onDismiss(record);
              }}
            >
              {record.cancel.label}
            </button>
          )}
          {record.action && (
            <button
              type="button"
              className={cn(
                "scrollsheet-toast-action",
                "sonner-toast-action",
                toasterClassNames?.actionButton,
                record.classNames?.actionButton,
              )}
              onClick={(event) => {
                // Unlike cancel, action always fires and only skips
                // dismissing if the consumer called event.preventDefault().
                record.action?.onClick(event);
                if (event.defaultPrevented) return;
                onDismiss(record);
              }}
            >
              {record.action.label}
            </button>
          )}
          {showCloseButton && (
            <button
              type="button"
              className={cn(
                "scrollsheet-toast-close",
                "sonner-toast-close",
                toasterClassNames?.closeButton,
                record.classNames?.closeButton,
              )}
              aria-label={closeButtonAriaLabel}
              onClick={() => onDismiss(record)}
            >
              {icons?.close ?? "×"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
