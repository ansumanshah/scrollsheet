"use client";

/**
 * vaul drop-in compatibility layer.
 *
 * Swap the import and keep your JSX:
 *
 *   - import { Drawer } from 'vaul';
 *   + import { Drawer } from 'scrollsheet';
 *
 * scrollsheet's primitives (`Sheet.*`) are the source of truth; everything
 * here is a thin translation from vaul's prop names and semantics onto them.
 * direction, modal, shouldScaleBackground, onAnimationEnd, snapPoints and
 * asChild (Trigger/Close/Handle) all map to real scrollsheet features. Props
 * that exist only because vaul had to fight the page (body scroll-lock,
 * portal containers, manual keyboard handling) are accepted so existing JSX
 * compiles, and no-op with a single one-time dev `console.warn` — see the
 * README's migration guide for the per-prop rationale.
 */

import * as React from "react";
import { Root as SheetRoot, type SheetRootProps } from "../root";
import { Trigger } from "../trigger";
import { Content as SheetContent, type SheetContentProps } from "../content";
import { Handle as SheetHandle } from "../handle";
import { Close, Description, Title } from "../misc";
import type { SheetCloseProps, SheetDescriptionProps, SheetTitleProps } from "../misc";
import type { SheetHandleProps } from "../handle";
import type { SheetTriggerProps } from "../trigger";
import type { DetentSpec } from "../internal/detents";
import { warnOnce } from "../internal/dev-warn";
import { useSheetContext } from "../context";

/** Live shouldScaleBackground claims per bridged wrapper element (see Root's bridge effect). */
const wrapperClaims = new Map<Element, number>();
/** vaul's own default (src/constants.ts `CLOSE_THRESHOLD`) — not scrollsheet's own 0.5 default. See Root's `closeThreshold` prop doc. */
const VAUL_CLOSE_THRESHOLD = 0.25;

/** Filters `[key, value]` pairs down to the keys whose value was actually set (`!== undefined`) — feeds a `warnOnce` ignored-props list. */
const collectIgnored = (entries: Array<[string, unknown]>): string[] =>
  entries.filter(([, v]) => v !== undefined).map(([k]) => k);

/* ── snapPoints ⇄ detents translation ──────────────────────────────────── */

/** vaul's snap point shape: a 0–1 fraction, an absolute `'###px'` string, or `'fit-content'`. */
export type VaulSnapPoint = number | string;

function toDetentSpec(point: VaulSnapPoint): DetentSpec {
  if (typeof point === "number") return point;
  if (point === "fit-content" || point === "content") return "content";
  if (/^\d+(\.\d+)?px$/.test(point)) {
    const n = Number.parseFloat(point);
    return `${n}px` as DetentSpec;
  }
  const parsed = Number.parseFloat(point);
  return Number.isFinite(parsed) ? parsed : "content";
}

/**
 * Resolves vaul's `fadeFromIndex` against `snapPoints` into a
 * `largestUndimmedDetent` spec, mirroring real vaul's own default (its
 * `src/index.tsx`: `fadeFromIndex = snapPoints && snapPoints.length - 1`) —
 * omitted with `snapPoints` set defaults to the *topmost* snap point index
 * (no dim until the last snap point), not "no undimmed range at all"
 * (scrollsheet's own default when `largestUndimmedDetent` is never touched).
 * No `snapPoints`, or an out-of-range explicit index, resolves to
 * `undefined` (today's full-dim-range behavior) — pulled out as its own pure
 * function so this index math is unit-testable independent of rendering.
 */
export function resolveFadeFromIndex(
  snapPoints: readonly VaulSnapPoint[] | undefined,
  fadeFromIndex: number | undefined,
): DetentSpec | undefined {
  if (!snapPoints || snapPoints.length === 0) return undefined;
  const index = fadeFromIndex ?? snapPoints.length - 1;
  const point = snapPoints[index];
  return point !== undefined ? toDetentSpec(point) : undefined;
}

