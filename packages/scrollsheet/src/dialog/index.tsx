"use client";

/**
 * Radix Dialog drop-in compatibility layer, rendering scrollsheet's centered
 * modal presentation (`Sheet.Root side="center"`).
 *
 * Swap the import and keep your JSX:
 *
 *   - import * as Dialog from '@radix-ui/react-dialog';
 *   + import { Dialog } from 'scrollsheet';
 *
 * Root/Trigger/Content/Title/Description/Close all map onto real scrollsheet
 * primitives. Portal renders its children in a plain Fragment (scrollsheet's
 * `<dialog>` always portals to the browser's top layer on its own) and
 * Overlay renders nothing (the centered panel draws its own backdrop) — both
 * accept their Radix props so existing JSX compiles, same as vaul's compat
 * layer (`src/drawer`) handles props it has no use for.
 *
 * Radix's interaction/focus-management props on `<Dialog.Content>`
 * (onPointerDownOutside, onInteractOutside, onEscapeKeyDown,
 * onOpenAutoFocus, onCloseAutoFocus, onFocusOutside, forceMount) are
 * accepted, stripped before reaching the DOM, and no-op with a one-time dev
 * warning per prop group — see Content's own doc comment for the recipes
 * and the deliberate click-vs-pointerdown dismissal divergence.
 */

import * as React from "react";
import { Root as SheetRoot, type SheetRootProps } from "../root";
import { Trigger } from "../trigger";
import { Content as SheetContent, type SheetContentProps } from "../content";
import { Close, Description, Title } from "../misc";
import type { SheetCloseProps, SheetDescriptionProps, SheetTitleProps } from "../misc";
import type { SheetTriggerProps } from "../trigger";
import { warnOnce } from "../internal/dev-warn";
import { useSheetContext } from "../context";
import { composeRefs } from "../internal/slot";

/** Filters `[key, value]` pairs down to the keys whose value was actually set (`!== undefined`) — feeds a `warnOnce` ignored-props list. Local copy of the vaul compat layer's own helper (src/drawer/index.tsx): duplicated rather than imported so a Dialog-only import never pulls vaul's module in. */
const collectIgnored = (entries: Array<[string, unknown]>): string[] =>
  entries.filter(([, v]) => v !== undefined).map(([k]) => k);

/* ── Root ─────────────────────────────────────────────────────────────── */

/**
 * Radix's own `Dialog.Root` props (`open`/`defaultOpen`/`onOpenChange`/
 * `modal`) map straight onto `Sheet.Root` — there's nothing left over to
 * strip or warn about. The Pick below adds scrollsheet-native props that
 * have no Radix counterpart at all, forwarded untranslated (the beta.3
 * `DrawerRootProps` passthrough precedent, src/drawer/index.tsx's Root):
 * `actionsRef` is scrollsheet's imperative open()/close()/snapTo() escape
 * hatch (`snapTo` is inert here — center mode has no detents to snap to);
 * `backdropDismissible`/`escapeDismissible` are the direct replacement for
 * Radix's `onPointerDownOutside`/`onInteractOutside`/`onEscapeKeyDown`
 * preventDefault idiom — see Content's doc comment for the exact recipe;
 * `onOpenChangeComplete` fires once the open/close *transition* itself
 * finishes, not just the state flip — Radix has no built-in equivalent.
 */
export interface DialogRootProps extends Pick<
  SheetRootProps,
  "actionsRef" | "backdropDismissible" | "escapeDismissible" | "onOpenChangeComplete"
> {
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Maps to scrollsheet `modal` — `false` renders non-modal (the page stays
   * interactive: no backdrop block, no focus trap). Matches Radix's own
   * default.
   * @default true
   */
  modal?: boolean;
}

export function Root({
  children,
  open,
  defaultOpen,
  onOpenChange,
  modal,
  actionsRef,
  backdropDismissible,
  escapeDismissible,
  onOpenChangeComplete,
}: DialogRootProps) {
  return (
    <SheetRoot
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      modal={modal}
      side="center"
      actionsRef={actionsRef}
      backdropDismissible={backdropDismissible}
      escapeDismissible={escapeDismissible}
    >
      {children}
    </SheetRoot>
  );
}

/* ── Trigger ──────────────────────────────────────────────────────────── */

export { Trigger };
export type { SheetTriggerProps as DialogTriggerProps };

/* ── Portal ───────────────────────────────────────────────────────────── */

export interface DialogPortalProps {
  children?: React.ReactNode;
  /** Ignored — scrollsheet's `<dialog>` always renders into the browser's top layer. */
  container?: HTMLElement | null;
}

export function Portal({ children, container }: DialogPortalProps) {
  if (process.env.NODE_ENV !== "production") {
    if (container !== undefined) {
      warnOnce(
        "dialog-portal-container",
        "[scrollsheet Dialog] <Dialog.Portal container> has no effect — scrollsheet's <dialog> always renders into the browser's top layer (effectively document.body), so there's no separate container to portal into.",
      );
    }
  }
  return <>{children}</>;
}

