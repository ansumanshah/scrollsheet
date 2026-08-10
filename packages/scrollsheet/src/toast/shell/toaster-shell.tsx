"use client";

/**
 * The sonner-architecture Toaster shell — see .claude/sonner-port-design.md.
 * `../index.tsx` exports this as the public `Toaster` — this IS the toast
 * layer's component now, no Sheet-backed alternative left to fall back to.
 *
 * Zero dependency on Sheet.Root/Sheet.Content/content.tsx: a bare
 * `createPortal(..., document.body)` of one `<section>` plus one `<ol>` per
 * position, matching real Sonner's own DOM shape. Every live record (visible
 * or hidden past `visibleToasts`) gets exactly one persistent `<ToastRow>` —
 * hide-not-evict, not collapsed-front-card-plus-ghosts — so front-promotion
 * and expand/collapse are both just props changing on an already-mounted
 * node, never a remount.
 *
 * Every row gets 2-axis swipe-to-dismiss (./use-toast-swipe.ts) alongside
 * close-button / action / cancel / timer-expire / hotkey-Escape /
 * focus-scoped Escape / CloseWatcher — the last group ported unchanged from
 * the mechanical tier below.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { warnOnce } from "../../internal/dev-warn";
import { useCloseWatcher } from "../../internal/use-close-watcher";
import {
  type SwipeDirection,
  type ToastPosition,
  type ToastRecord,
  expire,
  selectPositionToasts,
  selectToasterToasts,
  selectToastWindow,
  toast,
  useSonner,
} from "../state";
import { injectToastStyles } from "../toast-styles";
import { resolveVisibleToasts, type ToasterProps, useIsDocumentHidden } from "../toaster";
import { useToastExit } from "../use-toast-exit";
import {
  computePossiblePositions,
  computeRowOffsets,
  findNewestDismissible,
  type RowOffset,
  splitPosition,
} from "./shell-selectors";
import { getDefaultSwipeDirections } from "./swipe-math";
import { ToastRow } from "./toast-row";
import { useToastHeights } from "./use-toast-heights";

const DEFAULT_HOTKEY: readonly string[] = ["altKey", "KeyT"];

/** One per-toast auto-dismiss timer's bookkeeping — identical shape/contract to the Sheet-backed Toaster's own TimerEntry (see toaster.tsx), just fed from a different source list (see the timer effect below). */
interface TimerEntry {
  timer: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  remaining: number;
  record: ToastRecord;
}

interface PositionGroupProps {
  position: ToastPosition;
  defaultPosition: ToastPosition;
  /** The whole toaster's own live list (every position combined) — position-filtered internally via selectPositionToasts, matching real Sonner's own per-`<ol>` filter. */
  toasts: readonly ToastRecord[];
  visibleToasts: number;
  gap: number;
  expanded: boolean;
  closeButton: boolean;
  /** The Toaster's own override, if set — undefined means every row falls back to its per-position default (see the `directions` useMemo below). */
  swipeDirections: readonly SwipeDirection[] | undefined;
  toastOptions: ToasterProps["toastOptions"];
  icons: ToasterProps["icons"];
  className: string | undefined;
  baseStyle: React.CSSProperties;
  sonnerCompat: boolean;
  registerListEl: (position: ToastPosition, el: HTMLOListElement | null) => void;
  dismissRow: (record: ToastRecord) => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onInteractingChange: (value: boolean) => void;
}