/**
 * Resolves vaul's `closeThreshold` against whether `snapPoints` is set,
 * CONVERTING between opposite conventions: vaul counts the fraction dragged
 * AWAY (its 0.25 default = dismiss after a quarter-height drag), scrollsheet
 * counts the fraction still VISIBLE (`isBelowCloseThreshold`: dismiss when
 * `revealed < firstDetent * closeThreshold`, so higher = easier). A raw
 * passthrough inverts the migrated feel — vaul's 0.25 became "drag 75% to
 * dismiss", harder than scrollsheet's own 0.5 default instead of easier —
 * so the mapping is `1 - value`, and an omitted prop resolves to vaul's own
 * `CLOSE_THRESHOLD` default of 0.25 (=> 0.75 here), never `Sheet.Root`'s
 * unrelated 0.5.
 * `snapPoints` set makes `closeThreshold` dead code in real vaul (its
 * `onRelease` returns through the snap-points branch before ever reading
 * it), matched here by always resolving to `undefined` in that case.
 * Pulled out as its own pure function, mirroring `resolveFadeFromIndex`,
 * so the conversion math is unit-testable independent of rendering.
 */
export function resolveCloseThreshold(
  snapPoints: readonly VaulSnapPoint[] | undefined,
  closeThreshold: number | undefined,
): number | undefined {
  // Empty array counts as "no snapPoints", matching resolveFadeFromIndex
  // and the detents line in DrawerRoot — one Root-wide reading of `[]`
  // (a dynamically computed list before data arrives), never a mix of
  // "set" here and "unset" there.
  if (snapPoints !== undefined && snapPoints.length > 0) return undefined;
  const vaulValue = closeThreshold ?? VAUL_CLOSE_THRESHOLD;
  return Math.min(1, Math.max(0, 1 - vaulValue));
}

/**
 * Composes vaul's `onClose` on top of `onOpenChange`: `onClose` fires
 * whenever the transition target is `false`, then `onOpenChange` always
 * fires. Real vaul's `closeDrawer()` calls `onClose` from every dismiss
 * path (swipe past threshold, Esc, backdrop, imperative); scrollsheet's own
 * `onOpenChange` is already the single funnel every one of *its* dismiss
 * paths goes through (`useControllableState`'s `onChange`, which fires
 * exactly once per real open/false transition), so layering `onClose` on
 * top of that wiring reproduces "every dismiss path" without a second one.
 * Returns `undefined` when neither callback is given, matching the
 * conditional-wrapper convention `onRelease`'s cast uses below. Pulled out
 * as its own pure function so the composition is unit-testable without a
 * live DOM/click event.
 */
export function composeOpenChange(
  onOpenChange: ((open: boolean) => void) | undefined,
  onClose: (() => void) | undefined,
): ((open: boolean) => void) | undefined {
  if (!onOpenChange && !onClose) return undefined;
  return (next: boolean) => {
    if (!next) onClose?.();
    onOpenChange?.(next);
  };
}

/* ── Root ─────────────────────────────────────────────────────────────── */

/**
 * vaul's own props, translated — plus (via the Pick) the scrollsheet-native
 * props that have no vaul counterpart and forward to `Sheet.Root`
 * untranslated: `backdropDismissible` (the escape hatch vaul served with the
 * Radix onPointerDownOutside/onInteractOutside preventDefault idiom),
 * `escapeDismissible` (same for onEscapeKeyDown), `keyboardExpands`,
 * `onTravel` (the live counterpart of vaul's ignored `onDrag`), `scrollbar`,
 * and `actionsRef`. Only props with no vaul name-collision are forwarded —
 * anything vaul also has (`closeThreshold`, `modal`, `dismissible`, …) keeps
 * its translated vaul semantics above.
 */
export interface DrawerRootProps extends Pick<
  SheetRootProps,
  | "actionsRef"
  | "backdropDismissible"
  | "escapeDismissible"
  | "keyboardExpands"
  | "onTravel"
  | "scrollbar"