/* ── Overlay ──────────────────────────────────────────────────────────── */

export type DialogOverlayProps = React.ComponentProps<"div">;

/**
 * scrollsheet draws its own backdrop (`.scrollsheet-backdrop`, themeable via
 * the `--scrollsheet-backdrop` CSS variable) as part of the centered panel
 * itself, so there's nothing for a separate overlay element to render. This
 * accepts Radix's `<Dialog.Overlay className .../>` so existing JSX doesn't
 * crash, and notes the restyle path once per session — restyle the backdrop
 * through the CSS variable/class instead.
 */
export function Overlay(_props: DialogOverlayProps) {
  if (process.env.NODE_ENV !== "production") {
    warnOnce(
      "dialog-overlay",
      "[scrollsheet Dialog] <Dialog.Overlay> renders nothing — scrollsheet draws its own backdrop (.scrollsheet-backdrop, themeable via the --scrollsheet-backdrop CSS variable) as part of the centered panel. Restyle the backdrop through that class/variable instead of <Dialog.Overlay>.",
    );
  }
  return null;
}

/* ── Content ──────────────────────────────────────────────────────────── */

/**
 * Maps scrollsheet's own phase machine onto Radix's binary `data-state`
 * contract: "opening"/"open" -> "open", "closing"/"pre" (and anything else,
 * including "no phase machine at all" — the no-`<dialog>` fallback path) ->
 * "closed". Pulled out as its own pure function so the mapping is
 * unit-testable without a live DOM.
 */
export function phaseToDataState(phase: string | null): "open" | "closed" {
  return phase === "opening" || phase === "open" ? "open" : "closed";
}

export interface DialogContentProps extends SheetContentProps {
  // Radix Dialog.Content props real @radix-ui/react-dialog's ContentProps
  // inherits (DismissableLayer's onPointerDownOutside/onInteractOutside/
  // onFocusOutside/onEscapeKeyDown, FocusScope's onOpenAutoFocus/
  // onCloseAutoFocus, and Presence's forceMount). scrollsheet's Content has
  // no equivalent for any of them. They're accepted for drop-in
  // compatibility, stripped before reaching the DOM, and no-op with a dev
  // warning grouped by what they're for — see Content's implementation.
  onPointerDownOutside?: (event: CustomEvent) => void;
  onInteractOutside?: (event: CustomEvent) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onFocusOutside?: (event: CustomEvent) => void;
  forceMount?: boolean;
}

/**
 * Renders scrollsheet's centered panel (`Sheet.Content` under a
 * `side="center"` Root) and stamps Radix's `data-state` ("open"/"closed")
 * contract onto the same element it renders, so a migrated consumer's
 * existing `[data-state=open]`/`[data-state=closed]` keyframe CSS keeps
 * matching. `phase` (scrollsheet's own pre/opening/open/closing lifecycle)
 * isn't exposed through context — it's local render state inside
 * content.tsx — so this reads it the same place any external observer
 * would: the `data-scrollsheet-state` attribute the dialog host element
 * (an ancestor of the rendered panel) already carries, watched with a
 * `MutationObserver` for flips.
 *
 * The no-`<dialog>` fallback path (internal/fallback-sheet.tsx, ~4%
 * global) DOES forward the ref to its panel, but that DOM tree carries no
 * `data-scrollsheet-state` ancestor to observe — the `ctx.open` branch
 * below is the live mechanism there, stamping open/closed straight from
 * context (the fallback has no exit animation, so open state IS the whole
 * lifecycle).
 *
 * Deliberate divergence from Radix, not a bug: outside-dismissal here fires
 * on a backdrop CLICK, matching scrollsheet's own `Sheet.Root` everywhere
 * else, not Radix's POINTERDOWN. iOS Safari can deliver a backdrop tap as a
 * bare `click` with no preceding `pointerdown` for a non-focusable target,
 * and a pointerdown-gated dismiss silently drops those taps. Radix
 * dismisses on pointerdown so the outside interaction resolves before any
 * click-triggered side effect underneath it fires; scrollsheet accepts the
 * later, slightly more permissive timing in exchange for actually closing
 * on iOS. This isn't configurable per event type —
 * `backdropDismissible={false}` on `<Dialog.Root>` turns the whole path
 * off rather than switching which event triggers it.
 */