function PositionGroup({
  position,
  defaultPosition,
  toasts,
  visibleToasts,
  gap,
  expanded,
  closeButton,
  swipeDirections,
  toastOptions,
  icons,
  className,
  baseStyle,
  sonnerCompat,
  registerListEl,
  dismissRow,
  onHoverEnter,
  onHoverLeave,
  onInteractingChange,
}: PositionGroupProps) {
  // Resolved once per position group, not per row — matches real Sonner's
  // own single Toaster-wide `swipeDirections` prop overriding every group
  // uniformly (the port design's Swipe section). `position` here is this
  // GROUP's own position (top-left, bottom-right, ...), not the Toaster's
  // default, so a per-toast position override gets its own correct default
  // directions too.
  const directions = React.useMemo(
    () => swipeDirections ?? getDefaultSwipeDirections(position),
    [swipeDirections, position],
  );
  const positionToasts = React.useMemo(
    () => selectPositionToasts(toasts, position, defaultPosition),
    [toasts, position, defaultPosition],
  );
  // state.ts's own array stays append-only oldest-first — the newest-first
  // reversal happens here at the render boundary, same as
  // selectToastWindow's own doc comment describes.
  const newestFirst = React.useMemo(() => [...positionToasts].reverse(), [positionToasts]);
  const window_ = React.useMemo(
    () => selectToastWindow(positionToasts, visibleToasts),
    [positionToasts, visibleToasts],
  );
  const visibleIds = React.useMemo(() => new Set(window_.visible.map((t) => t.id)), [window_]);

  const { heights, observe, forget } = useToastHeights();
  const exitRows = useToastExit(newestFirst);

  // Mirrors real Sonner's own deleteToast(): an exiting row's height stops
  // counting toward its still-live siblings' cumulative offset the moment it
  // starts leaving, not only once it actually unmounts EXIT_MS later.
  const exitingIds = React.useMemo(
    () => new Set(exitRows.filter((r) => r.exiting).map((r) => r.record.id)),
    [exitRows],
  );
  React.useEffect(() => {
    for (const id of exitingIds) forget(id);
  }, [exitingIds, forget]);

  const offsets = React.useMemo(
    () => computeRowOffsets(newestFirst, heights, gap),
    [newestFirst, heights, gap],
  );
  const offsetById = React.useMemo(() => new Map(offsets.map((o) => [o.id, o])), [offsets]);

  // An exit-only row (dropped out of the store, still playing its own exit
  // transition) has no CURRENT offset to compute — it keeps rendering with
  // its last-known one instead of popping to a default. A ref (not state):
  // this is pure bookkeeping for a value already reflected in the DOM, not
  // something a re-render should itself be driven by.
  const lastOffsetRef = React.useRef(new Map<number | string, RowOffset>());
  for (const o of offsets) lastOffsetRef.current.set(o.id, o);
  if (lastOffsetRef.current.size > offsets.length) {
    const keep = new Set<number | string>([...offsets.map((o) => o.id), ...exitingIds]);
    for (const id of [...lastOffsetRef.current.keys()]) {
      if (!keep.has(id)) lastOffsetRef.current.delete(id);
    }
  }

  const frontHeight = heights.get(newestFirst[0]?.id ?? "");
  const { y, x } = splitPosition(position);

  const listRef = React.useCallback(
    (el: HTMLOListElement | null) => registerListEl(position, el),
    [registerListEl, position],
  );

  // Matches real Sonner's own gate: nothing to place in this position's
  // `<ol>` at all (no live records, no still-exiting ones either) — an empty
  // `<ol>` with no visible chrome would be harmless, but skipping it avoids
  // rendering N empty lists for positions nothing currently targets.
  if (exitRows.length === 0) return null;

  return (
    <ol
      ref={listRef}
      data-scrollsheet-toaster=""
      data-sonner-toaster={sonnerCompat ? "" : undefined}
      data-scrollsheet-theme="light"
      data-sonner-theme={sonnerCompat ? "light" : undefined}
      data-y-position={y}
      data-x-position={x}
      tabIndex={-1}
      className={className}
      style={
        {
          ...baseStyle,
          "--scrollsheet-toast-gap": `${gap}px`,
          "--scrollsheet-toast-front-height":
            frontHeight !== undefined ? `${frontHeight}px` : undefined,
        } as React.CSSProperties
      }
      onMouseEnter={onHoverEnter}
      onMouseMove={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.dataset.dismissible === "false") return;
        onInteractingChange(true);
      }}
      onPointerUp={() => onInteractingChange(false)}
    >
      {exitRows.map(({ record, exiting }) => {
        const offset = offsetById.get(record.id) ?? lastOffsetRef.current.get(record.id);
        const index = offset?.index ?? newestFirst.length;
        return (
          <ToastRow
            key={record.id}
            record={record}
            index={index}
            total={newestFirst.length}
            toastsBefore={offset?.toastsBefore ?? index}
            stackOffset={offset?.stackOffset ?? 0}
            height={heights.get(record.id)}
            frontHeight={frontHeight}
            visible={visibleIds.has(record.id)}
            expanded={expanded}
            removed={exiting}
            yPosition={y}
            xPosition={x}
            closeButton={closeButton}
            directions={directions}
            onDismiss={dismissRow}
            observe={observe}
            toasterClassNames={toastOptions?.classNames}
            sonnerCompat={sonnerCompat}
            icons={icons}
            toasterCloseButtonAriaLabel={toastOptions?.closeButtonAriaLabel}
            toasterStyle={toastOptions?.style}
          />
        );
      })}
    </ol>
  );
}