> {
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Fires whenever the drawer closes — every dismiss path (swipe past
   * threshold, Esc, backdrop tap, imperative `close()`) funnels through the
   * same `onOpenChange` wiring this is layered on top of, matching real
   * vaul's `closeDrawer()`, which calls `onClose` on every one of those
   * paths too.
   */
  onClose?: () => void;
  /** @default true */
  dismissible?: boolean;
  /** Fractions (0–1), `'###px'` strings, or `'fit-content'` — translated to scrollsheet `detents`. */
  snapPoints?: readonly VaulSnapPoint[];
  /** Optionally-controlled active snap point; `null` means "no explicit snap point". */
  activeSnapPoint?: VaulSnapPoint | null;
  setActiveSnapPoint?: (snapPoint: VaulSnapPoint | null) => void;
  /** Fires when the open/close transition actually completes — wired to `onOpenChangeComplete`, exact rather than vaul's timer. */
  onAnimationEnd?: (open: boolean) => void;
  /** Ignored — the native `<dialog>` manages focus itself. */
  autoFocus?: boolean;
  /** Ignored — nesting is automatic: a `<Drawer.Content>` rendered inside another registers itself. */
  nested?: boolean;
  /** Maps to scrollsheet `side` — all four edges. */
  direction?: "top" | "bottom" | "left" | "right";
  /** Maps to scrollsheet `modal` — `false` renders non-modal (Popover top layer, page stays interactive). */
  modal?: boolean;
  /**
   * Maps to `backgroundEffect="scale"`; vaul's own `[data-vaul-drawer-wrapper]`
   * is picked up as the target. Left false (vaul's default), this maps to
   * `'none'`, not unset — vaul never scales the page unless asked, so the
   * scrollsheet default for full-height sheets must not leak in here.
   */
  shouldScaleBackground?: boolean;
  /**
   * Maps to scrollsheet `closeThreshold` — but only when `snapPoints` is
   * unset. In real vaul, `closeThreshold` is dead code once `snapPoints`
   * exist (its `onRelease` returns through the snap-points branch before
   * ever reading it); this compat layer matches that rather than giving the
   * prop unconditional live effect. Passing both together warns once in dev
   * — use the native `Sheet.Root closeThreshold` directly if you want it to
   * combine with detents.
   *
   * Omitted (with `snapPoints` unset) resolves to vaul's own default of
   * `0.25` (`CLOSE_THRESHOLD` in vaul's `src/constants.ts`) — not
   * scrollsheet's own `0.5` default, which is twice the drag distance.
   */
  closeThreshold?: number;
  /**
   * Maps to `largestUndimmedDetent`, resolved against `snapPoints` at this
   * index. Omitted (with `snapPoints` set) defaults to `snapPoints.length -
   * 1` — vaul's own default, meaning no dim until the topmost snap point —
   * not "dim across the full range" (scrollsheet's own default when
   * `largestUndimmedDetent` is never touched at all).
   */
  fadeFromIndex?: number;
  /** Maps to `sequentialDetents`. */
  snapToSequentialPoint?: boolean;
  /** Maps to `handleOnly` directly. */
  handleOnly?: boolean;
  /**
   * Maps to `onRelease`. Typed as vaul's own `React.PointerEvent<HTMLDivElement>`
   * (rather than scrollsheet's wider native-`PointerEvent` type) so a
   * handler already typed against vaul's declaration still assigns cleanly —
   * see the internal cast in `Root` for why this is safe at runtime.
   */
  onRelease?: (event: React.PointerEvent<HTMLDivElement>, open: boolean) => void;
  // The following vaul props have no scrollsheet equivalent. They're
  // accepted for drop-in compatibility and no-op with a dev warning (see
  // the README migration notes for a per-prop rationale and recipes).
  setBackgroundColorOnScale?: boolean;
  noBodyStyles?: boolean;
  disablePreventScroll?: boolean;
  preventScrollRestoration?: boolean;
  repositionInputs?: boolean;
  scrollLockTimeout?: number;
  onDrag?: (event: React.PointerEvent, percentageDragged: number) => void;
  container?: HTMLElement | null;
  /**
   * Ignored — real vaul's `fixed` swaps its own keyboard-avoidance strategy
   * (resize instead of translate); scrollsheet's `useKeyboardViewport` has
   * no equivalent toggle.
   */
  fixed?: boolean;
}