export const Content = /* @__PURE__ */ React.forwardRef<HTMLDivElement, DialogContentProps>(
  function Content(
    {
      onPointerDownOutside,
      onInteractOutside,
      onEscapeKeyDown,
      onOpenAutoFocus,
      onCloseAutoFocus,
      onFocusOutside,
      forceMount,
      ...props
    },
    ref,
  ) {
    const ctx = useSheetContext("Content");
    const [panelNode, setPanelNode] = React.useState<HTMLDivElement | null>(null);
    const [dataState, setDataState] = React.useState<"open" | "closed">("closed");
    const setRefs = React.useMemo(() => composeRefs<HTMLDivElement>(setPanelNode, ref), [ref]);

    // See this component's own doc comment for why an observer, not context,
    // is what bridges phase -> data-state here.
    React.useLayoutEffect(() => {
      if (!panelNode) return;
      const host = panelNode.closest("[data-scrollsheet-state]");
      if (!host) {
        // Defensive default for a panel with no data-scrollsheet-state
        // ancestor to observe (see this component's doc comment — today
        // that's the no-<dialog> fallback path, which never reaches here at
        // all since its ref is never forwarded). ctx.open is the only
        // signal available in that shape.
        setDataState(ctx.open ? "open" : "closed");
        return;
      }
      const sync = () =>
        setDataState(phaseToDataState(host.getAttribute("data-scrollsheet-state")));
      sync();
      const observer = new MutationObserver(sync);
      observer.observe(host, { attributes: true, attributeFilter: ["data-scrollsheet-state"] });
      return () => observer.disconnect();
    }, [panelNode, ctx.open]);

    // Dev-only, grouped by what each prop is FOR rather than one combined
    // warning — each group teaches its own replacement recipe (or states
    // plainly that there isn't one), so a consumer using only one Radix
    // prop sees only the guidance relevant to it. Nothing outside these
    // guards reads the computed ignored-lists, so a production build folds
    // each whole block away, string and all.
    if (process.env.NODE_ENV !== "production") {
      const outsidePointerIgnored = collectIgnored([
        ["onPointerDownOutside", onPointerDownOutside],
        ["onInteractOutside", onInteractOutside],
      ]);
      if (outsidePointerIgnored.length > 0) {
        warnOnce(
          "dialog-content-outside-pointer",
          `[scrollsheet Dialog] These <Dialog.Content> props from @radix-ui/react-dialog have no effect in this compat layer and are stripped before reaching the DOM: ${outsidePointerIgnored.join(", ")}. scrollsheet dismisses on backdrop CLICK, not pointerdown (see Content's doc comment for why) — preventDefault-on-outside to keep the dialog open becomes backdropDismissible={false} on <Dialog.Root>.`,
        );
      }

      if (onEscapeKeyDown !== undefined) {
        warnOnce(
          "dialog-content-escape-key",
          "[scrollsheet Dialog] <Dialog.Content onEscapeKeyDown> has no effect in this compat layer and is stripped before reaching the DOM. preventDefault-on-Escape to keep the dialog open becomes escapeDismissible={false} on <Dialog.Root>.",
        );
      }

      const focusIgnored = collectIgnored([
        ["onOpenAutoFocus", onOpenAutoFocus],
        ["onCloseAutoFocus", onCloseAutoFocus],
        ["onFocusOutside", onFocusOutside],
      ]);
      if (focusIgnored.length > 0) {
        warnOnce(
          "dialog-content-focus",
          `[scrollsheet Dialog] These <Dialog.Content> props from @radix-ui/react-dialog have no effect in this compat layer and are stripped before reaching the DOM: ${focusIgnored.join(", ")}. The native <dialog> manages focus itself — there is no scrollsheet equivalent to hook into.`,
        );
      }

      if (forceMount !== undefined) {
        warnOnce(
          "dialog-content-force-mount",
          "[scrollsheet Dialog] <Dialog.Content forceMount> has no effect in this compat layer and is stripped before reaching the DOM. scrollsheet's own phase machine already keeps Content mounted through its exit animation — there is no separate mount-forcing lever.",
        );
      }
    }

    return <SheetContent {...props} ref={setRefs} data-state={dataState} />;
  },
);

/* ── Title / Description / Close ─────────────────────────────────────── */

/**
 * Sheet.Close's self-closing form renders a styled ✕ default; real Radix
 * `<Dialog.Close />` renders an empty, unstyled button (no default children
 * at all). A migrating consumer must not get a surprise icon button from a
 * version swap, so the compat Close pins children to null (defined, so the
 * styled-default branch never arms) unless the caller passed some — the
 * same fix vaul's own compat Close needed (src/drawer/index.tsx).
 */
const DialogClose = /* @__PURE__ */ React.forwardRef<HTMLButtonElement, SheetCloseProps>(
  function DialogClose({ children, ...props }, ref) {
    return (
      <Close {...props} ref={ref}>
        {children ?? null}
      </Close>
    );
  },
);

export { Title, Description, DialogClose as Close };
export type {
  SheetTitleProps as DialogTitleProps,
  SheetDescriptionProps as DialogDescriptionProps,
  SheetCloseProps as DialogCloseProps,
};

/* ── Namespace ────────────────────────────────────────────────────────── */

/** Namespace-style access matching Radix's `<Dialog.Root>…</Dialog.Root>` shape. */
export const Dialog = {
  Root,
  Trigger,
  Portal,
  Overlay,
  Content,
  Close: DialogClose,
  Title,
  Description,
};