/**
 * Pure, exported for tests — the port-time counterpart of the old
 * `resolveToasterPosition`: every position value is real now, so this just
 * resolves the prop's own default, no warn/fallback gate left to run.
 */
export function resolveShellPosition(position: ToastPosition | undefined): ToastPosition {
  return position ?? "bottom-right";
}

export function ToasterShell({
  id,
  toasterId,
  position,
  theme,
  richColors,
  expand: forceExpand,
  visibleToasts: visibleToastsProp,
  closeButton = false,
  duration: durationProp,
  gap = 14,
  offset,
  swipeDirections,
  toastOptions,
  icons,
  className,
  style,
  containerAriaLabel = "Notifications",
  hotkey = DEFAULT_HOTKEY,
  nonce,
  sonnerCompat = true,
}: ToasterProps) {
  const resolvedId = id ?? toasterId;
  if (process.env.NODE_ENV !== "production") {
    if (toasterId !== undefined) {
      warnOnce(
        "toaster-id-deprecated",
        '[scrollsheet Toaster] Toaster\'s "toasterId" prop is deprecated — use "id" instead.',
      );
    }
  }
  const { toasts: allToasts } = useSonner();
  const toasts = React.useMemo(
    () => selectToasterToasts(allToasts, resolvedId),
    [allToasts, resolvedId],
  );

  const defaultPosition = resolveShellPosition(position);
  const possiblePositions = React.useMemo(
    () => computePossiblePositions(defaultPosition, toasts),
    [defaultPosition, toasts],
  );
  const visibleToasts = resolveVisibleToasts(visibleToastsProp);
  const defaultDuration = durationProp ?? toastOptions?.duration ?? 4000;

  if (process.env.NODE_ENV !== "production") {
    if (theme !== undefined && theme !== "light") {
      warnOnce(
        "shell-theme",
        `[scrollsheet Toaster] theme="${theme}" isn't implemented yet — v1 always renders the static light card real Sonner ships by default.`,
      );
    }
    if (richColors) {
      warnOnce(
        "shell-rich-colors",
        "[scrollsheet Toaster] richColors isn't implemented yet — toasts render with their default icon color only.",
      );
    }
  }

  React.useEffect(() => {
    injectToastStyles(nonce);
  }, [nonce]);

  // SSR-safety gate: `createPortal` needs a real `document`, and a `<section>`
  // rendered during renderToString would double up once the client takes
  // over anyway (this component has no hydration story — it's a pure
  // client-portalled overlay, same reasoning as the Sheet-backed Toaster's
  // own Content, which is behind an equivalent client-only mount gate).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // No focus-driven expand: real Sonner's own onFocus/onBlur only track
  // lastFocusedElementRef/isFocusWithinRef bookkeeping for restoring focus
  // later, never `expanded` itself — expand is hover/hotkey only. Wiring
  // focus into `expanded` here would fight the hotkey's own
  // `.focus({preventScroll:true})` call below (the programmatic focus move
  // that opens the stack would ALSO set a focus-driven expand flag with no
  // Escape path back out of it, since Escape only clears `hotkeyExpanded`).
  const [hovered, setHovered] = React.useState(false);
  const [hotkeyExpanded, setHotkeyExpanded] = React.useState(false);
  const [interacting, setInteracting] = React.useState(false);
  const expanded = Boolean(forceExpand) || hovered || hotkeyExpanded;
  const isDocumentHidden = useIsDocumentHidden();

  const handleHoverEnter = React.useCallback(() => setHovered(true), []);
  const handleHoverLeave = React.useCallback(() => {
    // Avoid collapsing while a row's own pointer is down (e.g. a
    // click-and-hold on an action button) — matches real Sonner's own
    // mouseleave gate.
    if (!interacting) setHovered(false);
  }, [interacting]);

  const dismissRow = React.useCallback((record: ToastRecord) => {
    // state.ts's own dismiss() already fires onDismiss — this must not also
    // fire it, or every shell-routed dismissal double-notifies.
    toast.dismiss(record.id);
  }, []);

  // ── Keyboard access ──────────────────────────────────────────────────
  // Global hotkey (reaches the otherwise keyboard-unreachable, collapsed
  // stack from anywhere on the page) plus two Escape behaviors scoped to
  // "focus is currently inside one of this Toaster's own `<ol>`s": if the
  // hotkey is what expanded the stack, Escape collapses it back (matches
  // real Sonner's own Escape contract exactly). Otherwise Escape dismisses
  // that group's own front toast — the richer, scrollsheet-specific
  // behavior the old Sheet-backed Toaster got for free from Content's own
  // non-modal Esc-dismiss, rebuilt here now that dropping the Sheet means
  // nothing provides it automatically anymore.
  const listElsRef = React.useRef(new Map<ToastPosition, HTMLOListElement>());
  const registerListEl = React.useCallback((pos: ToastPosition, el: HTMLOListElement | null) => {
    if (el) listElsRef.current.set(pos, el);
    else listElsRef.current.delete(pos);
  }, []);

  React.useEffect(() => {
    if (hotkey.length === 0) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const isHotkeyPressed = hotkey.every(
        (key) => (event as unknown as Record<string, unknown>)[key] || event.code === key,
      );
      if (isHotkeyPressed) {
        setHotkeyExpanded(true);
        const [firstList] = listElsRef.current.values();
        firstList?.focus({ preventScroll: true });
      }
      if (event.code !== "Escape") return;
      const active = document.activeElement;
      const focusedEntry = [...listElsRef.current.entries()].find(
        ([, el]) => active === el || el.contains(active),
      );
      if (!focusedEntry) return;
      if (hotkeyExpanded) {
        setHotkeyExpanded(false);
        return;
      }
      const [focusedPosition] = focusedEntry;
      const positionToasts = selectPositionToasts(toasts, focusedPosition, defaultPosition);
      const front = positionToasts[positionToasts.length - 1];
      if (front) dismissRow(front);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hotkey, hotkeyExpanded, toasts, defaultPosition, dismissRow]);

  // ── Per-toast auto-dismiss timers ─────────────────────────────────────
  // Identical algorithm to the Sheet-backed Toaster's own timer effect (see
  // toaster.tsx) — the shell consumes the mechanical tier, doesn't rewrite
  // it. One real difference: iterates the WHOLE toaster-wide `toasts` list,
  // not a capped `visibleToasts` window — hide-not-evict means a hidden
  // toast still ticks. `interacting` (real, not approximated) joins the
  // pause condition alongside `expanded`/`isDocumentHidden`.
  const timersRef = React.useRef(new Map<number | string, TimerEntry>());
  React.useEffect(() => {
    const timers = timersRef.current;
    const liveIds = new Set(toasts.map((t) => t.id));
    for (const [id, entry] of timers) {
      if (liveIds.has(id)) continue;
      if (entry.timer) clearTimeout(entry.timer);
      timers.delete(id);
    }

    const paused = expanded || interacting || isDocumentHidden;

    for (const t of toasts) {
      if (t.type === "loading") {
        const stale = timers.get(t.id);
        if (stale) {
          if (stale.timer) clearTimeout(stale.timer);
          timers.delete(t.id);
        }
        continue;
      }
      const ms = t.duration ?? toastOptions?.duration ?? defaultDuration;
      const existing = timers.get(t.id);

      if (!existing || existing.record !== t) {
        if (existing?.timer) clearTimeout(existing.timer);
        const entry: TimerEntry = { timer: null, startedAt: 0, remaining: ms, record: t };
        timers.set(t.id, entry);
        if (Number.isFinite(ms) && !paused) {
          entry.startedAt = Date.now();
          entry.timer = setTimeout(() => {
            timersRef.current.delete(t.id);
            expire(t.id);
          }, ms);
        }
        continue;
      }

      if (paused) {
        if (existing.timer) {
          clearTimeout(existing.timer);
          const elapsed = Date.now() - existing.startedAt;
          existing.remaining = Math.max(0, existing.remaining - elapsed);
          existing.timer = null;
        }
        continue;
      }
      if (existing.timer || !Number.isFinite(existing.remaining)) continue;
      existing.startedAt = Date.now();
      existing.timer = setTimeout(() => {
        timersRef.current.delete(t.id);
        expire(t.id);
      }, existing.remaining);
    }
  }, [toasts, expanded, interacting, isDocumentHidden, defaultDuration, toastOptions?.duration]);

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const entry of timers.values()) if (entry.timer) clearTimeout(entry.timer);
      timers.clear();
    };
  }, []);

  // ── CloseWatcher (Android back) ───────────────────────────────────────
  // Reused directly — already a fully generic hook with no Content/dialogRef
  // coupling. Dismisses this Toaster's own newest dismissible toast across
  // every position, mirroring the old Sheet-backed Toaster's single `front`.
  useCloseWatcher({
    present: toasts.length > 0,
    nonModal: true,
    escapeDismissible: true,
    onClose: () => {
      const target = findNewestDismissible(toasts);
      if (target) dismissRow(target);
    },
  });

  if (!mounted || typeof document === "undefined") return null;

  const offsetValue =
    offset !== undefined ? (typeof offset === "number" ? `${offset}px` : offset) : undefined;
  const baseStyle: React.CSSProperties = {
    ...style,
    "--scrollsheet-toast-offset": offsetValue,
  } as React.CSSProperties;

  return createPortal(
    <section
      aria-label={containerAriaLabel}
      tabIndex={-1}
      aria-live="polite"
      aria-relevant="additions text"
      aria-atomic="false"
      suppressHydrationWarning
      data-react-aria-top-layer=""
    >
      {possiblePositions.map((groupPosition) => (
        <PositionGroup
          key={groupPosition}
          position={groupPosition}
          defaultPosition={defaultPosition}
          toasts={toasts}
          visibleToasts={visibleToasts}
          gap={gap}
          expanded={expanded}
          closeButton={closeButton}
          swipeDirections={swipeDirections}
          toastOptions={toastOptions}
          icons={icons}
          className={className}
          baseStyle={baseStyle}
          sonnerCompat={sonnerCompat}
          registerListEl={registerListEl}
          dismissRow={dismissRow}
          onHoverEnter={handleHoverEnter}
          onHoverLeave={handleHoverLeave}
          onInteractingChange={setInteracting}
        />
      ))}
    </section>,
    document.body,
  );
}