export function Root(props: DrawerRootProps) {
  const {
    children,
    open,
    defaultOpen,
    onOpenChange,
    onClose,
    dismissible,
    snapPoints,
    activeSnapPoint,
    setActiveSnapPoint,
    onAnimationEnd,
    autoFocus,
    nested,
    direction,
    modal,
    shouldScaleBackground,
    setBackgroundColorOnScale,
    noBodyStyles,
    disablePreventScroll,
    preventScrollRestoration,
    repositionInputs,
    scrollLockTimeout,
    closeThreshold,
    fadeFromIndex,
    snapToSequentialPoint,
    handleOnly,
    onDrag,
    onRelease,
    container,
    fixed,
    actionsRef,
    backdropDismissible,
    escapeDismissible,
    keyboardExpands,
    onTravel,
    scrollbar,
  } = props;

  // Fires during render (not an effect) so it also surfaces on the server —
  // `renderToString` never runs effects, and this compat layer is meant to
  // warn there too. Deduped module-wide, so it truly only logs once. The
  // whole block (ignored-list computation included) is dev-only — nothing
  // outside it reads `ignored` — so a production build folds it away
  // entirely instead of just the message string.
  if (process.env.NODE_ENV !== "production") {
    const ignored = collectIgnored([
      ["setBackgroundColorOnScale", setBackgroundColorOnScale],
      ["noBodyStyles", noBodyStyles],
      ["disablePreventScroll", disablePreventScroll],
      ["preventScrollRestoration", preventScrollRestoration],
      ["repositionInputs", repositionInputs],
      ["scrollLockTimeout", scrollLockTimeout],
      ["onDrag", onDrag],
      ["container", container],
      ["fixed", fixed],
      ["autoFocus", autoFocus],
      ["nested", nested],
    ]);
    if (ignored.length > 0) {
      warnOnce(
        "root-ignored-props",
        `[scrollsheet Drawer] These <Drawer.Root> props from vaul have no effect in this compat layer and are ignored: ${ignored.join(", ")}. See the vaul migration notes in the README.${
          onDrag !== undefined
            ? " onDrag: the native onTravel prop works on this same <Drawer.Root>."
            : ""
        }`,
      );
    }
  }

  // `[]` falls through to Sheet.Root's own detents default — a truthiness
  // check would pass the empty array along, and an empty detents list
  // resolves maxDetent to 0: a zero-height sheet. resolveFadeFromIndex and
  // resolveCloseThreshold read `[]` the same way.
  const detents = snapPoints && snapPoints.length > 0 ? snapPoints.map(toDetentSpec) : undefined;
  const activeDetent = activeSnapPoint != null ? toDetentSpec(activeSnapPoint) : undefined;
  // See resolveFadeFromIndex's doc comment: omitted-with-snapPoints defaults
  // to the topmost snap point (vaul's own default), not "unset".
  const largestUndimmedDetent = resolveFadeFromIndex(snapPoints, fadeFromIndex);

  // See resolveCloseThreshold's doc comment: converted between the two
  // libraries' opposite conventions (vaul counts drag-away, scrollsheet
  // counts what remains), dead code once snapPoints exist (matching real
  // vaul), and an omitted prop reproduces vaul's own default feel.
  const resolvedCloseThreshold = resolveCloseThreshold(snapPoints, closeThreshold);
  if (process.env.NODE_ENV !== "production") {
    if (snapPoints !== undefined && snapPoints.length > 0 && closeThreshold !== undefined) {
      warnOnce(
        "close-threshold-with-snap-points",
        "[scrollsheet Drawer] <Drawer.Root closeThreshold> has no effect when snapPoints is set — this matches real vaul, where closeThreshold is dead code once snapPoints exist (its onRelease returns through the snap-points branch before ever reading it). Use the native Sheet.Root `closeThreshold` (a live 0-1 fraction of the first detent, works alongside detents) if you want the upgrade.",
      );
    }
  }

  // vaul's onRelease's second arg is already "is the drawer still open" —
  // the same meaning as scrollsheet's willRemainOpen. Cast: scrollsheet
  // always calls onRelease with a real native PointerEvent (the
  // buttons===0 recovery path passes the triggering pointermove, itself a
  // PointerEvent), never a React SyntheticEvent — the cast to vaul's
  // React.PointerEvent<HTMLDivElement> is a type-level accommodation only,
  // so a handler typed against vaul's own declaration still compiles, not a
  // claim that the runtime value is actually a SyntheticEvent.
  const handleRelease = onRelease
    ? (event: PointerEvent, willRemainOpen: boolean) =>
        onRelease(event as unknown as React.PointerEvent<HTMLDivElement>, willRemainOpen)
    : undefined;

  // See composeOpenChange's doc comment for why layering onClose on
  // SheetRoot's own onOpenChange (rather than a separate wiring) is what
  // makes "every dismiss path" true.
  const handleOpenChange = composeOpenChange(onOpenChange, onClose);

  const handleActiveDetentChange = (detent: DetentSpec) => {
    if (!setActiveSnapPoint) return;
    const match = snapPoints?.find((point) => Object.is(toDetentSpec(point), detent));
    setActiveSnapPoint(match ?? detent);
  };

  // vaul consumers mark their page wrapper [data-vaul-drawer-wrapper]; the
  // scale effect targets [data-scrollsheet-background]. Bridge the former to
  // the latter so a migration changes zero markup. Claims are
  // reference-counted: multiple <Drawer.Root shouldScaleBackground> sharing
  // one wrapper (a normal vaul pattern) must not lose the marker when the
  // first of them unmounts. A consumer's own scrollsheet target (one we
  // never claimed) is always respected untouched.
  React.useEffect(() => {
    if (!shouldScaleBackground) return;
    const existing = document.querySelector("[data-scrollsheet-background]");
    if (existing && !wrapperClaims.has(existing)) return;
    const wrapper = existing ?? document.querySelector("[data-vaul-drawer-wrapper]");
    if (!wrapper) return;
    const count = wrapperClaims.get(wrapper) ?? 0;
    wrapperClaims.set(wrapper, count + 1);
    if (count === 0) wrapper.setAttribute("data-scrollsheet-background", "");
    return () => {
      const remaining = (wrapperClaims.get(wrapper) ?? 1) - 1;
      if (remaining <= 0) {
        wrapperClaims.delete(wrapper);
        wrapper.removeAttribute("data-scrollsheet-background");
      } else {
        wrapperClaims.set(wrapper, remaining);
      }
    };
  }, [shouldScaleBackground]);

  return (
    <DirectionContext.Provider value={direction ?? "bottom"}>
      <SheetRoot
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        onOpenChangeComplete={onAnimationEnd}
        dismissible={dismissible}
        detents={detents}
        activeDetent={activeDetent}
        onActiveDetentChange={setActiveSnapPoint ? handleActiveDetentChange : undefined}
        side={direction}
        modal={modal}
        backgroundEffect={shouldScaleBackground ? "scale" : "none"}
        largestUndimmedDetent={largestUndimmedDetent}
        handleOnly={handleOnly}
        sequentialDetents={snapToSequentialPoint}
        closeThreshold={resolvedCloseThreshold}
        onRelease={handleRelease}
        actionsRef={actionsRef}
        backdropDismissible={backdropDismissible}
        escapeDismissible={escapeDismissible}
        keyboardExpands={keyboardExpands}
        onTravel={onTravel}
        scrollbar={scrollbar}
      >
        {children}
      </SheetRoot>
    </DirectionContext.Provider>
  );
}

/** The resolved vaul `direction`, for Content's `data-vaul-drawer-direction` contract. */
const DirectionContext = /* @__PURE__ */ React.createContext<"top" | "bottom" | "left" | "right">(
  "bottom",
);

/**
 * Nested drawers just work: a `<Drawer.Content>` rendered inside another
 * `<Drawer.Content>` automatically registers with the parent's stacking
 * context (the parent recedes while the child is open), the way iOS stacks
 * sheets. `NestedRoot` is an alias of `Root` kept for drop-in compatibility
 * with vaul's API surface — there's nothing distinct for it to do.
 */
export const NestedRoot = Root;
export type DrawerNestedRootProps = DrawerRootProps;

/* ── Trigger ──────────────────────────────────────────────────────────── */

export { Trigger };
export type { SheetTriggerProps as DrawerTriggerProps };

/* ── Portal ───────────────────────────────────────────────────────────── */

export interface DrawerPortalProps {
  children?: React.ReactNode;
  /** Ignored — the native `<dialog>` always renders into the browser's top layer. */
  container?: HTMLElement | null;
}

export function Portal({ children, container }: DrawerPortalProps) {
  if (process.env.NODE_ENV !== "production") {
    if (container !== undefined) {
      warnOnce(
        "portal-container",
        "[scrollsheet Drawer] <Drawer.Portal container> has no effect — scrollsheet's <dialog> always renders into the browser's top layer (effectively document.body), so there's no separate container to portal into.",
      );
    }
  }
  return <>{children}</>;
}

/* ── Overlay ──────────────────────────────────────────────────────────── */

export type DrawerOverlayProps = React.ComponentProps<"div">;

/**
 * scrollsheet draws its own backdrop (`.scrollsheet-backdrop`, themeable via
 * the `--scrollsheet-backdrop` CSS variable) that tracks scroll progress, so
 * there's nothing for a separate overlay element to render. This accepts
 * vaul's `<Drawer.Overlay className .../>` so existing JSX doesn't crash —
 * restyle the backdrop through the CSS variable instead.
 */
export function Overlay(_props: DrawerOverlayProps) {
  return null;
}

/* ── Content ──────────────────────────────────────────────────────────── */

/**
 * Whether translated `snapPoints` produced more than one distinct detent —
 * feeds Content's `data-vaul-snap-points` attribute. vaul's own
 * CSS-selector convention treats a single snap point the same as none
 * (scrollsheet's own single-detent default also resolves to `false` here).
 * Pulled out as its own pure function, mirroring `resolveFadeFromIndex` /
 * `resolveCloseThreshold`, so it's unit-testable independent of rendering
 * (`<Drawer.Content>`'s actual DOM output is behind a client-only mount
 * gate — see content.tsx — so SSR can't observe the attribute directly).
 */
export function hasMultipleSnapPoints(detents: readonly DetentSpec[]): boolean {
  return detents.length > 1;
}

export interface DrawerContentProps extends SheetContentProps {
  // The following are Radix Dialog.Content props real vaul's ContentProps
  // inherits (`React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>`).
  // scrollsheet's Content has no equivalent for any of them (autoFocus is
  // deliberately unsupported at the Root level too — the native <dialog>
  // manages focus itself). They're accepted for drop-in compatibility,
  // stripped before reaching the DOM, and no-op with a single dev warning —
  // see the README migration notes for a per-prop rationale.
  onPointerDownOutside?: (event: CustomEvent) => void;
  onOpenAutoFocus?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onInteractOutside?: (event: CustomEvent) => void;
  onFocusOutside?: (event: CustomEvent) => void;
  forceMount?: boolean;
}

export const Content = /* @__PURE__ */ React.forwardRef<HTMLDivElement, DrawerContentProps>(
  function Content(
    {
      onPointerDownOutside,
      onOpenAutoFocus,
      onEscapeKeyDown,
      onCloseAutoFocus,
      onInteractOutside,
      onFocusOutside,
      forceMount,
      ...props
    },
    ref,
  ) {
    const ctx = useSheetContext("Content");
    // Preserve vaul's data-attribute contract: existing CSS written against
    // `[data-vaul-drawer]` / `[data-vaul-drawer-direction]` /
    // `[data-vaul-snap-points]` keeps matching, with the real direction from
    // <Drawer.Root> and whether snapPoints actually produced more than one
    // detent (a single snap point, like scrollsheet's own single-detent
    // default, isn't "snap points" in vaul's CSS-selector sense).
    const direction = React.useContext(DirectionContext);
    const snapPointsActive = hasMultipleSnapPoints(ctx.detents);

    // Dev-only, same reasoning as Root's ignored-props block above: nothing
    // outside this guard reads `ignored`, so a production build folds away
    // the whole computation, not just the message string.
    if (process.env.NODE_ENV !== "production") {
      const ignored = collectIgnored([
        ["onPointerDownOutside", onPointerDownOutside],
        ["onOpenAutoFocus", onOpenAutoFocus],
        ["onEscapeKeyDown", onEscapeKeyDown],
        ["onCloseAutoFocus", onCloseAutoFocus],
        ["onInteractOutside", onInteractOutside],
        ["onFocusOutside", onFocusOutside],
        ["forceMount", forceMount],
      ]);
      if (ignored.length > 0) {
        warnOnce(
          "content-ignored-props",
          `[scrollsheet Drawer] These <Drawer.Content> props from vaul have no effect in this compat layer and are stripped before reaching the DOM: ${ignored.join(", ")}. See the vaul migration notes in the README.${
            onPointerDownOutside !== undefined ||
            onInteractOutside !== undefined ||
            onEscapeKeyDown !== undefined
              ? " To block backdrop-tap dismissal, set backdropDismissible={false} on <Drawer.Root>; to block Esc, escapeDismissible={false}."
              : ""
          }`,
        );
      }
    }

    return (
      <SheetContent
        {...props}
        ref={ref}
        data-vaul-drawer=""
        data-vaul-drawer-direction={direction}
        data-vaul-snap-points={snapPointsActive ? "true" : "false"}
      />
    );
  },
);

/* ── Handle ───────────────────────────────────────────────────────────── */

/**
 * Composes the click handler Handle passes to `SheetHandle`: the caller's
 * own `onClick` always fires first, then — when `preventCycle` is set —
 * `event.preventDefault()`, the same signal `SheetHandle`'s own
 * click-to-cycle logic already checks (`if (event.defaultPrevented) return`
 * in handle.tsx) to skip advancing to the next detent. Mirrors real vaul's
 * `preventCycle`, read inside its own `handleCycleSnapPoints` guard. Pulled
 * out as its own pure function so the composition is unit-testable without
 * a live DOM/click event.
 */
export function composeHandleClick(
  preventCycle: boolean | undefined,
  onClick: ((event: React.MouseEvent<HTMLButtonElement>) => void) | undefined,
): (event: React.MouseEvent<HTMLButtonElement>) => void {
  return (event) => {
    onClick?.(event);
    if (preventCycle) event.preventDefault();
  };
}

export interface DrawerHandleProps extends SheetHandleProps {
  /**
   * Suppresses the click-to-cycle-detents behavior — the handle still
   * renders, drags, and is keyboard-operable as usual, but a click no
   * longer advances to the next detent. Mirrors real vaul's own
   * `preventCycle`, which guards the same click path (vaul's handle has no
   * keyboard cycling to suppress).
   */
  preventCycle?: boolean;
}

export const Handle = /* @__PURE__ */ React.forwardRef<HTMLButtonElement, DrawerHandleProps>(
  function Handle({ preventCycle, onClick, ...props }, ref) {
    // Mirrors real vaul's Handle exactly: data-vaul-drawer-visible tracks the
    // `open` boolean itself (src/index.tsx `isOpen ? 'true' : 'false'`), not
    // the exit-animation phase — it flips to "false" the instant a dismiss
    // starts, not once the close animation finishes.
    const ctx = useSheetContext("Handle");
    return (
      <SheetHandle
        {...props}
        ref={ref}
        data-vaul-handle=""
        data-vaul-drawer-visible={ctx.open ? "true" : "false"}
        onClick={composeHandleClick(preventCycle, onClick)}
      />
    );
  },
);

/* ── Title / Description / Close ─────────────────────────────────────── */

/**
 * Sheet.Close's self-closing form renders a styled ✕ default; vaul's own
 * `<Drawer.Close />` renders an empty unstyled button. A migrating user
 * must not get a surprise icon button from a version swap, so the compat
 * Close pins children to null (defined, so the styled-default branch never
 * arms) unless the caller passed some.
 */
const DrawerClose = /* @__PURE__ */ React.forwardRef<HTMLButtonElement, SheetCloseProps>(
  function DrawerClose({ children, ...props }, ref) {
    return (
      <Close {...props} ref={ref}>
        {children ?? null}
      </Close>
    );
  },
);

export { Title, Description, DrawerClose as Close };
export type {
  SheetTitleProps as DrawerTitleProps,
  SheetDescriptionProps as DrawerDescriptionProps,
  SheetCloseProps as DrawerCloseProps,
};

/* ── Namespace ────────────────────────────────────────────────────────── */

/** Namespace-style access matching vaul's `<Drawer.Root>…</Drawer.Root>` shape. */
export const Drawer = {
  Root,
  NestedRoot,
  Trigger,
  Portal,
  Overlay,
  Content,
  Close: DrawerClose,
  Title,
  Description,
  Handle,
};
